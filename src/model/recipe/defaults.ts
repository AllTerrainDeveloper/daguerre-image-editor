/**
 * A recipe that describes no edit at all.
 */

import { IDENTITY_LEVELS } from '../../engine/lut';
import { BASE_LAYER_ID, createImageLayer } from '../document';
import type { CanvasSize } from '../document';
import { RECIPE_VERSION } from './types';
import type { Recipe } from './types';

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
