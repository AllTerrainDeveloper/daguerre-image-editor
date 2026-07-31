/**
 * The pixel-level retouching tools.
 *
 * These run on the CPU rather than as a shader, because every one of them needs to
 * read neighbouring pixels of the *result so far* -- healing samples a ring around the
 * dab, smudge carries colour from the previous dab -- and a fragment shader cannot see
 * its own output.
 */

export type {
	Carry,
	DabRequest,
	DabResult,
	PixelBuffer,
	PixelOp,
} from './types';
export { RETOUCH_MODES, TONE_MODES } from './types';

export { applyPixelDab } from './dab';
export { boxBlur } from './blur';
export { dabFalloff, dabRect, ringAverage } from './geometry';
export { copyBuffer, sampleAt } from './buffer';
