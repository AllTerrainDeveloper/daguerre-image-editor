/**
 * Applying a drag to the crop rectangle.
 *
 * Pure arithmetic on normalised coordinates, so the rectangle survives the canvas
 * being resized underneath it -- which is exactly what applying a crop does.
 */

import { clampRect } from '../../model/document';
import type { Rect } from '../../model/document';

/** Smallest crop, as a fraction of the frame. */
const MIN_SIZE = 0.02;

/** Which part of the rectangle a drag grabbed. */
export type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

/**
 * Applies a drag delta to a rectangle.
 *
 * @param start  Rectangle at the start of the drag.
 * @param handle Which handle is being dragged.
 * @param dx     Horizontal delta, as a fraction of the frame.
 * @param dy     Vertical delta, as a fraction of the frame.
 * @param aspect Ratio to constrain to, or 0 for a free crop.
 * @param frame  Frame the crop sits in, for expressing that ratio.
 */
export function resizeRect(
	start: Rect,
	handle: Handle,
	dx: number,
	dy: number,
	aspect: number,
	frame: { width: number; height: number } | null
): Rect {
	if ( handle === 'move' ) {
		return clampRect( { ...start, x: start.x + dx, y: start.y + dy } );
	}

	let { x, y, w, h } = start;

	if ( handle.includes( 'w' ) ) {
		const nx = Math.min( x + w - MIN_SIZE, Math.max( 0, x + dx ) );
		w += x - nx;
		x = nx;
	}

	if ( handle.includes( 'e' ) ) {
		w = Math.min( 1 - x, Math.max( MIN_SIZE, w + dx ) );
	}

	if ( handle.includes( 'n' ) ) {
		const ny = Math.min( y + h - MIN_SIZE, Math.max( 0, y + dy ) );
		h += y - ny;
		y = ny;
	}

	if ( handle.includes( 's' ) ) {
		h = Math.min( 1 - y, Math.max( MIN_SIZE, h + dy ) );
	}

	if ( aspect > 0 ) {
		const viewport = frame;
		const frameAspect =
			viewport && viewport.height > 0 ? viewport.width / viewport.height : 1;

		// The crop lives in a unit square, so the target ratio has to be
		// expressed relative to the frame's own proportions before it can
		// constrain normalised width against normalised height.
		const relative = aspect / frameAspect;

		// Drive height from width, unless the handle was purely vertical.
		if ( handle === 'n' || handle === 's' ) {
			w = h * relative;
		} else {
			h = w / relative;
		}

		// Re-anchor so the corner opposite the one being dragged stays put.
		if ( handle.includes( 'n' ) ) {
			y = start.y + start.h - h;
		}

		if ( handle.includes( 'w' ) ) {
			x = start.x + start.w - w;
		}
	}

	return clampRect( { x, y, w, h } );
}
