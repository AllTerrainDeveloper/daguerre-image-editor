/**
 * Rectangles in normalised canvas coordinates.
 *
 * Normalised rather than pixels, because a crop rectangle has to survive the canvas
 * being resized underneath it -- which is exactly what applying a crop does.
 */

/** A rectangle in normalised 0..1 canvas coordinates. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * The largest rectangle of a given aspect ratio that fits, centred, in the canvas.
 *
 * @param aspect       Width divided by height. Zero or negative means "leave as is".
 * @param canvasAspect Aspect ratio of the canvas the rectangle sits in.
 */
export function centredCrop( aspect: number, canvasAspect: number ): Rect {
	if ( ! Number.isFinite( aspect ) || aspect <= 0 ) {
		return { x: 0, y: 0, w: 1, h: 1 };
	}

	// Both are real-world proportions, but the rectangle lives in a unit square.
	// Dividing by the canvas's own aspect converts between the two.
	const relative = aspect / canvasAspect;

	if ( relative >= 1 ) {
		const h = 1 / relative;

		return { x: 0, y: ( 1 - h ) / 2, w: 1, h };
	}

	return { x: ( 1 - relative ) / 2, y: 0, w: relative, h: 1 };
}

/**
 * Constrains a rectangle to the unit square, keeping it non-degenerate.
 *
 * @param rect Rectangle to clamp.
 */
export function clampRect( rect: Rect ): Rect {
	const min = 0.01;

	const w = Math.min( 1, Math.max( min, rect.w ) );
	const h = Math.min( 1, Math.max( min, rect.h ) );

	return {
		x: Math.min( 1 - w, Math.max( 0, rect.x ) ),
		y: Math.min( 1 - h, Math.max( 0, rect.y ) ),
		w,
		h,
	};
}
