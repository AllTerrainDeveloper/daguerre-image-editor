/**
 * Reading and writing a loose block of RGBA pixels.
 *
 * The retouching tools all work the same way: lift a rectangle out of a layer, walk it
 * pixel by pixel, and hand the block back. These are the primitives that walk it --
 * sampling, blending and clamping -- kept apart from the dab pipeline because they
 * have no opinion about what a dab is.
 */

import type { Carry, PixelBuffer } from './types';

/**
 * Reads one pixel, clamped to the edges.
 *
 * @param buffer Pixels to read.
 * @param x      Coordinate.
 * @param y      Coordinate.
 */
export function sampleAt( buffer: PixelBuffer, x: number, y: number ): Carry {
	const index =
		( clampInt( Math.round( y ), 0, buffer.height - 1 ) * buffer.width +
			clampInt( Math.round( x ), 0, buffer.width - 1 ) ) *
		4;

	return sampleIndex( buffer, index );
}

/**
 * Reads one pixel by byte index.
 *
 * @param buffer Pixels to read.
 * @param index  Byte offset of the red channel.
 */
export function sampleIndex( buffer: PixelBuffer, index: number ): Carry {
	return [
		buffer.data[ index ],
		buffer.data[ index + 1 ],
		buffer.data[ index + 2 ],
		buffer.data[ index + 3 ],
	];
}

/**
 * Mixes a colour into a pixel.
 *
 * Alpha is left alone: a retouching brush changes what a pixel looks like, never
 * whether it is there. Blurring a transparent hole into existence is the one thing
 * none of these tools should ever do.
 *
 * @param buffer Modified in place.
 * @param index  Byte offset of the red channel.
 * @param colour Colour to mix in.
 * @param weight How much of it, 0..1.
 */
export function blend(
	buffer: PixelBuffer,
	index: number,
	colour: Carry,
	weight: number
): void {
	const w = clamp01( weight );

	for ( let c = 0; c < 3; c++ ) {
		buffer.data[ index + c ] +=
			( colour[ c ] - buffer.data[ index + c ] ) * w;
	}
}

/**
 * Copies a buffer.
 *
 * @param buffer Source.
 */
export function copyBuffer( buffer: PixelBuffer ): PixelBuffer {
	return {
		data: new Uint8ClampedArray( buffer.data ),
		width: buffer.width,
		height: buffer.height,
	};
}

/**
 * Clamps into 0..1.
 *
 * @param value Value.
 */
export function clamp01( value: number ): number {
	return Number.isFinite( value ) ? Math.min( 1, Math.max( 0, value ) ) : 0;
}

/**
 * Clamps an integer into a range.
 *
 * @param value Value.
 * @param min   Lowest.
 * @param max   Highest.
 */
export function clampInt( value: number, min: number, max: number ): number {
	return Math.min( max, Math.max( min, value ) );
}

/**
 * Grows a rectangle by a margin, clipped to the buffer.
 *
 * @param buffer Bounds to stay inside.
 * @param rect   Rectangle to grow.
 * @param margin Pixels to add on every side.
 */
export function grow(
	buffer: PixelBuffer,
	rect: { x: number; y: number; width: number; height: number },
	margin: number
): { x: number; y: number; width: number; height: number } {
	const x0 = Math.max( 0, rect.x - margin );
	const y0 = Math.max( 0, rect.y - margin );
	const x1 = Math.min( buffer.width, rect.x + rect.width + margin );
	const y1 = Math.min( buffer.height, rect.y + rect.height + margin );

	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Copies a rectangle out of a buffer.
 *
 * @param buffer Source.
 * @param rect   Region to lift. Must already be inside the buffer.
 */
export function subBuffer(
	buffer: PixelBuffer,
	rect: { x: number; y: number; width: number; height: number }
): PixelBuffer {
	const data = new Uint8ClampedArray( rect.width * rect.height * 4 );

	for ( let row = 0; row < rect.height; row++ ) {
		const from = ( ( rect.y + row ) * buffer.width + rect.x ) * 4;

		data.set(
			buffer.data.subarray( from, from + rect.width * 4 ),
			row * rect.width * 4
		);
	}

	return { data, width: rect.width, height: rect.height };
}
