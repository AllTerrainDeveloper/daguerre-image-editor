/**
 * 4x5 colour matrices, and how to combine them.
 *
 * One matrix carries every per-pixel colour adjustment, which is why the shader is a
 * single pass: a chain of one-op filters would quantise to 8 bits between each.
 */

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
