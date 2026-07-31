/**
 * Validating a recipe received from the server or from storage.
 *
 * Deliberately strict, and deliberately the same rules as `lienzo_validate_recipe()`.
 * A recipe that survives one and not the other is a bug in whichever is more
 * permissive, so the two are written to be read side by side.
 */

import { IDENTITY_LEVELS, normaliseCurve } from '../../engine/lut';
import type { CurvePoint, Curves, Levels } from '../../engine/lut';
import { normaliseCanvas, normaliseLayers } from '../document';
import type { OpSchema } from '../../types';
import { migrateRecipe } from './migrate';
import { PANEL_OP_ORDER } from './schema';
import { RECIPE_VERSION } from './types';
import type { Op, OpType, Recipe, RecipeOutput } from './types';

/**
 * Validates and normalises a recipe received from the server or from storage.
 *
 * Deliberately strict, and deliberately the same rules as `lienzo_validate_recipe()`.
 * An unknown op is an error rather than something to drop: a recipe that quietly
 * loses an op would restore sliders that do not match the pixels on screen.
 *
 * @param raw    Parsed JSON, or a JSON string.
 * @param schema Op table to validate against.
 * @return The normalised recipe.
 * @throws {Error} When the recipe is not usable.
 */
export function validateRecipe( raw: unknown, schema: OpSchema ): Recipe {
	let input = raw;

	if ( typeof input === 'string' ) {
		try {
			input = JSON.parse( input );
		} catch {
			throw new Error( 'The edit recipe was not valid JSON.' );
		}
	}

	if ( ! input || typeof input !== 'object' || Array.isArray( input ) ) {
		throw new Error( 'The edit recipe must be an object.' );
	}

	const rawVersion = Number( ( input as { version?: unknown } ).version ?? 0 );

	if ( ! Number.isInteger( rawVersion ) || rawVersion < 1 || rawVersion > RECIPE_VERSION ) {
		throw new Error( `Unsupported recipe version ${ rawVersion }.` );
	}

	const candidate = migrateRecipe(
		input as Record< string, unknown >
	) as unknown as Partial< Recipe >;

	const source = Number( candidate.source ?? 0 );

	if ( ! Number.isInteger( source ) || source <= 0 ) {
		throw new Error( 'The edit recipe must name the attachment its pixels came from.' );
	}

	const rawOps = candidate.ops;

	if ( rawOps !== undefined && ! Array.isArray( rawOps ) ) {
		throw new Error( 'The edit recipe operations must be a list.' );
	}

	const ops: Op[] = [];
	const seen = new Set< string >();

	for ( const op of rawOps ?? [] ) {
		if ( ! op || typeof op !== 'object' || typeof op.type !== 'string' ) {
			throw new Error( 'Every recipe operation must be an object with a type.' );
		}

		const spec = schema[ op.type ];

		if ( ! spec ) {
			throw new Error( `Unknown recipe operation "${ op.type }".` );
		}

		if ( seen.has( op.type ) ) {
			throw new Error( `Recipe operation "${ op.type }" appears more than once.` );
		}

		const value = Number( op.v );

		if ( ! Number.isFinite( value ) ) {
			throw new Error( `Recipe operation "${ op.type }" is missing a numeric value.` );
		}

		if ( value < spec.min || value > spec.max ) {
			throw new Error(
				`Recipe operation "${ op.type }" must be between ${ spec.min } and ${ spec.max }.`
			);
		}

		seen.add( op.type );

		if ( Math.abs( value - spec.default ) < 1e-9 ) {
			continue;
		}

		ops.push( { type: op.type as OpType, v: value } );
	}

	const output = ( candidate.output ?? {} ) as Partial< RecipeOutput >;
	const format = typeof output.format === 'string' ? output.format : 'image/jpeg';
	const quality = Number( output.quality ?? 0.92 );

	if ( ! Number.isFinite( quality ) || quality < 0.1 || quality > 1 ) {
		throw new Error( 'Output quality must be between 0.1 and 1.0.' );
	}

	ops.sort(
		( a, b ) => PANEL_OP_ORDER.indexOf( a.type ) - PANEL_OP_ORDER.indexOf( b.type )
	);

	const layers = normaliseLayers( candidate.layers );
	const activeLayerId = layers.some( ( layer ) => layer.id === candidate.activeLayerId )
		? ( candidate.activeLayerId as string )
		: layers[ layers.length - 1 ].id;

	return {
		version: RECIPE_VERSION,
		source,
		ops,
		canvas: normaliseCanvas( candidate.canvas, { width: 0, height: 0 } ),
		layers,
		activeLayerId,
		curves: normaliseCurves( candidate.curves ),
		levels: normaliseLevels( candidate.levels ),
		output: { format, quality },
	};
}

/**
 * Validates a curve set, dropping channels that are linear anyway.
 *
 * @param raw Candidate curves.
 */
export function normaliseCurves( raw: unknown ): Curves {
	if ( ! raw || typeof raw !== 'object' ) {
		return {};
	}

	const input = raw as Curves;
	const out: Curves = {};

	for ( const channel of [ 'rgb', 'r', 'g', 'b' ] as const ) {
		const points = input[ channel ];

		if ( ! Array.isArray( points ) || points.length < 2 ) {
			continue;
		}

		const normalised = normaliseCurve( points as CurvePoint[] );

		// A stored linear curve is noise; dropping it keeps `isIdentity()` honest.
		if ( normalised.every( ( [ x, y ] ) => Math.abs( x - y ) < 0.5 ) ) {
			continue;
		}

		out[ channel ] = normalised;
	}

	return out;
}

/**
 * Validates levels, clamping to a usable range.
 *
 * @param raw Candidate levels.
 */
export function normaliseLevels( raw: unknown ): Levels {
	if ( ! raw || typeof raw !== 'object' ) {
		return { ...IDENTITY_LEVELS };
	}

	const input = raw as Partial< Levels >;
	const black = Number( input.black ?? 0 );
	const white = Number( input.white ?? 255 );
	const gamma = Number( input.gamma ?? 1 );

	const safeBlack = Number.isFinite( black ) ? Math.min( 254, Math.max( 0, black ) ) : 0;
	const safeWhite = Number.isFinite( white )
		? Math.min( 255, Math.max( safeBlack + 1, white ) )
		: 255;

	return {
		black: safeBlack,
		white: safeWhite,
		gamma: Number.isFinite( gamma ) ? Math.min( 10, Math.max( 0.1, gamma ) ) : 1,
	};
}
