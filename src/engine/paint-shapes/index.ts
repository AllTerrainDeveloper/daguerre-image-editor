/**
 * Everything drawn with a 2D context rather than a brush stamp.
 *
 * Shapes, gradients and text all end up as a bitmap the renderer composites into a
 * layer, so they share one surface helper and one colour parser.
 */

export type {
	GradientKind,
	PixelPoint,
	PixelRect,
	ShapeKind,
	ShapeStyle,
} from './types';
export { GRADIENT_KINDS, SHAPE_KINDS } from './types';

export { rectFromDrag, squareDrag, starPoints } from './geometry';
export { hexToRgb, rgbToHex, withAlpha } from './colour';

export type { ShapeOptions } from './shapes';
export { shapeCanvas } from './shapes';

export { gradientCanvas } from './gradient';

export type { TextOptions } from './text';
export { FONT_STACKS, cssFont, textCanvas } from './text';
