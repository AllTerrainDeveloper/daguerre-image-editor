/**
 * Drawing a shape into a canvas-sized bitmap.
 *
 * A bitmap rather than a vector object because the document has no vector layer: a
 * shape is committed as pixels, exactly like a brush stroke, and the transform that
 * moves it afterwards belongs to the layer rather than to the shape.
 */

import { rectFromDrag, starPoints } from './geometry';
import { makeCanvas } from './surface';
import type { PixelPoint, PixelRect, ShapeKind, ShapeStyle } from './types';

/** How a shape should be painted. */
export interface ShapeOptions {
	kind: ShapeKind;
	style: ShapeStyle;
	colour: string;
	strokeWidth: number;
	/** Corner radius for `rounded`, in pixels. */
	radius?: number;
}

/**
 * Draws a shape spanning two dragged corners onto a canvas-sized bitmap.
 *
 * @param width   Canvas width.
 * @param height  Canvas height.
 * @param from    Where the drag started.
 * @param to      Where it ended.
 * @param options What to draw.
 * @return The bitmap, or null when there is nothing to draw.
 */
export function shapeCanvas(
	width: number,
	height: number,
	from: PixelPoint,
	to: PixelPoint,
	options: ShapeOptions
): HTMLCanvasElement | null {
	const surface = makeCanvas( width, height );

	if ( ! surface ) {
		return null;
	}

	const { canvas, ctx } = surface;
	const rect = rectFromDrag( from, to );

	// A line has no area, so it is the one shape a zero-height drag can still draw.
	if ( options.kind !== 'line' && ( rect.width < 1 || rect.height < 1 ) ) {
		return null;
	}

	ctx.beginPath();

	switch ( options.kind ) {
		case 'rect':
			ctx.rect( rect.x, rect.y, rect.width, rect.height );
			break;

		case 'rounded': {
			const radius = Math.min(
				options.radius ?? 16,
				rect.width / 2,
				rect.height / 2
			);

			roundedRect( ctx, rect, radius );
			break;
		}

		case 'ellipse':
			ctx.ellipse(
				rect.x + rect.width / 2,
				rect.y + rect.height / 2,
				rect.width / 2,
				rect.height / 2,
				0,
				0,
				Math.PI * 2
			);
			break;

		case 'line':
			ctx.moveTo( from.x, from.y );
			ctx.lineTo( to.x, to.y );
			break;

		case 'triangle':
			ctx.moveTo( rect.x + rect.width / 2, rect.y );
			ctx.lineTo( rect.x + rect.width, rect.y + rect.height );
			ctx.lineTo( rect.x, rect.y + rect.height );
			ctx.closePath();
			break;

		case 'star':
			starPoints( rect ).forEach( ( point, index ) => {
				if ( index === 0 ) {
					ctx.moveTo( point.x, point.y );
				} else {
					ctx.lineTo( point.x, point.y );
				}
			} );
			ctx.closePath();
			break;
	}

	// A line cannot be filled, whatever the setting says.
	if ( options.style === 'fill' && options.kind !== 'line' ) {
		ctx.fillStyle = options.colour;
		ctx.fill();
	} else {
		ctx.strokeStyle = options.colour;
		ctx.lineWidth = Math.max( 1, options.strokeWidth );
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.stroke();
	}

	return canvas;
}

/**
 * Traces a rounded rectangle.
 *
 * Written out rather than using `roundRect()`, which Safari only shipped in 16.4 --
 * and an editor that silently draws nothing on a slightly older browser is worse than
 * ten lines of arcs.
 *
 * @param ctx    Target context.
 * @param rect   Bounding box.
 * @param radius Corner radius.
 */
function roundedRect(
	ctx: CanvasRenderingContext2D,
	rect: PixelRect,
	radius: number
): void {
	const r = Math.max( 0, radius );

	ctx.moveTo( rect.x + r, rect.y );
	ctx.arcTo( rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, r );
	ctx.arcTo(
		rect.x + rect.width,
		rect.y + rect.height,
		rect.x,
		rect.y + rect.height,
		r
	);
	ctx.arcTo( rect.x, rect.y + rect.height, rect.x, rect.y, r );
	ctx.arcTo( rect.x, rect.y, rect.x + rect.width, rect.y, r );
	ctx.closePath();
}
