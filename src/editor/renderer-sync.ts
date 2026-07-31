/**
 * Keeping the renderer in step with the document.
 */

import type { EditorRenderer } from '../engine/renderer';
import type { Recipe } from '../model/recipe';
import type { RecipeScope } from './recipe-store';

/**
 * Pushes the current recipe out to the renderer.
 *
 * Only the parts the change touched. The renderer has three separate update paths and
 * pushing a full document rebuild through all of them on every slider tick is the
 * difference between a smooth drag and a stuttering one.
 *
 * @param renderer Renderer to update.
 * @param recipe   The edit as it now stands.
 * @param scope    What the change invalidated.
 */
export function pushToRenderer(
	renderer: EditorRenderer,
	recipe: Recipe,
	scope: RecipeScope
): void {
	const all = 'all' === scope;

	if ( all || 'ops' === scope ) {
		renderer.setOps( recipe.ops );
	}

	if ( all || 'document' === scope ) {
		renderer.setDocument( recipe.canvas, recipe.layers, recipe.activeLayerId );
	}

	if ( all || 'tone' === scope ) {
		renderer.setTone( recipe.curves, recipe.levels );
	}
}

/**
 * Tells the renderer which layers' pixels are still reachable.
 *
 * Every state on the undo stack, not just the current one. A dropped, pasted or typed
 * layer keeps its pixels in a texture and nowhere else, so freeing them the moment the
 * layer left the *current* document meant undo destroyed what redo needed -- the layer
 * came back as an empty frame with handles around nothing.
 *
 * Bounded by what the user actually created, and by the history cap above it.
 *
 * @param renderer Renderer to update.
 * @param states   Every state on the undo stack.
 */
export function retainTextures( renderer: EditorRenderer, states: Recipe[] ): void {
	const reachable = new Set< string >();

	for ( const state of states ) {
		for ( const layer of state.layers ) {
			reachable.add( layer.id );
		}
	}

	renderer.retainLayers( reachable );
}
