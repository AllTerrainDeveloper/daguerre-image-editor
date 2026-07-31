/**
 * Lifting a dirty rectangle out of a working buffer.
 *
 * Only the rectangle a dab actually touched is uploaded, so the cost of a retouching
 * stroke is proportional to the brush rather than to the document.
 */

import type { PixelBuffer } from '../../engine/pixel-tools';

/**
 * Copies one rectangle of a buffer into a canvas.
 *
 * @param buffer Working pixels.
 * @param rect   Dirty rectangle.
 * @return The patch, or null when a 2D context was refused.
 */
export function cutPatch(
	buffer: PixelBuffer,
	rect: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement | null {
	const patch = document.createElement( 'canvas' );

	patch.width = rect.width;
	patch.height = rect.height;

	const ctx = patch.getContext( '2d' );

	if ( ! ctx ) {
		return null;
	}

	const region = ctx.createImageData( rect.width, rect.height );

	for ( let row = 0; row < rect.height; row++ ) {
		const from = ( ( rect.y + row ) * buffer.width + rect.x ) * 4;

		region.data.set(
			buffer.data.subarray( from, from + rect.width * 4 ),
			row * rect.width * 4
		);
	}

	ctx.putImageData( region, 0, 0 );

	return patch;
}
