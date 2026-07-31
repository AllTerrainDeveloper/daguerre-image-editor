/**
 * Rotating hue about the neutral axis.
 *
 * The rotation happens in the plane perpendicular to the greys, so a hue shift moves
 * colours around without dragging the greys off neutral with them.
 */

import { LUMA_B, LUMA_G, LUMA_R } from './matrix';
import type { ColorMatrix } from './matrix';

/** A 3x3 matrix, row-major, used only to derive the hue rotation. */
type Mat3 = [ number, number, number, number, number, number, number, number, number ];

/** Multiplies two 3x3 matrices. */
function multiply3( b: Mat3, a: Mat3 ): Mat3 {
	const out = new Array( 9 ).fill( 0 ) as number[];

	for ( let row = 0; row < 3; row++ ) {
		for ( let col = 0; col < 3; col++ ) {
			let sum = 0;

			for ( let k = 0; k < 3; k++ ) {
				sum += b[ row * 3 + k ] * a[ k * 3 + col ];
			}

			out[ row * 3 + col ] = sum;
		}
	}

	return out as Mat3;
}

/**
 * Projection onto the luminance axis: every row is the weight vector.
 *
 * Idempotent, and it maps neutral grey to itself.
 */
const LUMA_PROJECTION: Mat3 = [
	LUMA_R, LUMA_G, LUMA_B,
	LUMA_R, LUMA_G, LUMA_B,
	LUMA_R, LUMA_G, LUMA_B,
];

/** The complement of the luminance projection: the chroma plane. */
const CHROMA_PROJECTION: Mat3 = [
	1 - LUMA_R, -LUMA_G, -LUMA_B,
	-LUMA_R, 1 - LUMA_G, -LUMA_B,
	-LUMA_R, -LUMA_G, 1 - LUMA_B,
];

/** Cross-product matrix of the normalised neutral axis (1,1,1)/sqrt(3). */
const NEUTRAL_AXIS_CROSS: Mat3 = ( () => {
	const n = 1 / Math.sqrt( 3 );

	return [ 0, -n, n, n, 0, -n, -n, n, 0 ];
} )();

/** The quarter-turn companion to CHROMA_PROJECTION, used as the sine term. */
const CHROMA_QUARTER_TURN: Mat3 = multiply3( CHROMA_PROJECTION, NEUTRAL_AXIS_CROSS );

/**
 * Hue rotation about the luminance axis.
 *
 * Built as `W + cos(t)*A + sin(t)*B`, where `W` projects onto luminance, `A` is its
 * complement (the chroma plane), and `B` is `A` composed with a quarter turn about
 * the neutral axis. That construction has three properties a photo editor needs and
 * that are worth the extra twenty lines:
 *
 * - **Exactly invertible.** Rotating +120 and then -120 returns the original pixel
 *   values, because `H(t)H(-t)` collapses algebraically to the identity.
 * - **Exactly luminance-preserving.** Rotating hue does not change how bright the
 *   image looks.
 * - **Neutrals stay neutral.** Greys cannot acquire a colour cast.
 *
 * The obvious alternative -- the matrix from the SVG filter-effects specification's
 * `feColorMatrix type="hueRotate"` -- has none of these exactly. Its constants are
 * rounded to three decimals, so a round trip drifts by about 1e-5 per channel and
 * luminance by about 2.5e-4. It also hardcodes Rec. 601-era weights that disagree
 * with the Rec. 709 weights saturation uses here, which would make the two
 * adjustments quietly inconsistent about what "grey" means.
 *
 * @param degrees Rotation in degrees.
 */
export function hueMatrix( degrees: number ): ColorMatrix {
	const radians = ( degrees * Math.PI ) / 180;
	const c = Math.cos( radians );
	const s = Math.sin( radians );

	const m = new Array( 9 ) as number[];

	for ( let i = 0; i < 9; i++ ) {
		m[ i ] =
			LUMA_PROJECTION[ i ] +
			c * CHROMA_PROJECTION[ i ] +
			s * CHROMA_QUARTER_TURN[ i ];
	}

	return [
		m[ 0 ], m[ 1 ], m[ 2 ], 0, 0,
		m[ 3 ], m[ 4 ], m[ 5 ], 0, 0,
		m[ 6 ], m[ 7 ], m[ 8 ], 0, 0,
		0, 0, 0, 1, 0,
	];
}
