/**
 * Which ops exist, in which order, under which names.
 *
 * Three different orders, because they answer three different questions: what the
 * maths needs, what reads well in a panel, and what belongs under "effects" rather
 * than "adjustments". Keeping them apart is what stops a rendering decision from
 * silently rearranging the sidebar.
 */

import type { OpType } from './types';

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
