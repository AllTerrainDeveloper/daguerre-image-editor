/**
 * Composes every linear adjustment into a single colour matrix.
 *
 * Exposure, contrast, temperature, tint, saturation and hue are all affine
 * transforms of RGB, so all six can be multiplied into one 4x5 matrix and applied
 * in a single shader pass. That is not just a speed optimisation: each pass writes
 * to an 8-bit render target, so six chained passes quantise six times and produce
 * visible banding in smooth gradients like skies. One pass quantises once.
 *
 * Vibrance is the exception. It scales saturation by how saturated a pixel already
 * is, which is not linear and cannot be expressed as a matrix. It travels alongside
 * the matrix as a separate uniform and the shader applies it immediately after.
 *
 * This module is pure arithmetic with no Pixi import, so it is unit-tested in jsdom
 * without a GPU.
 */

import type { Op, OpType } from '../model/recipe';
import { MATRIX_OP_ORDER } from '../model/recipe';
import type { OpSchema } from '../types';

/**
 * A colour matrix: 4 rows of 5 columns, row-major.
 *
 * Row `i` computes output channel `i` as
 * `m[i*5+0]*r + m[i*5+1]*g + m[i*5+2]*b + m[i*5+3]*a + m[i*5+4]`,
 * with all channels normalised to 0..1.
 */
export type ColorMatrix = number[];

/** Rec. 709 luminance weights, matching the sRGB primaries the browser composites in. */
export const LUMA_R = 0.2126;
export const LUMA_G = 0.7152;
export const LUMA_B = 0.0722;

/** The do-nothing matrix. */
export const IDENTITY: ColorMatrix = [
	1, 0, 0, 0, 0,
	0, 1, 0, 0, 0,
	0, 0, 1, 0, 0,
	0, 0, 0, 1, 0,
];

/**
 * Multiplies two colour matrices.
 *
 * The result applies `a` first and then `b`, matching how function composition
 * reads. Both operands are treated as 5x5 matrices whose implicit last row is
 * `[0, 0, 0, 0, 1]`, which is what makes the translation column compose correctly.
 *
 * @param b Matrix applied second.
 * @param a Matrix applied first.
 * @return The combined matrix.
 */
export function multiply( b: ColorMatrix, a: ColorMatrix ): ColorMatrix {
	const out: ColorMatrix = new Array( 20 ).fill( 0 );

	for ( let row = 0; row < 4; row++ ) {
		for ( let col = 0; col < 5; col++ ) {
			let sum = 0;

			for ( let k = 0; k < 4; k++ ) {
				sum += b[ row * 5 + k ] * a[ k * 5 + col ];
			}

			// The implicit fifth row of `a` contributes b's own translation.
			if ( col === 4 ) {
				sum += b[ row * 5 + 4 ];
			}

			out[ row * 5 + col ] = sum;
		}
	}

	return out;
}

/**
 * Exposure, in stops.
 *
 * The slider's -1..1 maps to plus or minus two stops, which is the useful range for
 * correcting a mis-metered photograph without turning the sliders into a novelty.
 *
 * @param v Slider value, -1..1.
 */
export function exposureMatrix( v: number ): ColorMatrix {
	const scale = Math.pow( 2, v * 2 );

	return [
		scale, 0, 0, 0, 0,
		0, scale, 0, 0, 0,
		0, 0, scale, 0, 0,
		0, 0, 0, 1, 0,
	];
}

/**
 * Contrast, pivoting around mid grey.
 *
 * @param v Slider value, -1..1. At -1 the image collapses to flat grey.
 */
export function contrastMatrix( v: number ): ColorMatrix {
	const c = 1 + v;
	const offset = 0.5 * ( 1 - c );

	return [
		c, 0, 0, 0, offset,
		0, c, 0, 0, offset,
		0, 0, c, 0, offset,
		0, 0, 0, 1, 0,
	];
}

/**
 * Saturation, interpolating each channel towards its luminance.
 *
 * @param v Slider value, -1..1. At -1 the image is monochrome; at +1, doubled.
 */
export function saturationMatrix( v: number ): ColorMatrix {
	const s = 1 + v;
	const ir = LUMA_R * ( 1 - s );
	const ig = LUMA_G * ( 1 - s );
	const ib = LUMA_B * ( 1 - s );

	return [
		ir + s, ig, ib, 0, 0,
		ir, ig + s, ib, 0, 0,
		ir, ig, ib + s, 0, 0,
		0, 0, 0, 1, 0,
	];
}

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

/**
 * Colour temperature, as a red/blue channel gain.
 *
 * A true Kelvin conversion would require knowing the capture illuminant and
 * working in a linear colour space. This is the same approximation every browser
 * photo editor uses: push red up and blue down for warmer, the reverse for cooler.
 * Green is untouched so the shift stays on the blue-yellow axis.
 *
 * @param v Slider value, -1..1. Positive is warmer.
 */
export function temperatureMatrix( v: number ): ColorMatrix {
	const r = 1 + 0.2 * v;
	const b = 1 - 0.2 * v;

	return [
		r, 0, 0, 0, 0,
		0, 1, 0, 0, 0,
		0, 0, b, 0, 0,
		0, 0, 0, 1, 0,
	];
}

/**
 * Tint, on the green/magenta axis perpendicular to temperature.
 *
 * Red and blue move together by half of green's opposite so overall luminance
 * stays roughly where it was.
 *
 * @param v Slider value, -1..1. Positive is magenta.
 */
export function tintMatrix( v: number ): ColorMatrix {
	const g = 1 - 0.15 * v;
	const rb = 1 + 0.075 * v;

	return [
		rb, 0, 0, 0, 0,
		0, g, 0, 0, 0,
		0, 0, rb, 0, 0,
		0, 0, 0, 1, 0,
	];
}

/**
 * Builds the matrix for one op at one value.
 *
 * @param type Op type.
 * @param v    Value.
 * @return The matrix, or the identity for ops that are not matrix-expressible.
 */
export function matrixForOp( type: OpType, v: number ): ColorMatrix {
	switch ( type ) {
		case 'exposure':
			return exposureMatrix( v );
		case 'contrast':
			return contrastMatrix( v );
		case 'saturation':
			return saturationMatrix( v );
		case 'temperature':
			return temperatureMatrix( v );
		case 'tint':
			return tintMatrix( v );
		case 'hue':
			return hueMatrix( v );
		default:
			// `vibrance` reaches here; it is carried as a separate uniform.
			return IDENTITY;
	}
}

/** Everything the adjustment shader needs for one frame. */
export interface AdjustUniforms {
	/** The six linear adjustments, collapsed into one matrix. */
	matrix: ColorMatrix;
	/** Vibrance, applied after the matrix because it is not linear. */
	vibrance: number;
	/** Unsharp mask amount. Spatial, so it scales with the render target. */
	sharpen: number;
	/** Corner darkening. Negative brightens instead. */
	vignette: number;
	/** Film grain amount. */
	grain: number;
	/** Blur amount, handled by a separate pass rather than in this shader. */
	blur: number;
}

/**
 * Collapses a recipe's ops into the uniforms for a single shader pass.
 *
 * Ops are applied in `MATRIX_OP_ORDER` regardless of the order they appear in the
 * recipe, so the same slider positions always yield the same pixels.
 *
 * @param ops    Recipe ops.
 * @param schema Op table, used to skip values sitting at their rest position.
 * @return Uniforms for the adjustment shader.
 */
export function composeAdjustments( ops: Op[], schema: OpSchema ): AdjustUniforms {
	const byType = new Map< string, number >();

	for ( const op of ops ) {
		byType.set( op.type, op.v );
	}

	let matrix = IDENTITY;

	for ( const type of MATRIX_OP_ORDER ) {
		const value = byType.get( type );

		if ( value === undefined ) {
			continue;
		}

		const rest = schema[ type ]?.default ?? 0;

		if ( Math.abs( value - rest ) < 1e-9 ) {
			continue;
		}

		matrix = multiply( matrixForOp( type, value ), matrix );
	}

	return {
		matrix,
		vibrance: byType.get( 'vibrance' ) ?? 0,
		sharpen: byType.get( 'sharpen' ) ?? 0,
		vignette: byType.get( 'vignette' ) ?? 0,
		grain: byType.get( 'grain' ) ?? 0,
		blur: byType.get( 'blur' ) ?? 0,
	};
}

/**
 * Applies a matrix to a single normalised RGBA colour.
 *
 * Used by the tests to assert that a composed matrix agrees with applying the same
 * ops one at a time. Not used at runtime -- the GPU does this.
 *
 * @param m     Matrix.
 * @param rgba  Colour, each channel 0..1.
 * @return Transformed colour, unclamped.
 */
export function applyMatrix(
	m: ColorMatrix,
	rgba: [ number, number, number, number ]
): [ number, number, number, number ] {
	const [ r, g, b, a ] = rgba;

	return [
		m[ 0 ] * r + m[ 1 ] * g + m[ 2 ] * b + m[ 3 ] * a + m[ 4 ],
		m[ 5 ] * r + m[ 6 ] * g + m[ 7 ] * b + m[ 8 ] * a + m[ 9 ],
		m[ 10 ] * r + m[ 11 ] * g + m[ 12 ] * b + m[ 13 ] * a + m[ 14 ],
		m[ 15 ] * r + m[ 16 ] * g + m[ 17 ] * b + m[ 18 ] * a + m[ 19 ],
	];
}
