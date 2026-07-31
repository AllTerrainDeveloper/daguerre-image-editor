/**
 * Bringing an older recipe up to the current schema.
 */

import {
	BASE_LAYER_ID,
	IDENTITY_TRANSFORM,
	createImageLayer,
	normaliseTransform,
} from '../document';
import { RECIPE_VERSION } from './types';

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
