/**
 * Box blur over a pixel buffer.
 *
 * Separable and running over an integral of each row and column, so the cost is the
 * same whatever the radius -- which is what makes a large blur brush usable at all.
 */

import { clampInt } from './buffer';
import type { PixelBuffer } from './types';

/**
 * Box-blurs a whole buffer.
 *
 * Separable, and each pass keeps a running sum rather than re-reading the window, so
 * the cost is a handful of operations per pixel whatever the radius. Sampling a k-by-k
 * box per pixel instead would be 289 reads each at the largest kernel, which is what
 * made a wide blur brush unusable.
 *
 * Edges clamp, so the blur does not darken against the borders.
 *
 * @param buffer Pixels to blur. Not modified.
 * @param radius Kernel radius in pixels.
 * @return A blurred copy.
 */
export function boxBlur( buffer: PixelBuffer, radius: number ): PixelBuffer {
	const { width, height } = buffer;
	const span = Math.max( 1, Math.round( radius ) );
	const window = span * 2 + 1;
	const horizontal = new Uint8ClampedArray( buffer.data.length );
	const out = new Uint8ClampedArray( buffer.data.length );

	for ( let y = 0; y < height; y++ ) {
		const row = y * width;
		const sums = [ 0, 0, 0, 0 ];

		// Prime the window with the clamped left edge.
		for ( let i = -span; i <= span; i++ ) {
			const index = ( row + clampInt( i, 0, width - 1 ) ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				sums[ c ] += buffer.data[ index + c ];
			}
		}

		for ( let x = 0; x < width; x++ ) {
			const index = ( row + x ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				horizontal[ index + c ] = sums[ c ] / window;
			}

			const leaving = ( row + clampInt( x - span, 0, width - 1 ) ) * 4;
			const entering = ( row + clampInt( x + span + 1, 0, width - 1 ) ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				sums[ c ] += buffer.data[ entering + c ] - buffer.data[ leaving + c ];
			}
		}
	}

	for ( let x = 0; x < width; x++ ) {
		const sums = [ 0, 0, 0, 0 ];

		for ( let i = -span; i <= span; i++ ) {
			const index = ( clampInt( i, 0, height - 1 ) * width + x ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				sums[ c ] += horizontal[ index + c ];
			}
		}

		for ( let y = 0; y < height; y++ ) {
			const index = ( y * width + x ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				out[ index + c ] = sums[ c ] / window;
			}

			const leaving = ( clampInt( y - span, 0, height - 1 ) * width + x ) * 4;
			const entering =
				( clampInt( y + span + 1, 0, height - 1 ) * width + x ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				sums[ c ] += horizontal[ entering + c ] - horizontal[ leaving + c ];
			}
		}
	}

	return { data: out, width, height };
}
