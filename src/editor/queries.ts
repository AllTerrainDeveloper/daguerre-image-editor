/**
 * What the editor is asked about.
 *
 * Three read-only derivations that have nothing in common except that none of them is
 * state: a diagnostic dump, the size the transform handles measure against, and the
 * snapshot the toolbar decides its enabling rules from. Together off the editor rather
 * than on it, so the class stays about state and lifecycle.
 */

import type { CanvasSize } from '../model/document';
import type { Editor } from './editor';
import type { ToolbarState } from './toolbar';

/**
 * Renderer internals, for diagnosing render problems from the console.
 *
 * @param editor The editor.
 */
export function editorDebug( editor: Editor ): Record< string, unknown > {
	return {
		renderer: editor.renderer?.debugState() ?? null,
		activeTool: editor.state.getTool(),
		selection: editor.selection?.current ?? null,
		hasClipboard: true === editor.clipboard?.hasContent,
		recipeLayers: editor.store.current.layers.map( ( layer ) => ( {
			id: layer.id,
			kind: layer.kind,
		} ) ),
		activeLayerId: editor.store.current.activeLayerId,
	};
}

/**
 * The native pixel size of whatever backs the active layer.
 *
 * The transform handles measure this, so a pasted fragment gets a box its own
 * size rather than the whole photograph's -- which is what made a paste look
 * like it had been scaled up.
 *
 * @param editor The editor.
 */
export function activeLayerSize( editor: Editor ): CanvasSize {
	const size = editor.renderer?.paint.layerTextureSize( editor.store.current.activeLayerId );

	if ( size && size.width > 0 ) {
		return size;
	}

	return editor.renderer?.imageSize ?? { width: 0, height: 0 };
}

/**
 * The snapshot the toolbar decides its enabling rules from.
 *
 * @param editor The editor.
 * @param busy   Whether a full-resolution render is in flight.
 */
export function toolbarState( editor: Editor, busy: boolean ): ToolbarState {
	return {
		canUndo: editor.store.canUndo,
		canRedo: editor.store.canRedo,
		identity: editor.store.isIdentity( editor.renderer?.imageSize ),
		ready: ! busy && null !== editor.renderer,
		canSave: true === editor.payload?.canSave,
	};
}
