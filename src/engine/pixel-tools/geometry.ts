/**
 * The shape of a dab.
 */

import type { Carry, PixelBuffer } from './types';
import { clamp01, sampleAt } from './buffer';

/**
 * The pixels a dab covers, clipped to the buffer.
 *
 * @param buffer Target.
 * @param cx     Dab centre.
 * @param cy     Dab centre.
 * @param radius Dab radius.
 * @return Integer rectangle, or null when the dab is entirely off-buffer.
 */
export function dabRect(
	buffer: PixelBuffer,
	cx: number,
	cy: number,
	radius: number
): { x: number; y: number; width: number; height: number } | null {
	const x0 = Math.max( 0, Math.floor( cx - radius ) );
	const y0 = Math.max( 0, Math.floor( cy - radius ) );
	const x1 = Math.min( buffer.width, Math.ceil( cx + radius ) + 1 );
	const y1 = Math.min( buffer.height, Math.ceil( cy + radius ) + 1 );

	if ( x1 <= x0 || y1 <= y0 ) {
		return null;
	}

	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * How much of a dab lands on one pixel.
 *
 * Smoothstepped rather than linear, so overlapping dabs along a stroke add up to an
 * even band instead of a row of visible ridges.
 *
 * @param x        Pixel.
 * @param y        Pixel.
 * @param cx       Dab centre.
 * @param cy       Dab centre.
 * @param radius   Dab radius.
 * @param hardness 0 is a full gradient, 1 is a hard edge.
 */
export function dabFalloff(
	x: number,
	y: number,
	cx: number,
	cy: number,
	radius: number,
	hardness: number
): number {
	const distance = Math.hypot( x + 0.5 - cx, y + 0.5 - cy );

	if ( distance >= radius ) {
		return 0;
	}

	const inner = radius * clamp01( hardness );

	if ( distance <= inner ) {
		return 1;
	}

	const t = 1 - ( distance - inner ) / Math.max( radius - inner, 1e-6 );

	return t * t * ( 3 - 2 * t );
}

/**
 * The mean colour of a ring just outside a dab.
 *
 * @param buffer Pixels to read.
 * @param cx     Dab centre.
 * @param cy     Dab centre.
 * @param radius Dab radius.
 * @return Mean RGBA, or null when the ring fell entirely outside the buffer.
 */
export function ringAverage(
	buffer: PixelBuffer,
	cx: number,
	cy: number,
	radius: number
): Carry | null {
	const total: Carry = [ 0, 0, 0, 0 ];
	let count = 0;

	// 32 samples is enough to average out noise without being worth optimising.
	for ( let i = 0; i < 32; i++ ) {
		const angle = ( i / 32 ) * Math.PI * 2;
		const x = Math.round( cx + Math.cos( angle ) * radius * 1.35 );
		const y = Math.round( cy + Math.sin( angle ) * radius * 1.35 );

		if ( x < 0 || y < 0 || x >= buffer.width || y >= buffer.height ) {
			continue;
		}

		const sample = sampleAt( buffer, x, y );

		for ( let c = 0; c < 4; c++ ) {
			total[ c ] += sample[ c ];
		}

		count++;
	}

	if ( count === 0 ) {
		return null;
	}

	return [
		total[ 0 ] / count,
		total[ 1 ] / count,
		total[ 2 ] / count,
		total[ 3 ] / count,
	];
}
