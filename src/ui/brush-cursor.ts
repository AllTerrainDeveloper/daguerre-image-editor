/**
 * The brush cursor.
 *
 * A ring the size of the brush, following the pointer. Every raster editor has one for
 * the same reason: the brush is measured in *canvas* pixels, so a 200px brush is a
 * quarter of the screen on a thumbnail and a smudge on a 6000px photograph. A crosshair
 * tells you where you are about to paint; only an outline tells you how much.
 *
 * Drawn as a DOM element rather than as a CSS `cursor` image: a custom cursor is capped
 * at 128px in every browser, and silently falls back to the default past that -- so the
 * one case where the preview matters most is the case where it would disappear.
 */

import type { BrushShape } from '../engine/brush';
import type { CanvasSize } from '../model/document';
import type { ActiveTool } from './panels';

/** The tools whose size is worth previewing. */
const SIZED_TOOLS: ActiveTool[] = [
	'brush',
	'eraser',
	'retouch',
	'tone',
	'clone',
	'history',
];

/** Smallest ring worth drawing, in CSS pixels. Below this it is just a dot. */
const MIN_RADIUS = 2;

export interface BrushCursorOptions {
	/** The canvas area the cursor lives in. */
	stage: HTMLElement;
	/** Where the canvas sits inside the stage, in CSS pixels. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Canvas size in its own pixels, for converting the brush diameter to screen. */
	getCanvas: () => CanvasSize;
	/** Which tool owns the stage. */
	getTool: () => ActiveTool;
	/** Brush diameter in canvas pixels, its shape, and its edge softness. */
	getBrush: () => { size: number; shape: BrushShape; hardness: number };
}

/**
 * A ring that tracks the pointer and matches the brush.
 */
export class BrushCursor {
	private options: BrushCursorOptions;

	private el: HTMLElement;

	/** Last known pointer position, so a size change redraws in place. */
	private at: { x: number; y: number } | null = null;

	constructor( options: BrushCursorOptions ) {
		this.options = options;

		this.el = document.createElement( 'div' );
		this.el.className = 'dg-brush-cursor';
		this.el.setAttribute( 'aria-hidden', 'true' );
		this.el.style.display = 'none';

		options.stage.appendChild( this.el );
		options.stage.addEventListener( 'pointermove', this.onMove );
		options.stage.addEventListener( 'pointerleave', this.onLeave );
	}

	/** Follows the pointer. */
	private onMove = ( event: PointerEvent ): void => {
		const rect = this.options.stage.getBoundingClientRect();

		this.at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		this.draw();
	};

	/** Hides the ring when the pointer leaves the canvas. */
	private onLeave = (): void => {
		this.at = null;
		this.el.style.display = 'none';
	};

	/**
	 * Redraws at the current size.
	 *
	 * Called on pointer moves and whenever the brush or the zoom changes, so the ring
	 * resizes under a stationary pointer rather than waiting for the next movement.
	 */
	draw = (): void => {
		const tool = this.options.getTool();
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if (
			! this.at ||
			! viewport ||
			! SIZED_TOOLS.includes( tool ) ||
			canvas.width < 1 ||
			viewport.width < 1
		) {
			this.el.style.display = 'none';

			return;
		}

		const brush = this.options.getBrush();
		// Canvas pixels to CSS pixels: the brush is defined against the image, so the
		// ring has to grow and shrink with the zoom.
		const scale = viewport.width / canvas.width;
		const size = Math.max( MIN_RADIUS * 2, brush.size * scale );

		this.el.style.display = '';
		this.el.style.inlineSize = `${ size }px`;
		this.el.style.blockSize = `${ size }px`;
		this.el.style.insetInlineStart = `${ this.at.x }px`;
		this.el.style.insetBlockStart = `${ this.at.y }px`;
		this.el.dataset.shape = brush.shape;

		// A soft brush is drawn dashed: its edge is a gradient, so a hard ring would
		// promise a crispness the stroke does not have.
		this.el.classList.toggle( 'is-soft', brush.hardness < 0.5 );
	};

	/** Removes the cursor. */
	destroy(): void {
		this.options.stage.removeEventListener( 'pointermove', this.onMove );
		this.options.stage.removeEventListener( 'pointerleave', this.onLeave );
		this.el.remove();
	}
}
