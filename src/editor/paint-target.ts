/**
 * Choosing where a brush stroke lands.
 *
 * Painting onto the base image layer would destroy the original pixels, and the whole
 * plugin rests on not doing that -- so a stroke aimed at it silently gets a new raster
 * layer instead.
 */

import { __ } from '../i18n';
import { createRasterLayer } from '../model/document';
import type { CanvasSize } from '../model/document';
import type { RecipeStore } from './recipe-store';

/** What choosing a target needs from the renderer. */
export interface PaintSurfaces {
	layerTextureSize: ( id: string ) => CanvasSize;
	ensurePaintTexture: ( id: string ) => unknown;
}

/**
 * The layer a stroke should land on.
 *
 * @param store     Document store.
 * @param renderer  Renderer, or null before it has started.
 * @return Layer id to paint into.
 */
export function paintTarget(
	store: RecipeStore,
	renderer: PaintSurfaces | null
): string {
	const recipe = store.current;
	const active = recipe.layers.find( ( layer ) => layer.id === recipe.activeLayerId );

	if ( active && isPaintSheet( store, renderer, active.id ) ) {
		return active.id;
	}

	const existing = recipe.layers.find(
		( layer ) => 'raster' === layer.kind && isPaintSheet( store, renderer, layer.id )
	);

	if ( existing ) {
		return existing.id;
	}

	const layer = createRasterLayer( __( 'Paint' ) );

	renderer?.ensurePaintTexture( layer.id );

	// Not an undo step of its own. The layer exists because a stroke needed somewhere
	// to go, so folding it into the current entry keeps one stroke to one undo --
	// otherwise the first press would remove a stroke's *container* and appear to do
	// nothing at all.
	store.setLayers( [ ...recipe.layers, layer ], layer.id, false );

	return layer.id;
}

/**
 * Whether a layer is a full-canvas sheet that can be painted on directly.
 *
 * Text and pasted layers are *objects*: their texture is the size of their content
 * and their transform puts it somewhere. Painting into one would promote it to a
 * canvas-sized target with the old content re-centred, so the object would jump
 * across the canvas the moment a brush touched it. Strokes therefore go to a sheet,
 * and the objects stay where they were put.
 *
 * @param store    Document store.
 * @param renderer Renderer, or null before it has started.
 * @param layerId  Layer to test.
 */
function isPaintSheet(
	store: RecipeStore,
	renderer: PaintSurfaces | null,
	layerId: string
): boolean {
	const recipe = store.current;
	const layer = recipe.layers.find( ( entry ) => entry.id === layerId );

	if ( ! layer || 'raster' !== layer.kind || ! renderer ) {
		return false;
	}

	const size = renderer.layerTextureSize( layerId );

	// A sheet with no texture yet is one that has just been created for this stroke.
	return (
		0 === size.width ||
		( size.width === recipe.canvas.width && size.height === recipe.canvas.height )
	);
}
