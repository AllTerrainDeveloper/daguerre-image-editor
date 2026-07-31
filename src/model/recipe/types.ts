/**
 * The edit recipe: the resolution-independent description of an edit.
 *
 * This module is the browser half of a contract whose other half is
 * `includes/recipe.php`. The op list and the validation rules must agree exactly:
 * the client builds a recipe, the server validates and stores it, and the client
 * reads it back to restore every slider. When you add an op, add it here, in
 * `lienzo_op_schema()`, and in `src/engine/color-matrix.ts`.
 */

import type { CanvasSize, Layer } from '../document';
import type { Curves, Levels } from '../../engine/lut';

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

/** Every adjustment Lienzo understands. */
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
