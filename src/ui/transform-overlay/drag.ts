/**
 * What a transform drag does to the layer.
 *
 * Pure arithmetic over the state captured at pointerdown. Nothing here touches the
 * DOM, which is what lets the three gestures -- move, rotate, scale -- be read side by
 * side rather than as one branch of a pointer handler.
 */

import {
	MAX_SCALE,
	MIN_SCALE,
	normaliseAngle,
} from '../../model/document';
import type { CanvasSize, LayerTransform } from '../../model/document';
import { projectLocal, snap } from './snapping';
import { SNAP_DEGREES, SNAP_PX } from './types';
import type { DragStart } from './types';

/** A moved layer, and where the snap guides should sit. */
export interface MoveResult {
	transform: LayerTransform;
	/** Normalised position of each guide, or null to hide it. */
	guideX: number | null;
	guideY: number | null;
}

/**
 * Holds a scale inside the supported range.
 *
 * @param value Requested scale.
 */
function bound( value: number ): number {
	return Math.min( MAX_SCALE, Math.max( MIN_SCALE, value ) );
}

/**
 * Moves the layer, snapping it to the canvas where it comes close.
 *
 * The alignments anyone actually wants: the layer's centre and its edges against the
 * canvas's centre and edges.
 *
 * @param start    State captured at pointerdown.
 * @param event    Current pointer position.
 * @param canvas   Canvas size.
 * @param image    Native size of the image on the layer.
 * @param snapping Whether snapping is on for this move.
 */
export function dragMove(
	start: DragStart,
	event: PointerEvent,
	canvas: CanvasSize,
	image: CanvasSize,
	snapping: boolean
): MoveResult {
	// Screen pixels to canvas fractions, using the ratio captured at pointerdown
	// rather than a freshly-read one.
	const dx = ( event.clientX - start.pointerX ) / start.pixelRatio;
	const dy = ( event.clientY - start.pointerY ) / start.pixelRatio;

	const x = start.transform.x + dx / canvas.width;
	const y = start.transform.y + dy / canvas.height;

	if ( ! snapping ) {
		return {
			transform: { ...start.transform, x, y },
			guideX: null,
			guideY: null,
		};
	}

	const halfW = ( image.width * start.transform.scaleX ) / 2 / canvas.width;
	const halfH = ( image.height * start.transform.scaleY ) / 2 / canvas.height;

	const snappedX = snap( x, [ 0.5, halfW, 1 - halfW ], SNAP_PX / start.pixelRatio / canvas.width );
	const snappedY = snap( y, [ 0.5, halfH, 1 - halfH ], SNAP_PX / start.pixelRatio / canvas.height );

	return {
		transform: { ...start.transform, x: snappedX.value, y: snappedY.value },
		guideX: snappedX.hit ? snappedX.value : null,
		guideY: snappedY.hit ? snappedY.value : null,
	};
}

/**
 * Rotates the layer about its centre.
 *
 * @param start State captured at pointerdown.
 * @param event Current pointer position.
 */
export function dragRotate(
	start: DragStart,
	event: PointerEvent
): LayerTransform {
	const angle =
		( Math.atan2( event.clientY - start.centreY, event.clientX - start.centreX ) *
			180 ) /
		Math.PI;

	let rotation = start.transform.rotation + ( angle - start.angle );

	if ( event.shiftKey ) {
		rotation = Math.round( rotation / SNAP_DEGREES ) * SNAP_DEGREES;
	}

	return { ...start.transform, rotation: normaliseAngle( rotation ) };
}

/**
 * Scales the layer from an edge or a corner handle.
 *
 * Edge handles stretch one axis, and the axis is the *layer's* own rather than the
 * screen's -- otherwise dragging the right edge of a tilted layer would stretch it
 * diagonally. Corners scale both, uniformly unless Shift says otherwise, because a
 * photograph is not something to stretch by accident.
 *
 * @param start State captured at pointerdown.
 * @param event Current pointer position.
 */
export function dragScale(
	start: DragStart,
	event: PointerEvent
): LayerTransform {
	const dx = event.clientX - start.centreX;
	const dy = event.clientY - start.centreY;
	const local = projectLocal( dx, dy, start.transform.rotation );

	const scaleX = bound( start.transform.scaleX * ( local.localX / start.localX ) );
	const scaleY = bound( start.transform.scaleY * ( local.localY / start.localY ) );

	if ( 'e' === start.handle || 'w' === start.handle ) {
		return { ...start.transform, scaleX };
	}

	if ( 'n' === start.handle || 's' === start.handle ) {
		return { ...start.transform, scaleY };
	}

	if ( event.shiftKey ) {
		return { ...start.transform, scaleX, scaleY };
	}

	const ratio = Math.hypot( dx, dy ) / start.distance;

	return {
		...start.transform,
		scaleX: bound( start.transform.scaleX * ratio ),
		scaleY: bound( start.transform.scaleY * ratio ),
	};
}
