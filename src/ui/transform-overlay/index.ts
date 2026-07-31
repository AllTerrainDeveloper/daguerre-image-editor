/**
 * The layer transform handles: move, scale, rotate.
 *
 * Operates on the *layer*, never on the canvas. That is not a detail -- it is the
 * reason the handles track the pointer correctly.
 *
 * The previous version resized the canvas as you dragged, so every pointer move was
 * measured against a viewport that had just changed size. The result was a feedback
 * loop: the rectangle moved at roughly twice the speed of the pointer. Because a
 * layer transform cannot change the surface it is drawn onto, the mapping from
 * screen pixels to canvas coordinates is fixed for the whole gesture.
 *
 * The drag start is also snapshotted, so even a viewport change from an unrelated
 * source mid-gesture cannot corrupt the maths.
 *
 * Drags are tracked on `window`, not on the handle. Pointer capture is not enough:
 * capture can be lost silently -- the browser drops it on a context menu, a native
 * drag, or a lost focus -- and when it is, the release event never reaches an
 * element listener. The drag then sticks on forever, swallowing every click on the
 * page. Listening on the window means the release is caught wherever it happens,
 * and `blur` covers a pointer released outside the browser entirely.
 */

import { __ } from '../../i18n';
import { buildChrome } from './chrome';
import type { OverlayChrome } from './chrome';
import { layOut, showGuide } from './layout';
import { dragMove, dragRotate, dragScale } from './drag';
import { projectLocal } from './snapping';
import type { DragStart, Handle, TransformOverlayOptions } from './types';

export type { TransformOverlayOptions } from './types';

/**
 * Draggable handles around the layer.
 */
export class TransformOverlay {
	private options: TransformOverlayOptions;

	private chrome: OverlayChrome;

	private root: HTMLElement;

	private box: HTMLElement;

	private guideX: HTMLElement;

	private guideY: HTMLElement;

	private start: DragStart | null = null;

	constructor( options: TransformOverlayOptions ) {
		this.options = options;

		this.chrome = buildChrome( options.stage );
		this.root = this.chrome.root;
		this.box = this.chrome.box;
		this.guideX = this.chrome.guideX;
		this.guideY = this.chrome.guideY;

		this.box.addEventListener( 'pointerdown', this.onPointerDown );
		this.sync();
	}

	/** Repositions the handles from the model. */
	sync = (): void => {
		layOut( this.chrome, this.options );
	};

	/** Captures everything the gesture needs, so nothing is re-read mid-drag. */
	private onPointerDown = ( event: PointerEvent ): void => {
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! viewport || canvas.width <= 0 ) {
			return;
		}

		const target = event.target as HTMLElement;
		const handle = ( target.dataset?.handle ?? 'move' ) as Handle;
		const transform = this.options.getTransform();

		const stageRect = this.options.stage.getBoundingClientRect();
		const centreX =
			stageRect.left + viewport.x + transform.x * viewport.width;
		const centreY = stageRect.top + viewport.y + transform.y * viewport.height;

		const dx = event.clientX - centreX;
		const dy = event.clientY - centreY;

		this.start = {
			handle,
			pointerX: event.clientX,
			pointerY: event.clientY,
			transform: { ...transform },
			pixelRatio: viewport.width / canvas.width,
			centreX,
			centreY,
			angle: ( Math.atan2( dy, dx ) * 180 ) / Math.PI,
			distance: Math.max( 1, Math.hypot( dx, dy ) ),
			...projectLocal( dx, dy, transform.rotation ),
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

	/** Applies the gesture. */
	private onPointerMove = ( event: PointerEvent ): void => {
		const start = this.start;

		if ( ! start ) {
			return;
		}

		if ( 'move' === start.handle ) {
			// Alt bypasses snapping, which is the universal escape hatch for when the
			// thing you want is a pixel away from a snap target.
			const moved = dragMove(
				start,
				event,
				this.options.getCanvas(),
				this.options.getImageSize(),
				this.options.getSnapping() && ! event.altKey
			);

			this.options.onChange( moved.transform );
			showGuide( this.guideX, moved.guideX, 'v' );
			showGuide( this.guideY, moved.guideY, 'h' );
			this.sync();

			return;
		}

		if ( 'rotate' === start.handle ) {
			this.options.onChange( dragRotate( start, event ) );
			this.sync();

			return;
		}

		this.options.onChange( dragScale( start, event ) );
		this.sync();
	};

	/** Ends the gesture. */
	private onPointerUp = (): void => {
		this.unlisten();

		if ( ! this.start ) {
			return;
		}

		this.start = null;
		this.guideX.hidden = true;
		this.guideY.hidden = true;
		this.options.onCommit();
	};

	setVisible( visible: boolean ): void {
		this.root.style.display = visible ? '' : 'none';

		if ( ! visible ) {
			this.guideX.hidden = true;
			this.guideY.hidden = true;
		}
	}

	/** Removes the overlay. */
	destroy(): void {
		this.unlisten();
		this.box.removeEventListener( 'pointerdown', this.onPointerDown );
		this.root.remove();
	}
}
