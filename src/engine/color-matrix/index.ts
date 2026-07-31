/**
 * The colour maths behind the adjustment shader.
 */

export type { ColorMatrix } from './matrix';
export { IDENTITY, LUMA_B, LUMA_G, LUMA_R, multiply } from './matrix';

export {
	contrastMatrix,
	exposureMatrix,
	saturationMatrix,
	temperatureMatrix,
	tintMatrix,
} from './adjustments';

export { hueMatrix } from './hue';

export type { AdjustUniforms } from './compose';
export { applyMatrix, composeAdjustments, matrixForOp } from './compose';
