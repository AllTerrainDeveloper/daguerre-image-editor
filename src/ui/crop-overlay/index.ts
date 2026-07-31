/**
 * The interactive crop rectangle.
 *
 * Sits over the canvas rather than inside it, as plain DOM. The crop is a UI
 * affordance, not part of the image, so drawing it in the WebGL scene would mean
 * re-rendering the photograph on every pointer move to move a dashed line.
 *
 * The rectangle is normalised 0..1 against the canvas, so a crop dragged on a 900px
 * preview means exactly the same thing applied to a 6000px canvas.
 *
 * The overlay owns its rectangle and the canvas is only resized when the user
 * applies the crop. Resizing live would change the viewport underneath the drag,
 * and every subsequent pointer delta would be measured against a surface that had
 * just moved -- which is what made an earlier version track at double speed.
 */

import { clampRect } from '../../model/document';
import type { Rect } from '../../model/document';
import { resizeRect } from './resize';
import type { Handle } from './resize';
import { __ } from '../../i18n';

export interface CropOverlayOptions {
	/** Element the overlay is positioned within -- the stage. */
	stage: HTMLElement;
	/** Where the image sits inside the stage, in CSS pixels. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Fires continuously while dragging, for live readouts. */
	onChange?: ( rect: Rect ) => void;
}

/**
 * A draggable crop rectangle with corner and edge handles.
 */
export class CropOverlay {
	private options: CropOverlayOptions;

	private root: HTMLElement;

	private box: HTMLElement;

	/** The dimming layer, clipped to the image so its shadow cannot cover the page. */
	private dim: HTMLElement;

	/** The rectangle being dragged. Local until the user applies it. */
	private rect: Rect = { x: 0, y: 0, w: 1, h: 1 };

	/** Aspect constraint, or 0 for free. */
	private aspect = 0;

	private active: {
		handle: Handle;
		startX: number;
		startY: number;
		startRect: Rect;
		/** Viewport captured at pointerdown, so a mid-drag change cannot skew deltas. */
		viewport: { width: number; height: number };
	} | null = null;

	constructor( options: CropOverlayOptions ) {
		this.options = options;

		this.root = document.createElement( 'div' );
		this.root.className = 'lz-crop';
		this.root.setAttribute( 'aria-hidden', 'true' );

		// The dimming is a huge box-shadow, which has to be clipped to the image --
		// but clipping the same element would also cut the handles in half, since they
		// deliberately overhang the rectangle's edges. So the two live in separate
		// layers over the same rectangle.
		const clip = document.createElement( 'div' );
		clip.className = 'lz-crop__clip';

		this.dim = document.createElement( 'div' );
		this.dim.className = 'lz-crop__dim';
		clip.appendChild( this.dim );

		this.box = document.createElement( 'div' );
		this.box.className = 'lz-crop__box';

		// Rule of thirds. Purely decorative, hence aria-hidden on the root.
		for ( const line of [ 'v1', 'v2', 'h1', 'h2' ] ) {
			const guide = document.createElement( 'span' );
			guide.className = `lz-crop__guide lz-crop__guide--${ line }`;
			this.box.appendChild( guide );
		}

		for ( const handle of [ 'nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e' ] as Handle[] ) {
			const grip = document.createElement( 'span' );
			grip.className = `lz-crop__handle lz-crop__handle--${ handle }`;
			grip.dataset.handle = handle;
			this.box.appendChild( grip );
		}

		this.root.append( clip, this.box );
		options.stage.appendChild( this.root );

		this.box.addEventListener( 'pointerdown', this.onPointerDown );
		this.sync();
	}

	/** Repositions the rectangle from the model. */
	sync = (): void => {
		const viewport = this.options.getViewport();

		if ( ! viewport ) {
			this.root.hidden = true;

			return;
		}

		this.root.hidden = false;
		this.root.style.insetInlineStart = `${ viewport.x }px`;
		this.root.style.insetBlockStart = `${ viewport.y }px`;
		this.root.style.inlineSize = `${ viewport.width }px`;
		this.root.style.blockSize = `${ viewport.height }px`;

		const rect = this.rect;

		for ( const layer of [ this.box, this.dim ] ) {
			layer.style.insetInlineStart = `${ rect.x * 100 }%`;
			layer.style.insetBlockStart = `${ rect.y * 100 }%`;
			layer.style.inlineSize = `${ rect.w * 100 }%`;
			layer.style.blockSize = `${ rect.h * 100 }%`;
		}
	};

	/**
	 * Starts a drag.
	 *
	 * Tracked on the window rather than the element. Pointer capture can be lost
	 * silently, and when it is, the release never reaches an element listener -- the
	 * drag then sticks on forever and swallows every click on the page.
	 */
	private onPointerDown = ( event: PointerEvent ): void => {
		const target = event.target as HTMLElement;
		const handle = ( target.dataset?.handle ?? 'move' ) as Handle;

		const viewport = this.options.getViewport();

		if ( ! viewport ) {
			return;
		}

		this.active = {
			handle,
			startX: event.clientX,
			startY: event.clientY,
			startRect: { ...this.rect },
			viewport: { width: viewport.width, height: viewport.height },
		};

		event.preventDefault();
		event.stopPropagation();

		this.listen();
	};

	/** Starts tracking a drag on the window. */
	private listen(): void {
		window.addEventListener( 'pointermove', this.onPointerMove );
		window.addEventListener( 'pointerup', this.onPointerUp );
		window.addEventListener( 'pointercancel', this.onPointerUp );
		window.addEventListener( 'blur', this.onPointerUp );
	}

	/** Stops tracking. Safe to call when not tracking. */
	private unlisten(): void {
		window.removeEventListener( 'pointermove', this.onPointerMove );
		window.removeEventListener( 'pointerup', this.onPointerUp );
		window.removeEventListener( 'pointercancel', this.onPointerUp );
		window.removeEventListener( 'blur', this.onPointerUp );
	}

	/** Updates the rectangle as the pointer moves. */
	private onPointerMove = ( event: PointerEvent ): void => {
		if ( ! this.active ) {
			return;
		}

		const { viewport } = this.active;

		if ( viewport.width === 0 || viewport.height === 0 ) {
			return;
		}

		const dx = ( event.clientX - this.active.startX ) / viewport.width;
		const dy = ( event.clientY - this.active.startY ) / viewport.height;

		this.rect = resizeRect(
			this.active.startRect,
			this.active.handle,
			dx,
			dy,
			this.aspect,
			this.active.viewport
		);

		this.options.onChange?.( this.rect );
		this.sync();
	};

	/** Ends a drag. */
	private onPointerUp = (): void => {
		this.unlisten();

		if ( ! this.active ) {
			return;
		}

		this.active = null;
		this.options.onChange?.( this.rect );
	};

	/** The rectangle as it currently stands. */
	getRect(): Rect {
		return { ...this.rect };
	}

	/**
	 * Replaces the rectangle.
	 *
	 * @param rect New rectangle.
	 */
	setRect( rect: Rect ): void {
		this.rect = clampRect( rect );
		this.sync();
	}

	/**
	 * Constrains dragging to an aspect ratio.
	 *
	 * @param aspect Width divided by height, or 0 for free.
	 */
	setAspect( aspect: number ): void {
		this.aspect = aspect;
	}

	/** Whether the overlay is on screen. */
	setVisible( visible: boolean ): void {
		this.root.style.display = visible ? '' : 'none';
		this.root.title = visible ? __( 'Drag to crop, then apply' ) : '';
	}

	/** Removes the overlay. */
	destroy(): void {
		this.unlisten();
		this.box.removeEventListener( 'pointerdown', this.onPointerDown );
		this.root.remove();
	}
}
