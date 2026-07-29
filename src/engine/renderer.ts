/**
 * The Pixi-backed render engine.
 *
 * The source texture is always full resolution, but interaction never pays for it.
 * Pixi runs a filter at the *rendered* size of the object it is attached to, and
 * the on-screen sprite is scaled to fit the viewport -- so dragging a slider on a
 * 6000px photograph costs the same as dragging one on a 1200px thumbnail. The
 * viewport is the proxy; there is no second texture to keep in sync.
 *
 * Saving re-runs the identical filter against the unscaled texture. The two agree
 * because every phase-1 op is per-pixel colour maths with no spatial radius, so the
 * result is genuinely resolution-independent. An op with a pixel radius -- blur,
 * sharpen, grain -- would break that and must scale its radius with the render size
 * when those land in a later phase.
 */

import { composeAdjustments } from './color-matrix';
import type { AdjustUniforms } from './color-matrix';
import { BASE_LAYER_ID, clampCanvas } from '../model/document';
import type { CanvasSize, Layer } from '../model/document';
import { computeHistogram, emptyHistogram } from './histogram';
import type { Histogram } from './histogram';
import { buildLut, isIdentityCurves, isIdentityLevels } from './lut';
import type { Curves, Levels } from './lut';
import { loadPixi } from './pixi-loader';
import type { Pixi } from './pixi-loader';
import { ADJUST_FRAG, ADJUST_VERT } from './shaders/adjust';
import type { Op } from '../model/recipe';
import type { OpSchema } from '../types';

/** Longest edge of the offscreen target the histogram is measured from. */
const HISTOGRAM_EDGE = 256;

/**
 * Cost above which the histogram starts skipping frames, in milliseconds.
 *
 * Measured on a mid-range laptop, a full histogram pass at HISTOGRAM_EDGE costs
 * about 4ms -- roughly a quarter of a 60fps frame -- so it runs live on every frame
 * of a slider drag. This budget exists for the machines where that is not true: a
 * weak GPU, a huge viewport, or a browser already under load. Rather than guess at
 * a fixed rate, the renderer times its own work and backs off only when it needs to.
 */
const HISTOGRAM_BUDGET_MS = 8;

/** Most consecutive frames the histogram will skip when it is over budget. */
const HISTOGRAM_MAX_SKIP = 4;

export interface RendererOptions {
	/** Element the canvas fills. */
	host: HTMLElement;
	/** URL of the vendored Pixi build. */
	pixiUrl: string;
	/**
	 * Refuse to render more than this many pixels in one pass.
	 *
	 * An RGBA render target costs four bytes per pixel of GPU memory, so a 100
	 * megapixel image wants 400MB in a single allocation and takes the tab down
	 * with it. Refusing with a clear message beats crashing.
	 */
	maxRenderPixels: number;
	/** Op table, used to skip adjustments sitting at rest. */
	schema: OpSchema;
}

/**
 * Owns the canvas, the texture and the adjustment filter.
 */
export class EditorRenderer {
	private pixi: Pixi;

	private app: InstanceType< Pixi[ 'Application' ] >;

	private host: HTMLElement;

	private schema: OpSchema;

	private maxRenderPixels: number;

	/** Full-resolution texture. Never scaled; the source of truth for saving. */
	private texture: InstanceType< Pixi[ 'Texture' ] > | null = null;

	/** Sprite shown on screen, scaled to fit the viewport. */
	private sprite: InstanceType< Pixi[ 'Sprite' ] > | null = null;

	private filter: InstanceType< Pixi[ 'Filter' ] > | null = null;

	private uniforms: AdjustUniforms = {
		matrix: [],
		vibrance: 0,
		sharpen: 0,
		vignette: 0,
		grain: 0,
		blur: 0,
	};

	/** Separable blur, added to the chain only when the blur op is non-zero. */
	private blurFilter: InstanceType< Pixi[ 'BlurFilter' ] > | null = null;

	/** The output surface. Independent of the layer drawn onto it. */
	private canvas: CanvasSize = { width: 0, height: 0 };

	/** The layer stack, back to front. */
	private layers: Layer[] = [];

	/** Which layer painting acts on. */
	activeLayerId = '';

	/**
	 * Pixel content per layer, keyed by id.
	 *
	 * Kept outside the recipe because it is not describable: an `image` layer maps
	 * to the loaded source texture, and a `raster` layer to a RenderTexture holding
	 * pixels that exist nowhere else.
	 */
	private layerTextures = new Map< string, InstanceType< Pixi[ 'Texture' ] > >();

	/** The selection, rasterised, confining every paint operation. */
	private paintMask: InstanceType< Pixi[ 'Texture' ] > | null = null;

	/** The baked tone table, or null when every curve and level is at rest. */
	private lut: InstanceType< Pixi[ 'Texture' ] > | null = null;

	/**
	 * The composed document: the layer drawn onto the canvas.
	 *
	 * Always present once an image is loaded, because the canvas is what gets saved
	 * and it is no longer guaranteed to be the same shape as the source.
	 */
	private documentTexture: InstanceType< Pixi[ 'RenderTexture' ] > | null = null;

	/** Whether the tone table currently changes anything. */
	private lutActive = false;

	/**
	 * Grain seed, fixed for the lifetime of the renderer.
	 *
	 * Constant rather than per-frame so the grain sits still while a slider is
	 * dragged. Crawling grain reads as a rendering bug, not as film.
	 */
	private readonly seed = Math.floor( Math.random() * 1000 );

	private bypass = false;

	private histogramFrame: number | null = null;

	/** Frames still to skip because the last pass ran over budget. */
	private histogramSkip = 0;

	private histogramListeners = new Set< ( h: Histogram ) => void >();

	private viewportListeners = new Set< () => void >();

	/**
	 * View state: how the canvas is presented, not what it contains.
	 *
	 * Deliberately outside the recipe. Where someone happens to have scrolled is not
	 * part of their edit, and saving it would mean two people opening the same image
	 * disagreed about what the file looks like.
	 */
	private zoom = 1;

	private panX = 0;

	private panY = 0;

	private resizeObserver: ResizeObserver | null = null;

	private destroyed = false;

	private constructor(
		pixi: Pixi,
		app: InstanceType< Pixi[ 'Application' ] >,
		options: RendererOptions
	) {
		this.pixi = pixi;
		this.app = app;
		this.host = options.host;
		this.schema = options.schema;
		this.maxRenderPixels = options.maxRenderPixels;
	}

	/**
	 * Boots Pixi and attaches a canvas to the host element.
	 *
	 * WebGL is requested explicitly rather than letting Pixi prefer WebGPU. The
	 * adjustment filter ships a GLSL program only, and Pixi silently *skips* a
	 * filter that has no program for the active backend -- which would show the
	 * unedited image with no error at all. Pinning the backend makes that
	 * impossible. Adding a WGSL program later is what would lift this.
	 *
	 * @param options Renderer options.
	 */
	static async create( options: RendererOptions ): Promise< EditorRenderer > {
		const pixi = await loadPixi( options.pixiUrl );
		const app = new pixi.Application();

		await app.init( {
			preference: 'webgl',
			backgroundAlpha: 0,
			antialias: false,
			autoDensity: true,
			resolution: window.devicePixelRatio || 1,
		} );

		app.canvas.classList.add( 'dg-canvas' );
		options.host.appendChild( app.canvas as unknown as Node );

		const renderer = new EditorRenderer( pixi, app, options );

		renderer.syncSurface();
		renderer.observeResize();

		return renderer;
	}

	/**
	 * Re-fits whenever the host element changes size.
	 *
	 * A ResizeObserver rather than Pixi's own `resizeTo`, which only listens for
	 * *window* resizes. Hiding the sidebar changes the stage's width without the
	 * window changing at all, so `resizeTo` never fired -- the renderer kept drawing
	 * into the old coordinate space while CSS stretched the canvas element to the
	 * new width. The picture ended up scaled and offset from its own handles.
	 */
	private observeResize(): void {
		if ( typeof ResizeObserver === 'undefined' ) {
			return;
		}

		this.resizeObserver = new ResizeObserver( () => this.fit() );
		this.resizeObserver.observe( this.host );
	}

	/**
	 * Matches the renderer's drawing surface to the host element.
	 *
	 * Called from `fit()` so there is exactly one place that can get this wrong,
	 * and every path that repositions the image goes through it.
	 *
	 * @return The host's size in CSS pixels.
	 */
	private syncSurface(): { width: number; height: number } {
		const bounds = this.host.getBoundingClientRect();
		const width = Math.max( 1, Math.floor( bounds.width ) );
		const height = Math.max( 1, Math.floor( bounds.height ) );
		const screen = this.app.renderer.screen;

		if ( screen.width !== width || screen.height !== height ) {
			this.app.renderer.resize( width, height );
		}

		return { width, height };
	}

	/**
	 * Builds the single-pass adjustment filter.
	 *
	 * `uColorMatrix` is declared with `size: 20` so Pixi uploads it as a GLSL array
	 * uniform rather than a scalar.
	 */
	private buildFilter(): InstanceType< Pixi[ 'Filter' ] > {
		const uniforms = new this.pixi.UniformGroup( {
			uColorMatrix: {
				value: [
					1, 0, 0, 0, 0,
					0, 1, 0, 0, 0,
					0, 0, 1, 0, 0,
					0, 0, 0, 1, 0,
				],
				type: 'f32',
				size: 20,
			},
			uVibrance: { value: 0, type: 'f32' },
			uLutMix: { value: 0, type: 'f32' },
			uSharpen: { value: 0, type: 'f32' },
			uVignette: { value: 0, type: 'f32' },
			uGrain: { value: 0, type: 'f32' },
			uSeed: { value: 0, type: 'f32' },
		} );

		return new this.pixi.Filter( {
			glProgram: this.pixi.GlProgram.from( {
				vertex: ADJUST_VERT,
				fragment: ADJUST_FRAG,
				name: 'daguerre-adjust',
			} ),
			resources: {
				adjustUniforms: uniforms,
				// A second texture needs both its source and its sampler style. Binding
				// only the source leaves the sampler unresolved and the program fails to
				// link -- which surfaces as "Could not initialize shader" and a blank
				// canvas, because Pixi silently skips a filter it could not compile.
				uLut: this.lutTexture().source,
				uLutSampler: this.lutTexture().source.style,
			},
		} );
	}

	/**
	 * The tone lookup table texture, created on first use.
	 *
	 * Sampled with nearest-neighbour filtering. Linear filtering would blend
	 * adjacent entries and quietly soften any hard step a user deliberately put in
	 * a curve.
	 */
	private lutTexture(): InstanceType< Pixi[ 'Texture' ] > {
		if ( ! this.lut ) {
			this.lut = new this.pixi.Texture( {
				source: new this.pixi.BufferImageSource( {
					resource: buildLut(),
					width: 256,
					height: 1,
					scaleMode: 'nearest',
					alphaMode: 'premultiply-alpha-on-upload',
				} ),
			} );
		}

		return this.lut;
	}

	/**
	 * Rebuilds the tone table from curves and levels.
	 *
	 * @param curves Curve set.
	 * @param levels Levels.
	 */
	setTone( curves: Curves, levels: Levels ): void {
		const identity = isIdentityCurves( curves ) && isIdentityLevels( levels );

		const texture = this.lutTexture();
		const source = texture.source as unknown as {
			resource: Uint8Array;
			update: () => void;
		};

		source.resource.set( buildLut( curves, levels ) );
		source.update();

		this.lutActive = ! identity;
		this.applyUniforms();
		this.scheduleHistogram();
	}

	/**
	 * Replaces the document and recomposes it.
	 *
	 * @param canvas Output surface size.
	 * @param layer  Where the image sits on it.
	 */
	setDocument( canvas: CanvasSize, layers: Layer[], activeLayerId: string ): void {
		this.canvas = clampCanvas( canvas, this.maxRenderPixels );
		this.layers = layers;
		this.activeLayerId = activeLayerId;

		this.releaseOrphanTextures();
		this.composeDocument();
		this.fit();
		this.scheduleHistogram();
	}

	/**
	 * Frees textures for layers that no longer exist.
	 *
	 * Without this, deleting a pasted layer would leave its pixels on the GPU for
	 * the lifetime of the editor.
	 */
	private releaseOrphanTextures(): void {
		const live = new Set( this.layers.map( ( layer ) => layer.id ) );

		for ( const [ id, texture ] of this.layerTextures ) {
			if ( live.has( id ) || id === BASE_LAYER_ID ) {
				continue;
			}

			texture.destroy( true );
			this.layerTextures.delete( id );
		}
	}

	/**
	 * Creates a raster layer's backing texture from an image.
	 *
	 * @param id     Layer id.
	 * @param source Decoded pixels.
	 */
	addRasterTexture( id: string, source: HTMLCanvasElement | HTMLImageElement ): void {
		this.layerTextures.get( id )?.destroy( true );
		this.layerTextures.set( id, this.pixi.Texture.from( source ) );
	}

	/**
	 * Creates an empty paintable texture for a layer, canvas-sized.
	 *
	 * @param id Layer id.
	 */
	ensurePaintTexture( id: string ): InstanceType< Pixi[ 'RenderTexture' ] > {
		const existing = this.layerTextures.get( id );

		if ( existing instanceof this.pixi.RenderTexture ) {
			return existing;
		}

		const target = this.pixi.RenderTexture.create( {
			width: Math.max( 1, this.canvas.width ),
			height: Math.max( 1, this.canvas.height ),
		} );

		// A pasted layer arrives as a plain texture, which cannot be rendered into.
		// Painting on one therefore has to promote it first: copy what is there into
		// a render target and swap. Without this a brush stroke on a pasted layer
		// silently does nothing.
		if ( existing ) {
			const sprite = new this.pixi.Sprite( existing );

			sprite.anchor.set( 0.5 );
			sprite.position.set( this.canvas.width / 2, this.canvas.height / 2 );

			this.app.renderer.render( { container: sprite, target, clear: true } );
			sprite.destroy();
			existing.destroy( true );
		}

		this.layerTextures.set( id, target );

		return target;
	}

	/**
	 * Renders a display object into a layer's texture.
	 *
	 * This is how a brush stroke becomes permanent: the stroke is drawn once into
	 * the layer and never re-drawn, so a long painting session costs the same per
	 * frame as an empty one.
	 *
	 * @param id        Layer to paint into.
	 * @param container What to draw.
	 */
	paintInto( id: string, container: unknown ): void {
		const target = this.ensurePaintTexture( id );

		this.app.renderer.render( {
			container: container as never,
			target,
			clear: false,
		} );

		this.composeDocument();
		this.scheduleHistogram();
	}

	/** The native size of whatever backs a layer. */
	layerTextureSize( id: string ): CanvasSize {
		const texture = this.layerTextures.get( id );

		return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
	}

	/**
	 * Sets the mask confining every paint operation.
	 *
	 * @param mask Canvas-sized alpha mask, or null for no confinement.
	 */
	setPaintMask( mask: HTMLCanvasElement | null ): void {
		this.paintMask?.destroy( true );
		this.paintMask = mask ? this.pixi.Texture.from( mask ) : null;
	}

	/**
	 * Wraps a sprite in the current selection mask, if there is one.
	 *
	 * Both the sprite and its mask have to be in the same rendered container, which
	 * is why this returns a holder rather than just setting a property.
	 *
	 * @param sprite What to clip.
	 * @return The container to render, and its teardown.
	 */
	private clipped( sprite: InstanceType< Pixi[ 'Sprite' ] > ): {
		container: InstanceType< Pixi[ 'Container' ] >;
		release: () => void;
	} {
		const holder = new this.pixi.Container();

		holder.addChild( sprite );

		if ( ! this.paintMask ) {
			return { container: holder, release: () => holder.destroy( { children: true } ) };
		}

		const mask = new this.pixi.Sprite( this.paintMask );

		mask.position.set( 0, 0 );
		holder.addChild( mask );
		sprite.mask = mask;

		return {
			container: holder,
			release: () => {
				sprite.mask = null;
				holder.destroy( { children: true } );
			},
		};
	}

	/**
	 * Stamps one brush dab into a layer.
	 *
	 * The stamp is white with its shape in the alpha, tinted here -- so one cached
	 * stamp serves every colour.
	 *
	 * @param layerId Target layer.
	 * @param image   Stamp canvas.
	 * @param x       Canvas coordinates of the dab centre.
	 * @param y       Canvas coordinates of the dab centre.
	 * @param size    Diameter in canvas pixels.
	 * @param colour  CSS colour.
	 * @param opacity 0..1.
	 * @param erase   Whether to remove rather than add.
	 */
	stampBrush(
		layerId: string,
		image: HTMLCanvasElement,
		x: number,
		y: number,
		size: number,
		colour: string,
		opacity: number,
		erase: boolean
	): void {
		const target = this.ensurePaintTexture( layerId );
		const texture = this.pixi.Texture.from( image );
		const sprite = new this.pixi.Sprite( texture );

		sprite.anchor.set( 0.5 );
		sprite.width = size;
		sprite.height = size;
		sprite.position.set( x, y );
		sprite.alpha = opacity;

		if ( erase ) {
			// Removes the destination's alpha rather than painting over it, which is
			// what makes an eraser reveal the layers beneath instead of a colour.
			sprite.blendMode = 'erase';
		} else {
			sprite.tint = colour;
		}

		// Clipped to the selection, so a round brush cannot spill past its edge --
		// testing the dab's centre alone let half of every edge stroke escape.
		const clip = this.clipped( sprite );

		this.app.renderer.render( { container: clip.container, target, clear: false } );

		clip.release();
		texture.destroy( true );

		this.composeDocument();
		this.scheduleHistogram();
	}

	/**
	 * Paints a full-canvas mask into a layer.
	 *
	 * @param layerId Target layer.
	 * @param mask    Canvas-sized mask, opaque where the fill applies.
	 * @param colour  CSS colour.
	 * @param opacity 0..1.
	 */
	fillWithMask(
		layerId: string,
		mask: HTMLCanvasElement,
		colour: string,
		opacity: number
	): void {
		const target = this.ensurePaintTexture( layerId );
		const texture = this.pixi.Texture.from( mask );
		const sprite = new this.pixi.Sprite( texture );

		sprite.position.set( 0, 0 );
		sprite.alpha = opacity;
		sprite.tint = colour;

		const clip = this.clipped( sprite );

		this.app.renderer.render( { container: clip.container, target, clear: false } );

		clip.release();
		texture.destroy( true );

		this.composeDocument();
		this.scheduleHistogram();
	}

	/**
	 * Composites a bitmap onto a layer.
	 *
	 * The shared destination for everything that is drawn with the 2D context rather
	 * than with a brush stamp: gradients, shapes, text, and the retouching tools'
	 * patches. Clipped by the selection like any other paint operation.
	 *
	 * @param layerId Target layer.
	 * @param source  Bitmap to draw.
	 * @param x       Where its top-left corner lands, in canvas pixels.
	 * @param y       Where its top-left corner lands, in canvas pixels.
	 * @param opacity 0..1.
	 * @param erase   Whether to cut the shape out rather than draw it.
	 */
	compositeCanvas(
		layerId: string,
		source: HTMLCanvasElement,
		x = 0,
		y = 0,
		opacity = 1,
		erase = false
	): void {
		const target = this.ensurePaintTexture( layerId );
		const texture = this.pixi.Texture.from( source );
		const sprite = new this.pixi.Sprite( texture );

		sprite.position.set( Math.round( x ), Math.round( y ) );
		sprite.alpha = opacity;

		if ( erase ) {
			sprite.blendMode = 'erase';
		}

		const clip = this.clipped( sprite );

		this.app.renderer.render( { container: clip.container, target, clear: false } );

		clip.release();
		texture.destroy( true );

		this.composeDocument();
		this.scheduleHistogram();
	}

	/**
	 * Reads one composed pixel.
	 *
	 * @param x Canvas coordinate.
	 * @param y Canvas coordinate.
	 * @return Channels 0..255, or null when there is nothing there.
	 */
	samplePixel( x: number, y: number ): [ number, number, number, number ] | null {
		const read = this.readDocumentPixels();

		if ( ! read ) {
			return null;
		}

		const px = Math.round( x );
		const py = Math.round( y );

		if ( px < 0 || py < 0 || px >= read.width || py >= read.height ) {
			return null;
		}

		const index = ( py * read.width + px ) * 4;

		return [
			read.pixels[ index ],
			read.pixels[ index + 1 ],
			read.pixels[ index + 2 ],
			read.pixels[ index + 3 ],
		];
	}

	/**
	 * Reads the image alone, with every painted layer left out.
	 *
	 * What the history brush paints from. Composed on demand rather than snapshotted at
	 * load, because holding a second full-resolution copy of a twenty-megapixel photo
	 * for the whole session -- against the chance that one brush gets used -- is the
	 * kind of cost that only shows up on someone else's machine.
	 *
	 * @return Canvas-aligned pixels, or null when nothing is loaded.
	 */
	readPristinePixels():
		| { pixels: Uint8ClampedArray; width: number; height: number }
		| null {
		const base = this.layerTextures.get( BASE_LAYER_ID ) ?? this.texture;
		const layer = this.layers.find( ( entry ) => entry.id === BASE_LAYER_ID );

		if ( ! base || ! layer || this.canvas.width <= 0 || this.canvas.height <= 0 ) {
			return null;
		}

		const target = this.pixi.RenderTexture.create( {
			width: this.canvas.width,
			height: this.canvas.height,
		} );
		const sprite = new this.pixi.Sprite( base );
		const { x, y, scaleX, scaleY, rotation, flipH, flipV } = layer.transform;

		sprite.anchor.set( 0.5 );
		sprite.scale.set( scaleX * ( flipH ? -1 : 1 ), scaleY * ( flipV ? -1 : 1 ) );
		sprite.rotation = ( rotation * Math.PI ) / 180;
		sprite.position.set( x * this.canvas.width, y * this.canvas.height );

		this.app.renderer.render( { container: sprite, target, clear: true } );

		const { pixels } = this.app.renderer.extract.pixels( target );

		sprite.destroy();
		target.destroy( true );

		return { pixels, width: this.canvas.width, height: this.canvas.height };
	}

	/** Reads the composed document as raw bytes, for flood fill. */
	readDocumentPixels(): { pixels: Uint8ClampedArray; width: number; height: number } | null {
		if ( ! this.documentTexture ) {
			return null;
		}

		const { pixels } = this.app.renderer.extract.pixels( this.documentTexture );

		return {
			pixels,
			width: this.documentTexture.width,
			height: this.documentTexture.height,
		};
	}

	/** Reads the composed document back as pixels, for copy. */
	extractRegion(
		x: number,
		y: number,
		width: number,
		height: number
	): HTMLCanvasElement | null {
		if ( ! this.documentTexture || width < 1 || height < 1 ) {
			return null;
		}

		const full = this.app.renderer.extract.canvas(
			this.documentTexture
		) as HTMLCanvasElement;

		const out = document.createElement( 'canvas' );
		out.width = Math.round( width );
		out.height = Math.round( height );

		const context = out.getContext( '2d' );

		if ( ! context ) {
			return null;
		}

		context.drawImage(
			full,
			Math.round( x ),
			Math.round( y ),
			out.width,
			out.height,
			0,
			0,
			out.width,
			out.height
		);

		return out;
	}

	/** The current output surface size. */
	get canvasSize(): CanvasSize {
		return { ...this.canvas };
	}

	/** Native pixel dimensions of the loaded image. */
	get imageSize(): CanvasSize {
		return {
			width: this.texture?.width ?? 0,
			height: this.texture?.height ?? 0,
		};
	}

	/**
	 * Draws the layer onto the canvas.
	 *
	 * Everything downstream -- the on-screen sprite, the histogram probe, the save --
	 * reads this one texture, so the adjustment pipeline never has to know how the
	 * image was positioned.
	 *
	 * Critically, this depends only on the canvas size, never on the viewport. That
	 * is what lets a transform handle be dragged without the surface moving under the
	 * drag.
	 */
	private composeDocument(): void {
		this.documentTexture?.destroy( true );
		this.documentTexture = null;

		if ( ! this.texture || this.canvas.width <= 0 || this.canvas.height <= 0 ) {
			this.rebindDisplay();

			return;
		}

		// The base image layer's texture is the loaded source.
		if ( ! this.layerTextures.has( BASE_LAYER_ID ) ) {
			this.layerTextures.set( BASE_LAYER_ID, this.texture );
		}

		const target = this.pixi.RenderTexture.create( {
			width: this.canvas.width,
			height: this.canvas.height,
		} );

		const stack = new this.pixi.Container();

		for ( const layer of this.layers ) {
			const texture = this.layerTextures.get( layer.id );

			if ( ! texture || ! layer.visible || layer.opacity <= 0 ) {
				continue;
			}

			const sprite = new this.pixi.Sprite( texture );
			const { x, y, scaleX, scaleY, rotation, flipH, flipV } = layer.transform;

			sprite.anchor.set( 0.5 );
			sprite.scale.set(
				scaleX * ( flipH ? -1 : 1 ),
				scaleY * ( flipV ? -1 : 1 )
			);
			sprite.rotation = ( rotation * Math.PI ) / 180;
			sprite.position.set( x * this.canvas.width, y * this.canvas.height );
			sprite.alpha = layer.opacity;

			stack.addChild( sprite );
		}

		this.app.renderer.render( { container: stack, target, clear: true } );
		stack.destroy( { children: true } );

		this.documentTexture = target;
		this.rebindDisplay();

		// A newly created render texture starts on linear, so re-apply whatever the
		// current zoom calls for rather than waiting for the next fit().
		if ( this.sprite ) {
			this.applySampling( Math.abs( this.sprite.scale.x ) );
		}
	}

	/** The texture every downstream stage reads. */
	private displayTexture(): InstanceType< Pixi[ 'Texture' ] > | null {
		return ( this.documentTexture as InstanceType< Pixi[ 'Texture' ] > | null ) ?? this.texture;
	}

	/** Points the on-screen sprite at the current display texture. */
	private rebindDisplay(): void {
		const texture = this.displayTexture();

		if ( this.sprite && texture ) {
			this.sprite.texture = texture;
		}
	}

	/**
	 * Replaces the image being edited.
	 *
	 * @param image Decoded, untainted image element.
	 */
	setImage( image: HTMLImageElement ): void {
		this.releaseImage();

		this.texture = this.pixi.Texture.from( image );
		this.sprite = new this.pixi.Sprite( this.texture );
		this.sprite.anchor.set( 0.5 );

		this.filter = this.buildFilter();
		this.rebuildFilterChain();
		this.sprite.filters ??= [ this.filter ];

		this.app.stage.addChild( this.sprite );

		this.fit();
		this.applyUniforms();
		this.scheduleHistogram();
	}

	/**
	 * Pixel dimensions of what the edit currently produces.
	 *
	 * This is the canvas size once a document is composed -- which is what the save
	 * path and the info panel both want.
	 */
	get sourceSize(): { width: number; height: number } {
		const texture = this.displayTexture();

		return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
	}

	/**
	 * Scales and centres the sprite to fit the host, never magnifying past 1:1.
	 *
	 * Upscaling a small image to fill the viewport would show interpolation
	 * artefacts and mislead the user about the detail they actually have.
	 */
	fit(): void {
		const bounds = this.syncSurface();
		const texture = this.displayTexture();

		if ( ! this.sprite || ! texture ) {
			return;
		}

		// Inset accounts for the rulers when they are showing, so fitting never
		// tucks the image under them.
		const gutter = this.host.classList.contains( 'has-rulers' ) ? 20 : 0;
		const available = {
			width: Math.max( 1, bounds.width - 48 - gutter ),
			height: Math.max( 1, bounds.height - 48 - gutter ),
		};

		const fitted = Math.min(
			available.width / texture.width,
			available.height / texture.height,
			1
		);

		const effective = fitted * this.zoom;

		this.sprite.scale.set( effective );
		this.applySampling( effective );
		this.sprite.position.set(
			( bounds.width + gutter ) / 2 + this.panX,
			( bounds.height + gutter ) / 2 + this.panY
		);

		for ( const listener of this.viewportListeners ) {
			listener();
		}
	}

	/**
	 * Switches every texture between smooth and pixelated sampling.
	 *
	 * Past 1:1 the user is inspecting individual pixels and wants to see squares;
	 * below it they are looking at the picture and linear sampling is what stops a
	 * downscale aliasing.
	 *
	 * Applied to *every* texture in the chain, not just the one on screen. The
	 * source image is resampled when it is composited into the document, and the
	 * document is resampled again through the adjustment filter -- so leaving any
	 * link on linear reintroduces the smoothing the last link just removed. That is
	 * exactly what made zooming still look soft after the display texture alone was
	 * switched.
	 *
	 * @param effective On-screen scale, where 1 is one canvas pixel per CSS pixel.
	 */
	private applySampling( effective: number ): void {
		const wanted = effective > 1.05 ? 'nearest' : 'linear';

		const apply = ( texture: InstanceType< Pixi[ 'Texture' ] > | null ) => {
			if ( ! texture ) {
				return;
			}

			const source = texture.source as unknown as {
				scaleMode: string;
				style?: { scaleMode: string; update?: () => void };
			};

			if ( source.scaleMode === wanted ) {
				return;
			}

			source.scaleMode = wanted;

			// Pixi caches the sampler state on the style, so the change has to be
			// announced or the GPU keeps the old filter.
			if ( source.style ) {
				source.style.scaleMode = wanted;
				source.style.update?.();
			}
		};

		apply( this.texture );
		apply( this.documentTexture as InstanceType< Pixi[ 'Texture' ] > | null );

		for ( const texture of this.layerTextures.values() ) {
			apply( texture );
		}
	}

	/**
	 * Where the image sits inside the stage, in CSS pixels.
	 *
	 * The crop overlay needs this to draw a rectangle over the image rather than
	 * over the letterboxing around it.
	 *
	 * @return Viewport rectangle, or null when nothing is loaded.
	 */
	getViewport(): { x: number; y: number; width: number; height: number } | null {
		const texture = this.displayTexture();

		if ( ! this.sprite || ! texture ) {
			return null;
		}

		const bounds = this.app.renderer.screen;
		const scale = Math.abs( this.sprite.scale.x );
		const width = texture.width * scale;
		const height = texture.height * scale;

		const gutter = this.host.classList.contains( 'has-rulers' ) ? 20 : 0;

		return {
			x: ( bounds.width - width + gutter ) / 2 + this.panX,
			y: ( bounds.height - height + gutter ) / 2 + this.panY,
			width,
			height,
		};
	}

	/**
	 * Subscribes to viewport changes, so overlays can follow a resize.
	 *
	 * @param listener Called after each re-fit.
	 * @return Unsubscribe function.
	 */
	onViewportChange( listener: () => void ): () => void {
		this.viewportListeners.add( listener );

		return () => {
			this.viewportListeners.delete( listener );
		};
	}

	/**
	 * Scrolls the pasteboard.
	 *
	 * @param dx Horizontal movement in CSS pixels.
	 * @param dy Vertical movement in CSS pixels.
	 */
	pan( dx: number, dy: number ): void {
		this.panX += dx;
		this.panY += dy;
		this.fit();
	}

	/**
	 * Zooms about a point, keeping whatever is under it in place.
	 *
	 * Anchoring to the pointer rather than to the centre is what makes wheel-zoom
	 * feel like a map instead of a slideshow: the detail you were looking at is
	 * still under the cursor afterwards.
	 *
	 * @param factor  Multiplier on the current zoom.
	 * @param originX Anchor point, in stage CSS pixels.
	 * @param originY Anchor point, in stage CSS pixels.
	 */
	zoomAt( factor: number, originX: number, originY: number ): void {
		const previous = this.zoom;
		const next = Math.min( 16, Math.max( 0.05, previous * factor ) );

		if ( next === previous ) {
			return;
		}

		const bounds = this.app.renderer.screen;
		const centreX = bounds.width / 2 + this.panX;
		const centreY = bounds.height / 2 + this.panY;
		const ratio = next / previous;

		// Move the centre so the anchor point maps to itself at the new zoom.
		this.panX += ( centreX - originX ) * ( ratio - 1 );
		this.panY += ( centreY - originY ) * ( ratio - 1 );
		this.zoom = next;

		this.fit();
	}

	/** Internal state, for diagnosing render problems from the console. */
	debugState(): Record< string, unknown > {
		return {
			canvas: { ...this.canvas },
			layerCount: this.layers.length,
			layers: this.layers.map( ( layer ) => ( {
				id: layer.id,
				kind: layer.kind,
				visible: layer.visible,
				hasTexture: this.layerTextures.has( layer.id ),
				isRenderTexture:
					this.layerTextures.get( layer.id ) instanceof this.pixi.RenderTexture,
			} ) ),
			zoom: this.zoom,
			spriteScale: this.sprite ? Math.abs( this.sprite.scale.x ) : null,
			documentScaleMode: this.documentTexture
				? ( this.documentTexture.source as unknown as { scaleMode: string } ).scaleMode
				: null,
			sourceScaleMode: this.texture
				? ( this.texture.source as unknown as { scaleMode: string } ).scaleMode
				: null,
			hasDocumentTexture: !! this.documentTexture,
			documentSize: this.documentTexture
				? { w: this.documentTexture.width, h: this.documentTexture.height }
				: null,
		};
	}

	/** Current zoom, where 1 means fitted to the stage. */
	get viewZoom(): number {
		return this.zoom;
	}

	/**
	 * Zooms so one canvas pixel covers one CSS pixel.
	 *
	 * `viewZoom` is relative to the fitted size, not absolute, so getting to 100% means
	 * cancelling out whatever the fit came to. Worth having as a method rather than
	 * leaving callers to work it out: the fit ratio is private, and rightly so.
	 */
	zoomToActual(): void {
		const texture = this.displayTexture();

		if ( ! texture || ! this.sprite ) {
			return;
		}

		const fitted = this.sprite.scale.x / Math.max( this.zoom, 1e-6 );

		this.zoom = Math.min( 16, Math.max( 0.05, 1 / Math.max( fitted, 1e-6 ) ) );
		this.panX = 0;
		this.panY = 0;
		this.fit();
	}

	/** Returns the view to a centred, fitted position. */
	resetView(): void {
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
		this.fit();
	}

	/**
	 * Sets the adjustments to render.
	 *
	 * @param ops Recipe ops.
	 */
	setOps( ops: Op[] ): void {
		const previousBlur = this.uniforms.blur;

		this.uniforms = composeAdjustments( ops, this.schema );

		if ( ( previousBlur > 0 ) !== ( this.uniforms.blur > 0 ) ) {
			this.rebuildFilterChain();
		}

		this.applyBlur();
		this.applyUniforms();
		this.scheduleHistogram();
	}

	/**
	 * Adds or removes the blur pass.
	 *
	 * Blur is the one effect that cannot join the single-pass shader: a Gaussian
	 * needs to be separable to be affordable, which means two passes by definition.
	 * It is therefore only in the chain when it is actually doing something, so an
	 * edit without blur still pays for exactly one pass and one quantisation.
	 */
	private rebuildFilterChain(): void {
		if ( ! this.sprite || ! this.filter ) {
			return;
		}

		if ( this.uniforms.blur > 0 ) {
			this.blurFilter ??= new this.pixi.BlurFilter( { strength: 1, quality: 3 } );
			this.sprite.filters = [ this.blurFilter, this.filter ];

			return;
		}

		this.sprite.filters = [ this.filter ];
	}

	/**
	 * Scales the blur radius to whatever is being rendered.
	 *
	 * The stored value is a fraction of the longest edge, so a blur previewed on a
	 * 900px canvas survives being saved at 6000px instead of becoming imperceptible.
	 *
	 * @param renderWidth Optional. Width being rendered; defaults to the on-screen size.
	 */
	private applyBlur( renderWidth?: number ): void {
		if ( ! this.blurFilter || this.uniforms.blur <= 0 ) {
			return;
		}

		const viewport = this.getViewport();
		const width = renderWidth ?? viewport?.width ?? this.sourceSize.width;

		// Cap the fraction: a full-width Gaussian would be minutes of GPU time and
		// is not a photo adjustment anyone wants.
		this.blurFilter.strength = Math.max( 0.1, this.uniforms.blur * 0.04 * width );
	}

	/**
	 * Temporarily shows the unedited image, for a before/after comparison.
	 *
	 * The histogram deliberately keeps tracking the bypassed state too, so holding
	 * the compare key shows you both the original pixels and the original curve.
	 *
	 * @param bypass Whether to skip the adjustments.
	 */
	setBypass( bypass: boolean ): void {
		if ( this.bypass === bypass ) {
			return;
		}

		this.bypass = bypass;
		this.applyUniforms();
		this.scheduleHistogram();
	}

	/** Pushes the current uniforms onto the filter. */
	private applyUniforms(): void {
		if ( ! this.filter ) {
			return;
		}

		const group = ( this.filter.resources as Record< string, { uniforms: Record< string, unknown > } > )
			.adjustUniforms;

		if ( this.bypass ) {
			group.uniforms.uColorMatrix = [
				1, 0, 0, 0, 0,
				0, 1, 0, 0, 0,
				0, 0, 1, 0, 0,
				0, 0, 0, 1, 0,
			];
			group.uniforms.uVibrance = 0;
			group.uniforms.uLutMix = 0;
			group.uniforms.uSharpen = 0;
			group.uniforms.uVignette = 0;
			group.uniforms.uGrain = 0;
			return;
		}

		group.uniforms.uColorMatrix = this.uniforms.matrix;
		group.uniforms.uVibrance = this.uniforms.vibrance;
		group.uniforms.uLutMix = this.lutActive ? 1 : 0;
		group.uniforms.uSharpen = this.uniforms.sharpen;
		group.uniforms.uVignette = this.uniforms.vignette;
		group.uniforms.uGrain = this.uniforms.grain;
		group.uniforms.uSeed = this.seed;
	}

	/**
	 * Subscribes to histogram updates.
	 *
	 * @param listener Called after each recomputation.
	 * @return Unsubscribe function.
	 */
	onHistogram( listener: ( histogram: Histogram ) => void ): () => void {
		this.histogramListeners.add( listener );

		return () => {
			this.histogramListeners.delete( listener );
		};
	}

	/**
	 * Queues a histogram recomputation for the next animation frame.
	 *
	 * A slider drag fires many pointer moves per frame, so the work is coalesced to
	 * one pass per frame -- the display cannot show more than that anyway. Aligning
	 * to the frame also means the readback happens once the frame's drawing is
	 * already queued, rather than interleaved with it.
	 */
	private scheduleHistogram(): void {
		if ( this.histogramFrame !== null ) {
			return;
		}

		this.histogramFrame = window.requestAnimationFrame( () => {
			this.histogramFrame = null;

			if ( this.histogramSkip > 0 ) {
				this.histogramSkip--;
				// Re-arm, so the final state still gets a histogram even while
				// backing off.
				this.scheduleHistogram();
				return;
			}

			this.emitHistogram();
		} );
	}

	/**
	 * Renders a small copy, reads it back, and notifies listeners.
	 *
	 * Times itself and sets a skip count when it runs long. Reading pixels back
	 * forces a synchronous flush of the GPU pipeline, and how expensive that is
	 * depends entirely on the machine -- so rather than assume a rate, measure and
	 * adapt. On hardware where the pass is cheap this never skips anything.
	 */
	private emitHistogram(): void {
		if ( this.destroyed || ! this.texture || this.histogramListeners.size === 0 ) {
			return;
		}

		const started = performance.now();
		let target: InstanceType< Pixi[ 'RenderTexture' ] > | null = null;

		try {
			const { width, height } = this.scaleToFit( HISTOGRAM_EDGE );

			target = this.pixi.RenderTexture.create( { width, height } );

			const probe = this.makeRenderSprite( width / ( this.displayTexture()?.width ?? width ) );

			this.app.renderer.render( { container: probe, target, clear: true } );

			const { pixels } = this.app.renderer.extract.pixels( target );

			probe.destroy( { children: true } );

			this.notifyHistogram( computeHistogram( pixels ) );
		} catch {
			// A lost GPU context or a tainted canvas both land here. The image is
			// still perfectly editable, so degrade to an empty plot rather than
			// failing the whole editor.
			this.notifyHistogram( emptyHistogram() );
		} finally {
			target?.destroy( true );
		}

		const cost = performance.now() - started;

		this.histogramSkip =
			cost > HISTOGRAM_BUDGET_MS
				? Math.min( HISTOGRAM_MAX_SKIP, Math.ceil( cost / HISTOGRAM_BUDGET_MS ) - 1 )
				: 0;
	}

	/**
	 * Emits a histogram to every listener.
	 *
	 * @param histogram Computed histogram.
	 */
	private notifyHistogram( histogram: Histogram ): void {
		for ( const listener of this.histogramListeners ) {
			listener( histogram );
		}
	}

	/**
	 * Dimensions of the image scaled so its longest edge is at most `edge`.
	 *
	 * @param edge Longest-edge cap.
	 */
	private scaleToFit( edge: number ): { width: number; height: number } {
		const texture = this.displayTexture();
		const w = texture?.width ?? 1;
		const h = texture?.height ?? 1;
		const scale = Math.min( edge / Math.max( w, h ), 1 );

		return {
			width: Math.max( 1, Math.round( w * scale ) ),
			height: Math.max( 1, Math.round( h * scale ) ),
		};
	}

	/**
	 * Builds a throwaway sprite for offscreen rendering.
	 *
	 * A separate sprite rather than the on-screen one, because the on-screen sprite
	 * carries the fit-to-viewport transform and a centred anchor. Offscreen renders
	 * need the image square in the corner at a known scale.
	 *
	 * It gets its own filter instance carrying the same uniforms: a Pixi filter
	 * holds per-instance uniform buffers, so sharing one between two concurrent
	 * render targets is asking for the wrong values on one of them.
	 *
	 * @param scale Scale factor to apply.
	 */
	private makeRenderSprite( scale: number ): InstanceType< Pixi[ 'Sprite' ] > {
		const sprite = new this.pixi.Sprite( this.displayTexture()! );

		sprite.anchor.set( 0 );
		sprite.position.set( 0, 0 );
		sprite.scale.set( scale );

		const filter = this.buildFilter();
		const group = ( filter.resources as Record< string, { uniforms: Record< string, unknown > } > )
			.adjustUniforms;

		group.uniforms.uColorMatrix = this.bypass
			? [ 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0 ]
			: this.uniforms.matrix;
		group.uniforms.uVibrance = this.bypass ? 0 : this.uniforms.vibrance;
		group.uniforms.uLutMix = ! this.bypass && this.lutActive ? 1 : 0;
		group.uniforms.uSharpen = this.bypass ? 0 : this.uniforms.sharpen;
		group.uniforms.uVignette = this.bypass ? 0 : this.uniforms.vignette;
		group.uniforms.uGrain = this.bypass ? 0 : this.uniforms.grain;
		group.uniforms.uSeed = this.seed;

		group.uniforms.uSharpen = this.bypass ? 0 : this.uniforms.sharpen;
		group.uniforms.uVignette = this.bypass ? 0 : this.uniforms.vignette;
		group.uniforms.uGrain = this.bypass ? 0 : this.uniforms.grain;
		group.uniforms.uSeed = this.seed;

		if ( ! this.bypass && this.uniforms.blur > 0 ) {
			const blur = new this.pixi.BlurFilter( {
				strength: Math.max(
					0.1,
					this.uniforms.blur * 0.04 * ( this.displayTexture()?.width ?? 1 ) * scale
				),
				quality: 3,
			} );

			sprite.filters = [ blur, filter ];

			return sprite;
		}

		sprite.filters = [ filter ];

		return sprite;
	}

	/**
	 * Renders the edit at full resolution and encodes it.
	 *
	 * Runs the same filter as the preview, against the unscaled texture. Because
	 * every phase-1 op is per-pixel colour maths with no spatial radius, the result
	 * is exactly what the proxy was previewing, just with more pixels.
	 *
	 * @param format  Output MIME type.
	 * @param quality Encoder quality, 0..1. Ignored for PNG.
	 * @return The encoded image.
	 * @throws {Error} When the image is too large, or encoding fails.
	 */
	async renderFull( format: string, quality: number ): Promise< Blob > {
		const texture = this.displayTexture();

		if ( ! texture ) {
			throw new Error( 'No image is loaded.' );
		}

		const { width, height } = texture;

		if ( width * height > this.maxRenderPixels ) {
			throw new Error(
				`This image is too large to render in the browser (${ width }x${ height }).`
			);
		}

		let target: InstanceType< Pixi[ 'RenderTexture' ] > | null = null;
		const sprite = this.makeRenderSprite( 1 );

		try {
			target = this.pixi.RenderTexture.create( { width, height } );

			this.app.renderer.render( { container: sprite, target, clear: true } );

			const canvas = this.app.renderer.extract.canvas( target ) as HTMLCanvasElement;

			return await encodeCanvas( canvas, format, quality );
		} finally {
			sprite.destroy( { children: true } );
			target?.destroy( true );
		}
	}

	/** Tears down the texture, sprite and filter without touching the app. */
	private releaseImage(): void {
		this.documentTexture?.destroy( true );
		this.documentTexture = null;

		for ( const [ id, texture ] of this.layerTextures ) {
			// The base layer's texture is the source, destroyed just below.
			if ( id !== BASE_LAYER_ID ) {
				texture.destroy( true );
			}
		}

		this.layerTextures.clear();

		if ( this.sprite ) {
			this.sprite.destroy( { children: true } );
			this.sprite = null;
		}

		this.filter = null;

		if ( this.texture ) {
			this.texture.destroy( true );
			this.texture = null;
		}
	}

	/**
	 * Releases everything.
	 *
	 * `destroy( true )` on the Application is deliberately *not* used: it releases
	 * Pixi's global resource registries, which corrupts any other Pixi application
	 * alive on the page. Desktop Mode runs its own -- wallpapers, widgets, games --
	 * so taking that shortcut here would break unrelated windows.
	 */
	destroy(): void {
		if ( this.destroyed ) {
			return;
		}

		this.destroyed = true;

		if ( this.histogramFrame !== null ) {
			window.cancelAnimationFrame( this.histogramFrame );
			this.histogramFrame = null;
		}

		this.histogramListeners.clear();
		this.viewportListeners.clear();
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		this.releaseImage();

		this.lut?.destroy( true );
		this.lut = null;
		this.paintMask?.destroy( true );
		this.paintMask = null;

		this.app.destroy( { removeView: true }, { children: true, texture: true } );
	}
}

/**
 * Encodes a canvas, preferring the async path when it exists.
 *
 * @param canvas  Canvas to encode.
 * @param format  MIME type.
 * @param quality Encoder quality, 0..1.
 */
function encodeCanvas(
	canvas: HTMLCanvasElement,
	format: string,
	quality: number
): Promise< Blob > {
	return new Promise( ( resolve, reject ) => {
		canvas.toBlob(
			( blob ) => {
				if ( blob ) {
					resolve( blob );
					return;
				}

				reject(
					new Error(
						`The browser could not encode the image as ${ format }. Try a different format.`
					)
				);
			},
			format,
			quality
		);
	} );
}
