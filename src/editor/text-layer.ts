/**
 * Text as a layer.
 *
 * Not painted into the shared raster layer. Text is an object: you want to move it,
 * scale it, put something behind it or throw it away without touching anything else --
 * and none of that is possible once it has been flattened into a canvas-sized sheet
 * along with every brush stroke. So each commit becomes a layer whose texture is
 * exactly the size of the glyphs, positioned where they were typed.
 *
 * This is the same path a paste takes, for the same reason.
 */

import { textCanvas } from '../engine/paint-shapes';
import { createRasterLayer } from '../model/document';
import type { CanvasSize } from '../model/document';
import { textLayerName } from './image-source';
import type { ImportTarget } from './layer-import';

/**
 * Turns typed text into a layer of its own.
 *
 * Not painted into the shared raster layer. Text is an object: you want to move it,
 * scale it, put something behind it or throw it away without touching anything else --
 * and none of that is possible once it has been flattened into a canvas-sized sheet
 * along with every brush stroke. So each commit becomes a layer whose texture is
 * exactly the size of the glyphs, positioned where they were typed.
 *
 * This is the same path a paste takes, for the same reason.
 *
 * @param target Editor to add to.
 * @param text   What was typed.
 * @param point  Canvas coordinates of the first line's top-left corner.
 * @return True when a layer was added.
 */
export function drawTextLayer(
	target: ImportTarget,
	text: string,
	point: { x: number; y: number }
): boolean {
	const renderer = target.renderer;
	const style = target.getTextStyle();
	const rendered = textCanvas( { text, ...style } );

	if ( ! renderer || ! rendered ) {
		return false;
	}

	const recipe = target.store.current;
	const canvas: CanvasSize = recipe.canvas;

	if ( canvas.width < 1 || canvas.height < 1 ) {
		return false;
	}

	// A layer is positioned by its centre, and the text was placed by the top-left
	// corner of its first line -- so the bitmap's own size closes the gap.
	const layer = createRasterLayer( textLayerName( text ), {
		x: ( point.x + rendered.offsetX + rendered.canvas.width / 2 ) / canvas.width,
		y: ( point.y + rendered.offsetY + rendered.canvas.height / 2 ) / canvas.height,
	} );

	renderer.addRasterTexture( layer.id, rendered.canvas );
	target.store.setLayers( [ ...recipe.layers, layer ], layer.id );

	return true;
}
