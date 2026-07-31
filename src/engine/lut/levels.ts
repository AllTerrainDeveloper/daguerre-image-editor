/**
 * Applying a black point, a white point and a gamma.
 */

import type { Levels } from './types';

/**
 * Evaluates levels across all 256 input levels.
 *
 * @param levels Black point, white point and gamma.
 * @return 256 output levels.
 */
export function sampleLevels( levels: Levels ): Uint8ClampedArray {
	const out = new Uint8ClampedArray( 256 );

	const black = Math.min( 254, Math.max( 0, levels.black ) );
	const white = Math.max( black + 1, Math.min( 255, levels.white ) );
	const gamma = Math.min( 10, Math.max( 0.1, levels.gamma ) );
	const span = white - black;

	for ( let x = 0; x < 256; x++ ) {
		const normalised = Math.min( 1, Math.max( 0, ( x - black ) / span ) );

		out[ x ] = Math.pow( normalised, 1 / gamma ) * 255;
	}

	return out;
}
