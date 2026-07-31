/**
 * Reading and writing the look.
 *
 * Every adjustment is one scalar in canonical units, which is what keeps the UI
 * generic: a new op is a schema entry, not a new control. An op sitting at its rest
 * position is dropped from the list rather than stored as a zero, so a recipe stays a
 * description of what was changed.
 */

import {
	IDENTITY_LEVELS,
	isIdentityCurves,
	isIdentityLevels,
	normaliseCurve,
} from '../../engine/lut';
import type { CurvePoint, Curves, Levels } from '../../engine/lut';
import {
	BASE_LAYER_ID,
	createImageLayer,
	isIdentityTransform,
	isNativeCanvas,
} from '../document';
import type { CanvasSize } from '../document';
import type { OpSchema } from '../../types';
import { PANEL_OP_ORDER } from './schema';
import type { OpType, Recipe } from './types';

/**
 * Reads an op's current value, falling back to its rest position when absent.
 *
 * @param recipe Recipe to read.
 * @param type   Op to look up.
 * @param schema Op table, for the default.
 */
export function getOp( recipe: Recipe, type: OpType, schema: OpSchema ): number {
	const op = recipe.ops.find( ( candidate ) => candidate.type === type );

	if ( op ) {
		return op.v;
	}

	return schema[ type ]?.default ?? 0;
}

/**
 * Returns a new recipe with one op set.
 *
 * Immutable, because the undo stack keeps references to previous recipes and
 * mutating in place would silently rewrite history.
 *
 * An op moved back to its rest position is removed rather than stored as a zero,
 * which keeps saved recipes minimal and makes `isIdentity()` a simple length check.
 *
 * @param recipe Recipe to derive from.
 * @param type   Op to set.
 * @param value  New value.
 * @param schema Op table, for the default and bounds.
 */
export function setOp(
	recipe: Recipe,
	type: OpType,
	value: number,
	schema: OpSchema
): Recipe {
	const spec = schema[ type ];
	const clamped = spec
		? Math.min( spec.max, Math.max( spec.min, value ) )
		: value;
	const isDefault =
		spec !== undefined && Math.abs( clamped - spec.default ) < 1e-9;

	const ops = recipe.ops.filter( ( op ) => op.type !== type );

	if ( ! isDefault ) {
		ops.push( { type, v: clamped } );
	}

	// Keep stored order canonical so two equal edits serialise identically.
	ops.sort(
		( a, b ) => PANEL_OP_ORDER.indexOf( a.type ) - PANEL_OP_ORDER.indexOf( b.type )
	);

	return { ...recipe, ops };
}

/**
 * Returns a recipe with every adjustment back at rest.
 *
 * @param recipe Recipe to reset.
 */
export function resetOps( recipe: Recipe, nativeCanvas?: CanvasSize ): Recipe {
	return {
		...recipe,
		ops: [],
		canvas: nativeCanvas ? { ...nativeCanvas } : recipe.canvas,
		// Reset drops added layers along with everything else; the base image is
		// what "reset" means.
		layers: [ createImageLayer( recipe.layers[ 0 ]?.name ?? 'Image' ) ],
		activeLayerId: BASE_LAYER_ID,
		curves: {},
		levels: { ...IDENTITY_LEVELS },
	};
}

/**
 * Returns a new recipe with one curve channel replaced.
 *
 * @param recipe  Recipe to derive from.
 * @param channel Which curve to set.
 * @param points  Control points, or undefined to clear it.
 */
export function setCurve(
	recipe: Recipe,
	channel: keyof Curves,
	points: CurvePoint[] | undefined
): Recipe {
	const curves = { ...recipe.curves };

	if ( ! points ) {
		delete curves[ channel ];
	} else {
		curves[ channel ] = normaliseCurve( points );
	}

	return { ...recipe, curves };
}

/**
 * Returns a new recipe with its levels replaced.
 *
 * @param recipe Recipe to derive from.
 * @param levels New levels.
 */
export function setLevels( recipe: Recipe, levels: Levels ): Recipe {
	return { ...recipe, levels };
}

/**
 * Whether a recipe would leave the source pixels untouched.
 *
 * @param recipe Recipe to test.
 */
export function isIdentity( recipe: Recipe, source?: CanvasSize ): boolean {
	const untouchedCanvas =
		! source || recipe.canvas.width === 0 || isNativeCanvas( recipe.canvas, source );

	return (
		recipe.ops.length === 0 &&
		untouchedCanvas &&
		recipe.layers.length === 1 &&
		recipe.layers[ 0 ].kind === 'image' &&
		isIdentityTransform( recipe.layers[ 0 ].transform ) &&
		isIdentityCurves( recipe.curves ) &&
		isIdentityLevels( recipe.levels )
	);
}
