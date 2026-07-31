/**
 * The edit recipe.
 *
 * The browser half of a contract whose other half is `includes/recipe.php`. Split by
 * what each part answers: what a recipe *is* (`types`), which ops exist (`schema`),
 * how to change one (`ops`, `layers`), and how to trust one that arrived from
 * somewhere else (`migrate`, `validate`).
 */

export type { Op, OpType, Recipe, RecipeOutput } from './types';
export { RECIPE_VERSION } from './types';

export {
	EFFECT_OP_ORDER,
	MATRIX_OP_ORDER,
	OP_LABELS,
	PANEL_OP_ORDER,
} from './schema';

export { defaultRecipe } from './defaults';

export {
	getOp,
	isIdentity,
	resetOps,
	setCurve,
	setLevels,
	setOp,
} from './ops';

export {
	activeLayer,
	hasRasterLayers,
	setDocument,
	setLayer,
	setLayers,
} from './layers';

export { migrateRecipe } from './migrate';
export { normaliseCurves, normaliseLevels, validateRecipe } from './validate';
