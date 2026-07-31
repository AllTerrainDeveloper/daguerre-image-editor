/**
 * Where the picture sits on screen.
 *
 * Everything between "there is a texture" and "it is drawn at this size in this
 * place": the drawing surface's size, the fit-to-stage arithmetic, the sampling mode
 * the zoom calls for, and the viewport rectangle every overlay measures against.
 *
 * Split from the renderer because it is the one part with no textures of its own. It
 * is handed the sprite and the size, and it decides the geometry.
 */

import type { CanvasSize } from '../../model/document';
import { Camera, RULER_GUTTER } from './camera';
import type { Viewport } from './camera';
import type { GpuContext, GpuSprite, GpuTexture } from './gpu';
import { applySampling } from './sampling';

/** What the view controller needs to look at. */
export interface ViewSubject {
	/** The on-screen sprite, or null before an image is loaded. */
	sprite: () => GpuSprite | null;
	/** Size of the texture being displayed. Zero when nothing is loaded. */
	size: () => CanvasSize;
	/** Every texture in the chain, for the sampling switch. */
	textures: () => Iterable< GpuTexture | null | undefined >;
}

/**
 * The camera, the drawing surface, and the sprite placement that follows from them.
 */
export class ViewController {
	private gpu: GpuContext;

	private host: HTMLElement;

	private subject: ViewSubject;

	private camera = new Camera();

	private resizeObserver: ResizeObserver | null = null;

	/**
	 * @param gpu     Drawing context.
	 * @param host    Element the canvas fills.
	 * @param subject What is being displayed.
	 */
	constructor( gpu: GpuContext, host: HTMLElement, subject: ViewSubject ) {
		this.gpu = gpu;
		this.host = host;
		this.subject = subject;

		this.syncSurface();
		this.observeResize();
	}

	/** Current zoom, where 1 means fitted to the stage. */
	get zoom(): number {
		return this.camera.zoom;
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
		if ( 'undefined' === typeof ResizeObserver ) {
			return;
		}

		this.resizeObserver = new ResizeObserver( () => this.fit() );
		this.resizeObserver.observe( this.host );
	}

	/**
	 * Matches the drawing surface to the host element.
	 *
	 * Called from `fit()` so there is exactly one place that can get this wrong, and
	 * every path that repositions the image goes through it.
	 *
	 * @return The host's size in CSS pixels.
	 */
	private syncSurface(): { width: number; height: number } {
		const bounds = this.host.getBoundingClientRect();
		const width = Math.max( 1, Math.floor( bounds.width ) );
		const height = Math.max( 1, Math.floor( bounds.height ) );

		this.gpu.resize( width, height );

		return { width, height };
	}

	/** Extra inset when the rulers are showing, so fitting never tucks under them. */
	private get gutter(): number {
		return this.host.classList.contains( 'has-rulers' ) ? RULER_GUTTER : 0;
	}

	/**
	 * Scales and centres the sprite to fit the host, never magnifying past 1:1.
	 *
	 * Upscaling a small image to fill the viewport would show interpolation artefacts
	 * and mislead the user about the detail they actually have.
	 */
	fit(): void {
		const bounds = this.syncSurface();
		const sprite = this.subject.sprite();
		const size = this.subject.size();

		if ( ! sprite || size.width <= 0 ) {
			return;
		}

		const gutter = this.gutter;
		const effective = this.camera.fitScale( bounds, size, gutter ) * this.camera.zoom;
		const centre = this.camera.centre( bounds, gutter );

		sprite.scale.set( effective );
		this.applySampling( effective );
		sprite.position.set( centre.x, centre.y );

		this.camera.emit();
	}

	/**
	 * Applies the sampling mode the current zoom calls for.
	 *
	 * @param scale On-screen scale. Defaults to whatever the sprite currently has, so
	 *              a freshly created render texture can be brought into line without
	 *              waiting for the next fit.
	 */
	applySampling( scale?: number ): void {
		const sprite = this.subject.sprite();
		const effective = scale ?? ( sprite ? Math.abs( sprite.scale.x ) : null );

		if ( null === effective ) {
			return;
		}

		applySampling( effective, this.subject.textures() );
	}

	/**
	 * Where the image sits inside the stage, in CSS pixels.
	 *
	 * The crop overlay needs this to draw a rectangle over the image rather than over
	 * the letterboxing around it.
	 *
	 * @return Viewport rectangle, or null when nothing is loaded.
	 */
	viewport(): Viewport | null {
		const sprite = this.subject.sprite();
		const size = this.subject.size();

		if ( ! sprite || size.width <= 0 ) {
			return null;
		}

		return this.camera.viewport(
			this.gpu.screen,
			size,
			Math.abs( sprite.scale.x ),
			this.gutter
		);
	}

	/**
	 * Subscribes to viewport changes, so overlays can follow a resize.
	 *
	 * @param listener Called after each re-fit.
	 * @return Unsubscribe function.
	 */
	onChange( listener: () => void ): () => void {
		return this.camera.onChange( listener );
	}

	/**
	 * Scrolls the pasteboard.
	 *
	 * @param dx Horizontal movement in CSS pixels.
	 * @param dy Vertical movement in CSS pixels.
	 */
	pan( dx: number, dy: number ): void {
		this.camera.scrollBy( dx, dy );
		this.fit();
	}

	/**
	 * Zooms about a point, keeping whatever is under it in place.
	 *
	 * @param factor  Multiplier on the current zoom.
	 * @param originX Anchor point, in stage CSS pixels.
	 * @param originY Anchor point, in stage CSS pixels.
	 */
	zoomAt( factor: number, originX: number, originY: number ): void {
		if ( this.camera.zoomAt( factor, originX, originY, this.gpu.screen ) ) {
			this.fit();
		}
	}

	/** Zooms so one canvas pixel covers one CSS pixel. */
	zoomToActual(): void {
		const sprite = this.subject.sprite();

		if ( ! sprite || this.subject.size().width <= 0 ) {
			return;
		}

		this.camera.zoomToActual( sprite.scale.x );
		this.fit();
	}

	/** Returns the view to a centred, fitted position. */
	reset(): void {
		this.camera.reset();
		this.fit();
	}

	/** Stops observing and drops every listener. */
	destroy(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.camera.clear();
	}
}
