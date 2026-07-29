/**
 * The edit recipe: the resolution-independent description of an edit.
 *
 * This module is the browser half of a contract whose other half is
 * `includes/recipe.php`. The op list and the validation rules must agree exactly:
 * the client builds a recipe, the server validates and stores it, and the client
 * reads it back to restore every slider. When you add an op, add it here, in
 * `daguerre_op_schema()`, and in `src/engine/color-matrix.ts`.
 */

import {
	BASE_LAYER_ID,
	IDENTITY_TRANSFORM,
	createImageLayer,
	findLayer,
	isIdentityTransform,
	isNativeCanvas,
	normaliseCanvas,
	normaliseLayers,
	normaliseTransform,
	updateLayer,
} from './document';
import type { CanvasSize, Layer, LayerTransform } from './document';
import { IDENTITY_LEVELS, isIdentityCurves, isIdentityLevels, normaliseCurve } from '../engine/lut';
import type { CurvePoint, Curves, Levels } from '../engine/lut';
import type { OpSchema } from '../types';

/**
 * Current recipe schema version.
 *
 * - v2 added `curves` and `levels` beside the scalar `ops`.
 * - v3 replaced the single `geometry` block with a `canvas` and a `layer`. The old
 *   model cropped the source directly, which conflated the surface with what sits
 *   on it; see `src/model/document.ts` for why that had to change.
 * - v4 split the layer's single `scale` into `scaleX` and `scaleY`, so an edge
 *   handle can stretch one axis.
 * - v5 replaced the single `layer` with a `layers` stack, which is what pasting
 *   into a new node requires.
 */
export const RECIPE_VERSION = 5;

/** Every adjustment Daguerre understands. */
export type OpType =
	| 'exposure'
	| 'contrast'
	| 'saturation'
	| 'vibrance'
	| 'temperature'
	| 'tint'
	| 'hue'
	| 'sharpen'
	| 'blur'
	| 'vignette'
	| 'grain';

/** A single adjustment. Every op is one scalar, which is what keeps the UI generic. */
export interface Op {
	type: OpType;
	v: number;
}

/** How the rendered result should be encoded. */
export interface RecipeOutput {
	format: string;
	quality: number;
}

/** A complete edit. */
export interface Recipe {
	version: number;
	source: number;
	ops: Op[];
	/** The output surface, in pixels. Independent of the image on it. */
	canvas: CanvasSize;
	/**
	 * The layer stack, back to front.
	 *
	 * Only `image` layers are reproducible from this description. A `raster` layer
	 * holds pixels that exist nowhere else, so re-opening a saved edit restores its
	 * position but not its content -- see `hasRasterLayers()`.
	 */
	layers: Layer[];
	/** Which layer the tools act on. */
	activeLayerId: string;
	curves: Curves;
	levels: Levels;
	output: RecipeOutput;
}

/**
 * The order adjustments are applied in.
 *
 * Fixed so a given set of slider positions always produces the same pixels,
 * regardless of the order the user happened to touch the sliders. Tone first, then
 * colour, matching the convention of every raw processor.
 *
 * `vibrance` is absent because it is not a linear operation and therefore cannot
 * join the composed colour matrix; it is applied by the shader immediately after.
 */
export const MATRIX_OP_ORDER: OpType[] = [
	'exposure',
	'contrast',
	'temperature',
	'tint',
	'saturation',
	'hue',
];

/** Display order in the adjustments panel. */
export const PANEL_OP_ORDER: OpType[] = [
	'exposure',
	'contrast',
	'temperature',
	'tint',
	'saturation',
	'vibrance',
	'hue',
];

/**
 * Adjustments with a spatial extent, shown in their own panel.
 *
 * These are the ops that break resolution independence if handled carelessly: a
 * radius in pixels means something different on a preview than on a full-size
 * render. Each is therefore stored as a fraction of the image's longest edge and
 * converted to pixels against whatever is actually being rendered.
 */
export const EFFECT_OP_ORDER: OpType[] = [ 'sharpen', 'blur', 'vignette', 'grain' ];

/** Human-readable labels, resolved lazily so translations are loaded first. */
export const OP_LABELS: Record< OpType, string > = {
	exposure: 'Exposure',
	contrast: 'Contrast',
	saturation: 'Saturation',
	vibrance: 'Vibrance',
	temperature: 'Temperature',
	tint: 'Tint',
	hue: 'Hue',
	sharpen: 'Sharpen',
	blur: 'Blur',
	vignette: 'Vignette',
	grain: 'Grain',
};

/**
 * Returns an empty recipe for a source attachment.
 *
 * @param source Attachment ID the pixels come from.
 */
export function defaultRecipe( source: number, canvas?: CanvasSize ): Recipe {
	return {
		version: RECIPE_VERSION,
		source,
		ops: [],
		// Zero means "not sized yet"; the editor fills it from the image on open.
		canvas: canvas ? { ...canvas } : { width: 0, height: 0 },
		layers: [ createImageLayer( 'Image' ) ],
		activeLayerId: BASE_LAYER_ID,
		curves: {},
		levels: { ...IDENTITY_LEVELS },
		output: { format: 'image/jpeg', quality: 0.92 },
	};
}

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
 * Returns a new recipe with the layer transform replaced.
 *
 * @param recipe    Recipe to derive from.
 * @param transform New transform.
 */
export function setLayer( recipe: Recipe, transform: LayerTransform ): Recipe {
	return {
		...recipe,
		layers: updateLayer( recipe.layers, recipe.activeLayerId, {
			transform: normaliseTransform( transform ),
		} ),
	};
}

/**
 * Returns a new recipe with its layer stack replaced.
 *
 * @param recipe Recipe to derive from.
 * @param layers New stack.
 * @param active Optional. Which layer becomes active.
 */
export function setLayers(
	recipe: Recipe,
	layers: Layer[],
	active?: string
): Recipe {
	const stack = layers.length > 0 ? layers : recipe.layers;
	const activeLayerId =
		active && stack.some( ( layer ) => layer.id === active )
			? active
			: stack.some( ( layer ) => layer.id === recipe.activeLayerId )
			? recipe.activeLayerId
			: stack[ stack.length - 1 ].id;

	return { ...recipe, layers: stack, activeLayerId };
}

/** The layer the tools currently act on. */
export function activeLayer( recipe: Recipe ): Layer {
	return findLayer( recipe.layers, recipe.activeLayerId ) ?? recipe.layers[ 0 ];
}

/**
 * Whether the document holds pixels that no recipe can reproduce.
 *
 * Painted and pasted layers are not describable, so an edit containing them is only
 * fully preserved by saving the rendered result.
 *
 * @param recipe Recipe to test.
 */
export function hasRasterLayers( recipe: Recipe ): boolean {
	return recipe.layers.some( ( layer ) => layer.kind === 'raster' );
}

/**
 * Returns a new recipe with the canvas and layer replaced together.
 *
 * They change as a pair, because resizing the surface has to move whatever is on it
 * to keep the picture where the user last saw it.
 *
 * @param recipe    Recipe to derive from.
 * @param canvas    New canvas size.
 * @param transform New layer transform.
 */
export function setDocument(
	recipe: Recipe,
	canvas: CanvasSize,
	transform: LayerTransform
): Recipe {
	return {
		...recipe,
		canvas: normaliseCanvas( canvas, recipe.canvas ),
		layers: updateLayer( recipe.layers, recipe.activeLayerId, {
			transform: normaliseTransform( transform ),
		} ),
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

/**
 * Migrates a recipe from an older schema to the current one.
 *
 * v2 stored a `geometry` block that cropped the source. The equivalent v3 document
 * is a canvas the size of that crop, with the layer rotated by the same angle and
 * offset so the same pixels land in the same place. Sizing that exactly needs the
 * source dimensions, which the caller has and this function does not, so the canvas
 * is left at zero for the editor to fill in -- the rotation and flips, which are
 * the parts a user would notice losing, carry over exactly.
 *
 * @param raw Recipe at any supported version.
 * @return The same edit, expressed at the current version.
 */
export function migrateRecipe( raw: Record< string, unknown > ): Record< string, unknown > {
	const version = Number( raw.version ?? 1 );

	if ( version >= RECIPE_VERSION ) {
		return raw;
	}

	// v3 -> v4 needs nothing beyond the version bump: `normaliseTransform()` reads a
	// legacy uniform `scale` into both axes.
	//
	// v4 -> v5 wraps the single transform in a one-layer stack.
	if ( version >= 3 ) {
		const single = ( raw as { layer?: unknown; layers?: unknown } );

		return {
			...raw,
			version: RECIPE_VERSION,
			layers: single.layers ?? [
				{
					...createImageLayer( 'Image' ),
					transform: normaliseTransform( single.layer ),
				},
			],
			activeLayerId: BASE_LAYER_ID,
		};
	}

	const geometry = ( raw.geometry ?? {} ) as {
		rotate?: number;
		straighten?: number;
		flipH?: boolean;
		flipV?: boolean;
	};

	const migrated = { ...raw };

	delete migrated.geometry;

	migrated.version = RECIPE_VERSION;
	migrated.canvas = { width: 0, height: 0 };
	migrated.activeLayerId = BASE_LAYER_ID;
	migrated.layers = [
		{
			...createImageLayer( 'Image' ),
			transform: {
				...IDENTITY_TRANSFORM,
		rotation: ( Number( geometry.rotate ?? 0 ) + Number( geometry.straighten ?? 0 ) ) || 0,
				flipH: geometry.flipH === true,
				flipV: geometry.flipV === true,
			},
		},
	];

	return migrated;
}

/**
 * Validates and normalises a recipe received from the server or from storage.
 *
 * Deliberately strict, and deliberately the same rules as `daguerre_validate_recipe()`.
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
