/**
 * What a selection is.
 *
 * A closed path in normalised canvas coordinates, whatever shape drew it. Storing
 * every shape as a path rather than as a rectangle-plus-a-kind is what lets one mask
 * builder, one outline renderer and one clipping routine serve all four tools -- and
 * it is the mask that matters, because painting has to be confined to the selected
 * pixels rather than merely started inside them.
 */

/** A point in normalised 0..1 canvas coordinates. */
export interface Point {
	x: number;
	y: number;
}

/** How a selection was drawn. */
export type SelectionShape = 'rect' | 'ellipse' | 'lasso' | 'polygon';

/** The shapes on offer, in picker order. */
export const SELECTION_SHAPES: Array< { value: SelectionShape; label: string } > = [
	{ value: 'rect', label: 'Rectangle' },
	{ value: 'ellipse', label: 'Ellipse' },
	{ value: 'lasso', label: 'Freeform' },
	{ value: 'polygon', label: 'Polygon' },
];

/** A selected region. */
export interface Selection {
	shape: SelectionShape;
	/**
	 * The path.
	 *
	 * For `rect` and `ellipse` these are two opposite corners of the bounding box.
	 * For `lasso` and `polygon` they are the vertices, implicitly closed.
	 */
	points: Point[];
}

/** How many points a lasso keeps; enough for a smooth outline, few enough to stay fast. */
export const MAX_LASSO_POINTS = 600;
