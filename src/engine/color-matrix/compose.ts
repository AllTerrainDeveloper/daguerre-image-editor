/**
 * Folding a recipe's ops into what the shader needs.
 *
 * The matrix ops multiply together into one matrix; the rest -- vibrance, sharpen,
 * vignette, grain, blur -- cannot be expressed as a matrix at all and travel alongside
 * it as their own uniforms.
 */

import { MATRIX_OP_ORDER } from '../../model/recipe';
import type { Op, OpType } from '../../model/recipe';
import type { OpSchema } from '../../types';
import {
	contrastMatrix,
	exposureMatrix,
	saturationMatrix,
	temperatureMatrix,
	tintMatrix,
} from './adjustments';
import { hueMatrix } from './hue';
import { IDENTITY, multiply } from './matrix';
import type { ColorMatrix } from './matrix';

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
