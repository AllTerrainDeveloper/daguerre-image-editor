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
 *
 * This module is the facade, and it is deliberately thin. What used to be
 * thirty-five methods on one class is now three groups a caller can be handed
 * separately -- `view`, `paint`, `pixels` -- plus the handful of verbs that act on the
 * engine as a whole.
 */

import { clampCanvas } from '../../model/document';
import type { CanvasSize, Layer } from '../../model/document';
import type { Histogram } from '../histogram';
import type { Curves, Levels } from '../lut';
import type { Op } from '../../model/recipe';
import type { OpSchema } from '../../types';
import { AdjustPipeline } from './adjust-pipeline';
import { DocumentCompositor } from './compositor';
import { GpuContext } from './gpu';
import type { GpuSprite, GpuTexture } from './gpu';
import { HistogramProbe } from './histogram-probe';
import { LayerTextures } from './layer-textures';
import { makeRenderSprite, renderFull } from './offscreen';
import type { OffscreenContext } from './offscreen';
import { PaintApi } from './paint-api';
import { ViewController } from './view-controller';
import { rendererDebugState } from './debug';
import { ScreenFilters } from './screen-filters';

export interface RendererOptions {
	/** Element the canvas fills. */
	host: HTMLElement;
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

export type { Viewport } from './camera';
export type { PixelRect } from './paint-ops';
export type { PaintApi } from './paint-api';
export type { ViewController } from './view-controller';

/**
 * Owns the canvas, the textures and the adjustment filter.
 */
export class EditorRenderer {
	/** Where the picture sits on screen: fit, zoom, pan, viewport. */
	readonly view: ViewController;

	/** Everything that writes pixels into a layer. */
	readonly paint: PaintApi;

	/** Reads off the composed document. */
	readonly pixels: DocumentCompositor;

	/** Which layer painting acts on. */
	activeLayerId = '';

	private gpu: GpuContext;

	private adjust: AdjustPipeline;

	private layers: LayerTextures;

	private histogram: HistogramProbe;

	private maxRenderPixels: number;

	/** Full-resolution texture. Never scaled; the source of truth for saving. */
	private texture: GpuTexture | null = null;

	/** Sprite shown on screen, scaled to fit the viewport. */
	private sprite: GpuSprite | null = null;

	private filters: ScreenFilters;

	/** The output surface. Independent of the layers drawn onto it. */
	private canvas: CanvasSize = { width: 0, height: 0 };

	/** The layer stack, back to front. */
	private stack: Layer[] = [];

	private destroyed = false;

	/**
	 * @param gpu     Drawing context.
	 * @param options Renderer options.
	 */
	private constructor( gpu: GpuContext, options: RendererOptions ) {
		this.gpu = gpu;
		this.maxRenderPixels = options.maxRenderPixels;
		this.adjust = new AdjustPipeline( gpu, options.schema );
		this.filters = new ScreenFilters( gpu, this.adjust );
		this.layers = new LayerTextures( gpu );
		this.pixels = new DocumentCompositor( gpu, this.layers );

		this.view = new ViewController( gpu, options.host, {
			sprite: () => this.sprite,
			size: () => this.displaySize(),
			textures: () => [
				this.texture,
				this.pixels.texture as GpuTexture | null,
				...this.layers.all(),
			],
		} );

		this.paint = new PaintApi( {
			gpu,
			layers: this.layers,
			canvas: () => this.canvas,
			onChange: () => this.recompose(),
		} );

		this.histogram = new HistogramProbe( gpu, {
			size: () => ( this.texture ? this.displaySize() : null ),
			sprite: ( scale ) => makeRenderSprite( this.offscreen(), scale ),
		} );
	}

	/**
	 * Boots Pixi and attaches a canvas to the host element.
	 *
	 * @param options Renderer options.
	 */
	static async create( options: RendererOptions ): Promise< EditorRenderer > {
		return new EditorRenderer( await GpuContext.create( options.host ), options );
	}

	/** The texture every downstream stage reads. */
	private displayTexture(): GpuTexture | null {
		return ( this.pixels.texture as GpuTexture | null ) ?? this.texture;
	}

	/** Size of the texture every downstream stage reads. */
	private displaySize(): CanvasSize {
		const texture = this.displayTexture();

		return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
	}

	/** What an offscreen render runs against. */
	private offscreen(): OffscreenContext {
		return {
			gpu: this.gpu,
			adjust: this.adjust,
			texture: () => this.displayTexture(),
		};
	}

	/**
	 * Redraws the document and brings the display back in line with it.
	 *
	 * A newly created render texture starts on linear sampling, so the mode the
	 * current zoom calls for is re-applied rather than waiting for the next fit.
	 */
	private recompose(): void {
		this.pixels.compose( this.canvas, this.stack, this.texture );

		if ( this.sprite ) {
			const texture = this.displayTexture();

			if ( texture ) {
				this.sprite.texture = texture;
			}

			this.view.applySampling();
		}

		this.histogram.schedule();
	}

	/**
	 * Replaces the image being edited.
	 *
	 * @param image Decoded, untainted image element.
	 */
	setImage( image: HTMLImageElement ): void {
		this.releaseImage();

		this.texture = this.gpu.textureFrom( image );
		this.sprite = this.gpu.sprite( this.texture );
		this.sprite.anchor.set( 0.5 );

		this.filters.attach( this.sprite );
		this.gpu.stage.addChild( this.sprite );

		this.view.fit();
		this.histogram.schedule();
	}

	/**
	 * Replaces the document and recomposes it.
	 *
	 * @param canvas        Output surface size.
	 * @param layers        Layer stack, back to front.
	 * @param activeLayerId Which layer painting acts on.
	 */
	setDocument( canvas: CanvasSize, layers: Layer[], activeLayerId: string ): void {
		this.canvas = clampCanvas( canvas, this.maxRenderPixels );
		this.stack = layers;
		this.activeLayerId = activeLayerId;

		this.recompose();
		this.view.fit();
	}

	/**
	 * Frees textures for layers that can no longer come back.
	 *
	 * @param reachable Layer ids still referenced anywhere the user can return to.
	 */
	retainLayers( reachable: Set< string > ): void {
		this.layers.retain( new Set( this.stack.map( ( l ) => l.id ) ), reachable );
	}

	/**
	 * Rebuilds the tone table from curves and levels.
	 *
	 * @param curves Curve set.
	 * @param levels Levels.
	 */
	setTone( curves: Curves, levels: Levels ): void {
		this.filters.setTone( curves, levels );
		this.histogram.schedule();
	}

	/**
	 * Sets the adjustments to render.
	 *
	 * @param ops Recipe ops.
	 */
	setOps( ops: Op[] ): void {
		this.filters.setOps( ops, this.blurTarget() );
		this.histogram.schedule();
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
		if ( this.filters.setBypass( bypass ) ) {
			this.histogram.schedule();
		}
	}

	/** The width a blur radius should be scaled against. */
	private blurTarget(): number {
		return this.view.viewport()?.width ?? this.displaySize().width;
	}

	/**
	 * Subscribes to histogram updates.
	 *
	 * @param listener Called after each recomputation.
	 * @return Unsubscribe function.
	 */
	onHistogram( listener: ( histogram: Histogram ) => void ): () => void {
		return this.histogram.subscribe( listener );
	}

	/** Reads the image alone, with every painted layer left out. */
	readPristinePixels() {
		return this.pixels.readPristine( this.canvas, this.stack, this.texture );
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
	 * Pixel dimensions of what the edit currently produces.
	 *
	 * The canvas size once a document is composed -- which is what the save path and
	 * the info panel both want.
	 */
	get sourceSize(): CanvasSize {
		return this.displaySize();
	}

	/**
	 * Renders the edit at full resolution and encodes it.
	 *
	 * @param format  Output MIME type.
	 * @param quality Encoder quality, 0..1. Ignored for PNG.
	 * @return The encoded image.
	 * @throws {Error} When the image is too large, or encoding fails.
	 */
	renderFull( format: string, quality: number ): Promise< Blob > {
		return renderFull( this.offscreen(), format, quality, this.maxRenderPixels );
	}

	/** Internal state, for diagnosing render problems from the console. */
	debugState(): Record< string, unknown > {
		return rendererDebugState( {
			canvas: this.canvas,
			stack: this.stack,
			layers: this.layers,
			source: this.texture,
			document: this.pixels.texture as GpuTexture | null,
			zoom: this.view.zoom,
			spriteScale: this.sprite ? Math.abs( this.sprite.scale.x ) : null,
		} );
	}

	/** Tears down the texture, sprite and filter without touching the app. */
	private releaseImage(): void {
		this.pixels.release();
		this.layers.releaseAll();

		if ( this.sprite ) {
			this.sprite.destroy( { children: true } );
			this.sprite = null;
		}

		this.filters.release();
		this.texture?.destroy( true );
		this.texture = null;
	}

	/** Releases everything. */
	destroy(): void {
		if ( this.destroyed ) {
			return;
		}

		this.destroyed = true;

		this.histogram.stop();
		this.view.destroy();
		this.releaseImage();
		this.adjust.release();
		this.layers.releaseMask();
		this.gpu.destroy();
	}
}
