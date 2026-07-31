/**
 * What can be drawn, and the rectangles it is drawn into.
 */

/** A rectangle in pixels. */
export interface PixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A point in pixels. */
export interface PixelPoint {
	x: number;
	y: number;
}

/** How a gradient is laid out. */
export type GradientKind = 'linear' | 'radial';

/** What the shape tool draws. */
export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'line' | 'triangle' | 'star';

/** Whether a shape is filled, outlined, or both. */
export type ShapeStyle = 'fill' | 'stroke';

/** The gradients on offer, in picker order. */
export const GRADIENT_KINDS: Array< { value: GradientKind; label: string } > = [
	{ value: 'linear', label: 'Linear' },
	{ value: 'radial', label: 'Radial' },
];

/** The shapes on offer, in picker order. */
export const SHAPE_KINDS: Array< { value: ShapeKind; label: string } > = [
	{ value: 'rect', label: 'Rectangle' },
	{ value: 'rounded', label: 'Rounded' },
	{ value: 'ellipse', label: 'Ellipse' },
	{ value: 'line', label: 'Line' },
	{ value: 'triangle', label: 'Triangle' },
	{ value: 'star', label: 'Star' },
];
