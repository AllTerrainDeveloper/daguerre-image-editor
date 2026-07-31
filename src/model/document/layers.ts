/**
 * The layer stack.
 *
 * Two kinds, and the difference matters everywhere: an `image` layer draws the opened
 * photograph, a `raster` layer draws pixels that exist only in a GPU texture. The
 * second kind is why saving a painted edit has to flatten, and why undo has to keep
 * textures alive for states it is no longer showing.
 */

import { IDENTITY_TRANSFORM, normaliseTransform } from './transform';
import type { LayerTransform } from './transform';

/**
 * What a layer is made of.
 *
 * `image` layers are backed by an attachment's texture and are purely descriptive:
 * the recipe can reproduce them from the original file. `raster` layers hold pixels
 * that exist nowhere else -- a pasted fragment, a brush stroke -- and therefore
 * cannot be reconstructed from a recipe alone. See `Layer` for what that costs.
 */
export type LayerKind = 'image' | 'raster';

/** One layer in the document stack. */
export interface Layer {
	id: string;
	name: string;
	kind: LayerKind;
	transform: LayerTransform;
	visible: boolean;
	/** 0..1. */
	opacity: number;
}

/** The base layer every document starts with, holding the opened image. */
export const BASE_LAYER_ID = 'base';

/**
 * Builds the layer an opened image becomes.
 *
 * @param name Display name.
 */
export function createImageLayer( name: string ): Layer {
	return {
		id: BASE_LAYER_ID,
		name,
		kind: 'image',
		transform: { ...IDENTITY_TRANSFORM },
		visible: true,
		opacity: 1,
	};
}

/**
 * Builds an empty raster layer.
 *
 * @param name      Display name.
 * @param transform Optional starting transform.
 */
export function createRasterLayer(
	name: string,
	transform: Partial< LayerTransform > = {}
): Layer {
	return {
		id: `layer-${ Math.random().toString( 36 ).slice( 2, 10 ) }`,
		name,
		kind: 'raster',
		transform: { ...IDENTITY_TRANSFORM, ...transform },
		visible: true,
		opacity: 1,
	};
}

/**
 * Validates a layer stack from untrusted input.
 *
 * A document always has at least one layer, so an unusable stack falls back to a
 * single image layer rather than to nothing.
 *
 * @param raw      Candidate layers.
 * @param fallback Name for the base layer when rebuilding.
 */
export function normaliseLayers( raw: unknown, fallback = 'Image' ): Layer[] {
	if ( ! Array.isArray( raw ) || raw.length === 0 ) {
		return [ createImageLayer( fallback ) ];
	}

	const layers: Layer[] = [];

	for ( const entry of raw ) {
		if ( ! entry || typeof entry !== 'object' ) {
			continue;
		}

		const layer = entry as Partial< Layer >;
		const opacity = Number( layer.opacity ?? 1 );

		layers.push( {
			id: typeof layer.id === 'string' && layer.id ? layer.id : createRasterLayer( '' ).id,
			name: typeof layer.name === 'string' ? layer.name : fallback,
			kind: layer.kind === 'raster' ? 'raster' : 'image',
			transform: normaliseTransform( layer.transform ),
			visible: layer.visible !== false,
			opacity: Number.isFinite( opacity ) ? Math.min( 1, Math.max( 0, opacity ) ) : 1,
		} );
	}

	return layers.length > 0 ? layers : [ createImageLayer( fallback ) ];
}

/**
 * Finds a layer by id.
 *
 * @param layers Layer stack.
 * @param id     Layer id.
 */
export function findLayer( layers: Layer[], id: string ): Layer | undefined {
	return layers.find( ( layer ) => layer.id === id );
}

/**
 * Returns the stack with one layer replaced.
 *
 * @param layers Layer stack.
 * @param id     Layer to replace.
 * @param patch  Fields to change.
 */
export function updateLayer(
	layers: Layer[],
	id: string,
	patch: Partial< Layer >
): Layer[] {
	return layers.map( ( layer ) =>
		layer.id === id ? { ...layer, ...patch } : layer
	);
}

/**
 * Moves a layer up or down the stack.
 *
 * @param layers    Layer stack.
 * @param id        Layer to move.
 * @param direction 1 moves it towards the front, -1 towards the back.
 */
export function reorderLayer( layers: Layer[], id: string, direction: 1 | -1 ): Layer[] {
	const index = layers.findIndex( ( layer ) => layer.id === id );
	const target = index + direction;

	if ( index === -1 || target < 0 || target >= layers.length ) {
		return layers;
	}

	const next = [ ...layers ];
	const [ moved ] = next.splice( index, 1 );

	next.splice( target, 0, moved );

	return next;
}
