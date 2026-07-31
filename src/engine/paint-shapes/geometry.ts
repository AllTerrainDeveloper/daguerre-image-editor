/**
 * Turning a drag into a rectangle.
 */

import type { PixelPoint, PixelRect } from './types';

/**
 * Normalises two dragged corners into a rectangle.
 *
 * @param from First corner.
 * @param to   Second corner.
 */
export function rectFromDrag( from: PixelPoint, to: PixelPoint ): PixelRect {
	return {
		x: Math.min( from.x, to.x ),
		y: Math.min( from.y, to.y ),
		width: Math.abs( to.x - from.x ),
		height: Math.abs( to.y - from.y ),
	};
}

/**
 * Constrains a drag to a square, keeping the direction it went.
 *
 * This is what Shift does in every editor, and it is worth having because a circle
 * drawn by eye is never quite a circle.
 *
 * @param from Anchor corner.
 * @param to   Dragged corner.
 */
export function squareDrag( from: PixelPoint, to: PixelPoint ): PixelPoint {
	const size = Math.max( Math.abs( to.x - from.x ), Math.abs( to.y - from.y ) );

	return {
		x: from.x + Math.sign( to.x - from.x || 1 ) * size,
		y: from.y + Math.sign( to.y - from.y || 1 ) * size,
	};
}

/**
 * The vertices of a regular star.
 *
 * Exported because it is the only shape here whose geometry is not obvious, and
 * therefore the only one worth testing on its own.
 *
 * @param rect   Bounding box.
 * @param points Number of outer points.
 * @param inner  Inner radius as a fraction of the outer, 0..1.
 */
export function starPoints( rect: PixelRect, points = 5, inner = 0.5 ): PixelPoint[] {
	const cx = rect.x + rect.width / 2;
	const cy = rect.y + rect.height / 2;
	const rx = rect.width / 2;
	const ry = rect.height / 2;
	const out: PixelPoint[] = [];

	for ( let i = 0; i < points * 2; i++ ) {
		// Starts at the top, so a star looks like a star rather than a pinwheel.
		const angle = ( i / ( points * 2 ) ) * Math.PI * 2 - Math.PI / 2;
		const scale = i % 2 === 0 ? 1 : inner;

		out.push( {
			x: cx + Math.cos( angle ) * rx * scale,
			y: cy + Math.sin( angle ) * ry * scale,
		} );
	}

	return out;
}
