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

import { MAX_SCALE, MIN_SCALE, normaliseAngle } from '../model/document';
import type { CanvasSize, LayerTransform } from '../model/document';
import { __ } from '../i18n';

/** Which handle a drag grabbed. */
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'rotate';

/** Rotation snaps to multiples of this while shift is held, in degrees. */
const SNAP_DEGREES = 15;

/** How close, in screen pixels, a position must be to snap. */
const SNAP_PX = 7;

export interface TransformOverlayOptions {
	/** Element the overlay is positioned within -- the stage. */
	stage: HTMLElement;
	/** Where the canvas sits inside the stage, in CSS pixels. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Canvas size in its own pixels. */
	getCanvas: () => CanvasSize;
	/** Native size of the image on the layer. */
	getImageSize: () => CanvasSize;
	/** The layer transform as it currently stands. */
	getTransform: () => LayerTransform;
	/** Fires continuously while dragging. */
	onChange: ( transform: LayerTransform ) => void;
	/** Fires once a drag finishes. */
	onCommit: () => void;
	/** Whether snapping is on. Alt bypasses it regardless. */
	getSnapping: () => boolean;
}

/** State captured at the moment a drag begins. */
interface DragStart {
	handle: Handle;
	pointerX: number;
	pointerY: number;
	transform: LayerTransform;
	/** CSS pixels per canvas pixel, fixed for the gesture. */
	pixelRatio: number;
	/** Layer centre in stage CSS pixels. */
	centreX: number;
	centreY: number;
	/** Pointer angle from the centre, for rotation. */
	angle: number;
	/** Pointer distance from the centre, for uniform scaling. */
	distance: number;
	/** Pointer offset from the centre projected onto the layer's own axes. */
	localX: number;
	localY: number;
}

/**
 * Draggable handles around the layer.
 */
export class TransformOverlay {
	private options: TransformOverlayOptions;

	private root: HTMLElement;

	private box: HTMLElement;

	private start: DragStart | null = null;

	private guideX!: HTMLElement;

	private guideY!: HTMLElement;

	constructor( options: TransformOverlayOptions ) {
		this.options = options;

		this.root = document.createElement( 'div' );
		this.root.className = 'lz-transform';

		this.box = document.createElement( 'div' );
		this.box.className = 'lz-transform__box';
		this.box.dataset.handle = 'move';
		this.box.title = __(
			'Drag to move. Corners scale both axes, edges scale one, the top handle rotates. Hold Shift on a corner to scale freely.'
		);

		for ( const handle of [
			'nw',
			'ne',
			'sw',
			'se',
			'n',
			's',
			'w',
			'e',
		] as Handle[] ) {
			const grip = document.createElement( 'span' );
			grip.className = `lz-transform__handle lz-transform__handle--${ handle }`;
			grip.dataset.handle = handle;
			this.box.appendChild( grip );
		}

		// Guides showing what a snap has locked onto. Siblings of the box rather than
		// children, so they are not rotated with it.
		this.guideX = document.createElement( 'span' );
		this.guideX.className = 'lz-snap lz-snap--v';
		this.guideX.hidden = true;

		this.guideY = document.createElement( 'span' );
		this.guideY.className = 'lz-snap lz-snap--h';
		this.guideY.hidden = true;

		const stem = document.createElement( 'span' );
		stem.className = 'lz-transform__stem';
		this.box.appendChild( stem );

		const rotate = document.createElement( 'span' );
		rotate.className = 'lz-transform__handle lz-transform__handle--rotate';
		rotate.dataset.handle = 'rotate';
		rotate.title = __( 'Rotate. Hold Shift to snap.' );
		this.box.appendChild( rotate );

		this.root.append( this.guideX, this.guideY, this.box );
		options.stage.appendChild( this.root );

		this.box.addEventListener( 'pointerdown', this.onPointerDown );
		this.sync();
	}

	/** Repositions the handles from the model. */
	sync = (): void => {
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! viewport || canvas.width <= 0 ) {
			this.root.hidden = true;

			return;
		}

		this.root.hidden = false;
		this.root.style.insetInlineStart = `${ viewport.x }px`;
		this.root.style.insetBlockStart = `${ viewport.y }px`;
		this.root.style.inlineSize = `${ viewport.width }px`;
		this.root.style.blockSize = `${ viewport.height }px`;

		const transform = this.options.getTransform();
		const image = this.options.getImageSize();
		const ratio = viewport.width / canvas.width;

		const width = image.width * transform.scaleX * ratio;
		const height = image.height * transform.scaleY * ratio;

		this.box.style.inlineSize = `${ width }px`;
		this.box.style.blockSize = `${ height }px`;
		this.box.style.insetInlineStart = `${ transform.x * viewport.width - width / 2 }px`;
		this.box.style.insetBlockStart = `${ transform.y * viewport.height - height / 2 }px`;
		this.box.style.transform = `rotate(${ transform.rotation }deg)`;
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

		const canvas = this.options.getCanvas();

		if ( start.handle === 'move' ) {
			// Screen pixels to canvas fractions, using the ratio captured at
			// pointerdown rather than a freshly-read one.
			const dx = ( event.clientX - start.pointerX ) / start.pixelRatio;
			const dy = ( event.clientY - start.pointerY ) / start.pixelRatio;

			let x = start.transform.x + dx / canvas.width;
			let y = start.transform.y + dy / canvas.height;

			// Alt bypasses snapping, which is the universal escape hatch for when the
			// thing you want is a pixel away from a snap target.
			if ( this.options.getSnapping() && ! event.altKey ) {
				const image = this.options.getImageSize();
				const halfW =
					( image.width * start.transform.scaleX ) / 2 / canvas.width;
				const halfH =
					( image.height * start.transform.scaleY ) / 2 / canvas.height;

				const toleranceX = SNAP_PX / start.pixelRatio / canvas.width;
				const toleranceY = SNAP_PX / start.pixelRatio / canvas.height;

				// Snap the layer's centre and its edges to the canvas's centre and
				// edges -- the alignments anyone actually wants.
				const snappedX = snap(
					x,
					[ 0.5, halfW, 1 - halfW ],
					toleranceX
				);
				const snappedY = snap(
					y,
					[ 0.5, halfH, 1 - halfH ],
					toleranceY
				);

				x = snappedX.value;
				y = snappedY.value;

				this.showGuide( this.guideX, snappedX.hit ? x : null, 'v' );
				this.showGuide( this.guideY, snappedY.hit ? y : null, 'h' );
			} else {
				this.guideX.hidden = true;
				this.guideY.hidden = true;
			}

			this.options.onChange( { ...start.transform, x, y } );

			this.sync();

			return;
		}

		if ( start.handle === 'rotate' ) {
			const angle =
				( Math.atan2(
					event.clientY - start.centreY,
					event.clientX - start.centreX
				) *
					180 ) /
				Math.PI;

			let rotation = start.transform.rotation + ( angle - start.angle );

			if ( event.shiftKey ) {
				rotation = Math.round( rotation / SNAP_DEGREES ) * SNAP_DEGREES;
			}

			this.options.onChange( {
				...start.transform,
				rotation: normaliseAngle( rotation ),
			} );

			this.sync();

			return;
		}

		const dx = event.clientX - start.centreX;
		const dy = event.clientY - start.centreY;

		// Edge handles stretch one axis. The axis is the *layer's* own, not the
		// screen's, so the projection has to undo the rotation -- otherwise dragging
		// the right edge of a tilted layer would stretch it diagonally.
		const local = projectLocal( dx, dy, start.transform.rotation );

		const bound = ( value: number ) =>
			Math.min( MAX_SCALE, Math.max( MIN_SCALE, value ) );

		if ( start.handle === 'e' || start.handle === 'w' ) {
			this.options.onChange( {
				...start.transform,
				scaleX: bound( start.transform.scaleX * ( local.localX / start.localX ) ),
			} );

			this.sync();

			return;
		}

		if ( start.handle === 'n' || start.handle === 's' ) {
			this.options.onChange( {
				...start.transform,
				scaleY: bound( start.transform.scaleY * ( local.localY / start.localY ) ),
			} );

			this.sync();

			return;
		}

		// Corners scale both axes. Uniform by default, because a photograph is not
		// something to stretch by accident; Shift releases that.
		if ( event.shiftKey ) {
			this.options.onChange( {
				...start.transform,
				scaleX: bound( start.transform.scaleX * ( local.localX / start.localX ) ),
				scaleY: bound( start.transform.scaleY * ( local.localY / start.localY ) ),
			} );

			this.sync();

			return;
		}

		const ratio = Math.hypot( dx, dy ) / start.distance;

		this.options.onChange( {
			...start.transform,
			scaleX: bound( start.transform.scaleX * ratio ),
			scaleY: bound( start.transform.scaleY * ratio ),
		} );

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

	/**
	 * Positions a snap guide.
	 *
	 * @param element Guide element.
	 * @param at      Normalised position, or null to hide it.
	 * @param axis    Which guide.
	 */
	private showGuide(
		element: HTMLElement,
		at: number | null,
		axis: 'v' | 'h'
	): void {
		if ( at === null ) {
			element.hidden = true;

			return;
		}

		element.hidden = false;

		if ( axis === 'v' ) {
			element.style.insetInlineStart = `${ at * 100 }%`;
		} else {
			element.style.insetBlockStart = `${ at * 100 }%`;
		}
	}

	/** Whether the handles are on screen. */
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

/**
 * Projects a screen-space offset onto the layer's own axes.
 *
 * Distances are floored away from zero so a ratio taken against them can never
 * divide by nothing when a handle is grabbed exactly on the centre line.
 *
 * @param dx       Horizontal offset from the layer centre, in screen pixels.
 * @param dy       Vertical offset from the layer centre, in screen pixels.
 * @param rotation Layer rotation in degrees.
 */
function projectLocal(
	dx: number,
	dy: number,
	rotation: number
): { localX: number; localY: number } {
	const radians = ( rotation * Math.PI ) / 180;
	const cos = Math.cos( radians );
	const sin = Math.sin( radians );

	return {
		localX: Math.max( 1, Math.abs( dx * cos + dy * sin ) ),
		localY: Math.max( 1, Math.abs( -dx * sin + dy * cos ) ),
	};
}

/**
 * Snaps a value to the nearest target within a tolerance.
 *
 * @param value     Candidate value.
 * @param targets   Positions worth snapping to.
 * @param tolerance How close counts, in the same units.
 * @return The value, snapped if it was close enough, and whether it snapped.
 */
export function snap(
	value: number,
	targets: number[],
	tolerance: number
): { value: number; hit: boolean } {
	let best = value;
	let bestDistance = tolerance;
	let hit = false;

	for ( const target of targets ) {
		const distance = Math.abs( value - target );

		// Strictly nearer, so an earlier target wins a tie and the result is stable.
		if ( distance < bestDistance ) {
			best = target;
			bestDistance = distance;
			hit = true;
		}
	}

	return { value: best, hit };
}
