/**
 * The Pixi application, behind a surface this plugin actually uses.
 *
 * Every other module in this package draws through here rather than reaching for
 * `app.renderer` itself. That is worth the indirection twice over: it keeps the narrow
 * Pixi surface the engine is typed against in one file, and it is the only place the
 * two easy-to-get-wrong rules live -- that a render root never gets its blend mode
 * applied, and that a render texture has to be destroyed with its source.
 */

import { loadPixi } from '../pixi-loader';
import type { Pixi } from '../pixi-loader';

/** A Pixi texture, in the narrow form this engine uses. */
export type GpuTexture = InstanceType< Pixi[ 'Texture' ] >;

/** A Pixi render target. */
export type GpuTarget = InstanceType< Pixi[ 'RenderTexture' ] >;

/** A Pixi sprite. */
export type GpuSprite = InstanceType< Pixi[ 'Sprite' ] >;

/** A Pixi container. */
export type GpuContainer = InstanceType< Pixi[ 'Container' ] >;

/** Raw pixels read back off the GPU. */
export interface PixelReadback {
	pixels: Uint8ClampedArray;
	width: number;
	height: number;
}

/**
 * Owns the Pixi application and the drawing primitives built on it.
 */
export class GpuContext {
	readonly pixi: Pixi;

	readonly app: InstanceType< Pixi[ 'Application' ] >;

	/** One white pixel, stretched into an eraser stencil when a region is restored. */
	private solid: GpuTexture | null = null;

	/**
	 * @param pixi The Pixi namespace.
	 * @param app  An initialised application.
	 */
	private constructor( pixi: Pixi, app: InstanceType< Pixi[ 'Application' ] > ) {
		this.pixi = pixi;
		this.app = app;
	}

	/**
	 * Boots Pixi and attaches a canvas to a host element.
	 *
	 * WebGL is requested explicitly rather than letting Pixi prefer WebGPU. The
	 * adjustment filter ships a GLSL program only, and Pixi silently *skips* a
	 * filter that has no program for the active backend -- which would show the
	 * unedited image with no error at all. Pinning the backend makes that
	 * impossible. Adding a WGSL program later is what would lift this.
	 *
	 * @param host Element the canvas fills.
	 */
	static async create( host: HTMLElement ): Promise< GpuContext > {
		const pixi = await loadPixi();
		const app = new pixi.Application();

		await app.init( {
			preference: 'webgl',
			backgroundAlpha: 0,
			antialias: false,
			autoDensity: true,
			resolution: window.devicePixelRatio || 1,
		} );

		app.canvas.classList.add( 'lz-canvas' );
		host.appendChild( app.canvas as unknown as Node );

		return new GpuContext( pixi, app );
	}

	/** The drawing surface, in CSS pixels. */
	get screen(): { width: number; height: number } {
		return this.app.renderer.screen;
	}

	/** The root container everything on screen hangs off. */
	get stage(): GpuContainer {
		return this.app.stage;
	}

	/**
	 * Matches the drawing surface to a size.
	 *
	 * @param width  Width in CSS pixels.
	 * @param height Height in CSS pixels.
	 */
	resize( width: number, height: number ): void {
		const screen = this.app.renderer.screen;

		if ( screen.width !== width || screen.height !== height ) {
			this.app.renderer.resize( width, height );
		}
	}

	/**
	 * Creates a render target.
	 *
	 * @param width  Width in pixels.
	 * @param height Height in pixels.
	 */
	createTarget( width: number, height: number ): GpuTarget {
		return this.pixi.RenderTexture.create( {
			width: Math.max( 1, Math.round( width ) ),
			height: Math.max( 1, Math.round( height ) ),
		} );
	}

	/**
	 * Wraps a source in a texture.
	 *
	 * @param source Decoded pixels.
	 */
	textureFrom( source: HTMLCanvasElement | HTMLImageElement ): GpuTexture {
		return this.pixi.Texture.from( source );
	}

	/** An empty container. */
	container(): GpuContainer {
		return new this.pixi.Container();
	}

	/**
	 * A sprite over a texture.
	 *
	 * @param texture What to draw.
	 */
	sprite( texture: GpuTexture ): GpuSprite {
		return new this.pixi.Sprite( texture );
	}

	/**
	 * Draws a container into a target.
	 *
	 * @param container What to draw.
	 * @param target    Where to draw it. Omit for the screen.
	 * @param clear     Whether to wipe the target first.
	 */
	draw( container: unknown, target: GpuTarget, clear = false ): void {
		this.app.renderer.render( { container: container as never, target, clear } );
	}

	/**
	 * Draws one sprite into a target, honouring its blend mode.
	 *
	 * The wrapping container is not ceremony. A sprite passed as the render *root* is
	 * its own render group, and the batcher never applies a root's blend mode -- so an
	 * `erase` sprite rendered directly paints solid white instead of clearing, with no
	 * error.
	 *
	 * @param sprite What to draw. Destroyed afterwards.
	 * @param target Texture to draw into.
	 * @param clear  Whether to wipe the target first.
	 */
	drawDetached( sprite: GpuSprite, target: GpuTarget, clear = false ): void {
		const holder = this.container();

		holder.addChild( sprite );
		this.draw( holder, target, clear );
		holder.destroy( { children: true } );
	}

	/**
	 * Reads a target back as a canvas.
	 *
	 * @param target Texture to read.
	 */
	extractCanvas( target: GpuTarget ): HTMLCanvasElement {
		return this.app.renderer.extract.canvas( target ) as HTMLCanvasElement;
	}

	/**
	 * Reads a target back as raw bytes.
	 *
	 * @param target Texture to read.
	 */
	extractPixels( target: GpuTarget ): PixelReadback {
		const { pixels } = this.app.renderer.extract.pixels( target );

		return { pixels, width: target.width, height: target.height };
	}

	/**
	 * A one-pixel opaque white texture, used as an eraser stencil.
	 *
	 * Built here rather than taken from `Texture.WHITE` so the narrow Pixi surface this
	 * engine is typed against stays narrow.
	 */
	solidTexture(): GpuTexture {
		if ( ! this.solid ) {
			const canvas = document.createElement( 'canvas' );

			canvas.width = 1;
			canvas.height = 1;

			const ctx = canvas.getContext( '2d' );

			if ( ctx ) {
				ctx.fillStyle = '#fff';
				ctx.fillRect( 0, 0, 1, 1 );
			}

			this.solid = this.textureFrom( canvas );
		}

		return this.solid;
	}

	/**
	 * Whether a texture can be rendered into.
	 *
	 * @param texture Texture to test.
	 */
	isTarget( texture: GpuTexture ): boolean {
		return texture instanceof this.pixi.RenderTexture;
	}

	/**
	 * Releases the application.
	 *
	 * `destroy( true )` on the Application is deliberately *not* used: it releases
	 * Pixi's global resource registries, which corrupts any other Pixi application
	 * alive on the page. Desktop Mode runs its own -- wallpapers, widgets, games --
	 * so taking that shortcut here would break unrelated windows.
	 */
	destroy(): void {
		this.solid = null;
		this.app.destroy( { removeView: true }, { children: true, texture: true } );
	}
}
