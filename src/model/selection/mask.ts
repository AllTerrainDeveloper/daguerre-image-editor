/**
 * Selections as pixels.
 *
 * A mask is what actually confines painting: an outline tells a tool where the edge
 * is, but only a rasterised alpha channel can tell it how *soft* that edge is. The
 * trace in the other direction -- pixels back to an outline -- is what the magic wand
 * produces.
 */

import { isEmptySelection, selectionBounds } from './bounds';
import type { Selection } from './types';

/**
 * Rasterises a selection into a canvas-sized alpha mask.
 *
 * This is what confines a brush. Testing whether the *centre* of a dab falls inside
 * the selection is not enough: a round brush is wider than its centre, so a stroke
 * along the edge spills over it. Masking the stroke clips every pixel instead.
 *
 * @param selection Selection to rasterise.
 * @param width     Canvas width in pixels.
 * @param height    Canvas height in pixels.
 * @return An opaque-white-on-transparent mask, or null when there is nothing to mask.
 */
export function buildSelectionMask(
	selection: Selection | null,
	width: number,
	height: number
): HTMLCanvasElement | null {
	if ( ! selection || isEmptySelection( selection ) || width < 1 || height < 1 ) {
		return null;
	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = Math.round( width );
	canvas.height = Math.round( height );

	const ctx = canvas.getContext( '2d' );

	if ( ! ctx ) {
		return null;
	}

	ctx.fillStyle = '#fff';
	ctx.beginPath();

	const bounds = selectionBounds( selection );

	if ( selection.shape === 'ellipse' ) {
		ctx.ellipse(
			( bounds.x + bounds.w / 2 ) * canvas.width,
			( bounds.y + bounds.h / 2 ) * canvas.height,
			( bounds.w / 2 ) * canvas.width,
			( bounds.h / 2 ) * canvas.height,
			0,
			0,
			Math.PI * 2
		);
	} else if ( selection.shape === 'rect' ) {
		ctx.rect(
			bounds.x * canvas.width,
			bounds.y * canvas.height,
			bounds.w * canvas.width,
			bounds.h * canvas.height
		);
	} else {
		selection.points.forEach( ( point, index ) => {
			const x = point.x * canvas.width;
			const y = point.y * canvas.height;

			if ( index === 0 ) {
				ctx.moveTo( x, y );
			} else {
				ctx.lineTo( x, y );
			}
		} );

		ctx.closePath();
	}

	ctx.fill();

	return canvas;
}

/**
 * Clips a lifted region to the selection's actual shape.
 *
 * Pixels are read out of the renderer as a rectangle, because that is the only shape a
 * texture read has -- but the *selection* is very often not one. Copying an ellipse or a
 * lasso without this step yields its bounding box, corners and all, which is not what
 * anyone drew.
 *
 * The mask is rasterised at canvas size and drawn offset, so it lines up with the region
 * pixel for pixel however the region was cropped. `destination-in` keeps the region only
 * where the mask is opaque, which is exactly the selection.
 *
 * A rectangular selection is unaffected: its bounding box is its shape.
 *
 * @param region    Lifted pixels, modified in place.
 * @param selection Shape to clip to.
 * @param canvas    Canvas size the selection is expressed against.
 * @param origin    Where the region's top-left corner sits, in canvas pixels.
 * @return True when the region was clipped.
 */
export function clipToSelection(
	region: HTMLCanvasElement,
	selection: Selection,
	canvas: { width: number; height: number },
	origin: { x: number; y: number }
): boolean {
	const mask = buildSelectionMask( selection, canvas.width, canvas.height );
	const ctx = region.getContext( '2d' );

	if ( ! mask || ! ctx ) {
		return false;
	}

	ctx.save();
	ctx.globalCompositeOperation = 'destination-in';
	ctx.drawImage( mask, -Math.round( origin.x ), -Math.round( origin.y ) );
	ctx.restore();

	return true;
}
