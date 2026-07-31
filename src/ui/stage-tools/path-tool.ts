/**
 * Painting a placed path.
 *
 * Reuses the same 2D-context drawing the shape tool commits with, which is why a pen
 * tool cost a dozen lines rather than a vector subsystem.
 */

import type { Point } from '../../model/selection';
import type { StageToolsOptions } from './types';

/**
 * Paints the placed path with the current colour and style.
 *
 * Called when the path is closed with Enter.
 *
 * @param options Tool wiring.
 * @param points  Vertices, in normalised canvas coordinates.
 * @return Whether anything was drawn.
 */
export function paintPath(
	options: StageToolsOptions,
	points: Point[]
): boolean {
	const canvas = options.getCanvas();
	const brush = options.getBrush();

	// Two points is a line, not a region; there is nothing to close.
	if ( points.length < 3 ) {
		return false;
	}

	const surface = document.createElement( 'canvas' );

	surface.width = canvas.width;
	surface.height = canvas.height;

	const ctx = surface.getContext( '2d' );

	if ( ! ctx ) {
		return false;
	}

	ctx.beginPath();
	points.forEach( ( point, index ) => {
		const x = point.x * canvas.width;
		const y = point.y * canvas.height;

		if ( 0 === index ) {
			ctx.moveTo( x, y );
		} else {
			ctx.lineTo( x, y );
		}
	} );
	ctx.closePath();

	if ( 'fill' === brush.shapeStyle ) {
		ctx.fillStyle = brush.colour;
		ctx.fill();
	} else {
		ctx.strokeStyle = brush.colour;
		ctx.lineWidth = Math.max( 1, brush.strokeWidth );
		ctx.lineJoin = 'round';
		ctx.stroke();
	}

	options.composite( options.getTargetLayerId(), surface, 0, 0, brush.opacity );
	options.onStrokeEnd();

	return true;
}
