/**
 * Drawing a gradient ramp into a canvas-sized bitmap.
 */

import { withAlpha } from './colour';
import { makeCanvas } from './surface';
import type { GradientKind, PixelPoint } from './types';

/**
 * Draws a gradient between two dragged points onto a canvas-sized bitmap.
 *
 * The gradient covers the whole canvas rather than only the dragged span, because that
 * is what a gradient is for: the drag sets the *ramp*, not the extent. Confining it to
 * a region is the selection's job.
 *
 * @param width  Canvas width.
 * @param height Canvas height.
 * @param kind   Linear or radial.
 * @param from   Start of the ramp.
 * @param to     End of the ramp.
 * @param start  Colour at the start.
 * @param end    Colour at the end.
 * @param fade   Whether the end is transparent rather than a colour.
 * @return The bitmap, or null when the drag was too short to define a direction.
 */
export function gradientCanvas(
	width: number,
	height: number,
	kind: GradientKind,
	from: PixelPoint,
	to: PixelPoint,
	start: string,
	end: string,
	fade = false
): HTMLCanvasElement | null {
	const surface = makeCanvas( width, height );
	const span = Math.hypot( to.x - from.x, to.y - from.y );

	if ( ! surface || span < 1 ) {
		return null;
	}

	const { canvas, ctx } = surface;
	const ramp =
		kind === 'linear'
			? ctx.createLinearGradient( from.x, from.y, to.x, to.y )
			: ctx.createRadialGradient( from.x, from.y, 0, from.x, from.y, span );

	ramp.addColorStop( 0, start );
	ramp.addColorStop( 1, fade ? withAlpha( start, 0 ) : end );

	ctx.fillStyle = ramp;
	ctx.fillRect( 0, 0, width, height );

	return canvas;
}
