/**
 * The rectangle a selection occupies.
 */

import type { Selection } from './types';

/**
 * Whether a selection covers no meaningful area.
 *
 * @param selection Selection to test, or null.
 */
export function isEmptySelection( selection: Selection | null ): boolean {
	if ( ! selection || selection.points.length < 2 ) {
		return true;
	}

	const bounds = selectionBounds( selection );

	return bounds.w < 0.002 || bounds.h < 0.002;
}

/**
 * The axis-aligned bounding box, in normalised coordinates.
 *
 * @param selection Selection to measure.
 */
export function selectionBounds( selection: Selection ): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for ( const point of selection.points ) {
		minX = Math.min( minX, point.x );
		minY = Math.min( minY, point.y );
		maxX = Math.max( maxX, point.x );
		maxY = Math.max( maxY, point.y );
	}

	if ( ! Number.isFinite( minX ) ) {
		return { x: 0, y: 0, w: 0, h: 0 };
	}

	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
