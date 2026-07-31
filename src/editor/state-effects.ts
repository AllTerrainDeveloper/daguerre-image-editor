/**
 * What each UI state change does to the DOM and the renderer.
 *
 * `EditorUiState` holds the values and tells its listeners; this is the other half --
 * the side effects that are not a listener's business because they have to happen
 * exactly once and in a known order.
 */

import type { Editor } from './editor';
import type { StateEffects } from './editor-state';

/**
 * Builds the editor's state effects.
 *
 * @param editor The editor.
 */
export function stateEffects( editor: Editor ): StateEffects {
	return {
		onToolChange: ( previous ) => onToolChange( editor, previous ),
		onViewChange: ( view ) => {
			editor.stage?.setRulersVisible( view.rulers );
			editor.shell.stage.classList.toggle( 'has-rulers', view.rulers );
			editor.renderer?.view.fit();
		},
		onQuickMaskChange: ( on ) => {
			editor.shell.stage.classList.toggle( 'is-quick-mask', on );
			editor.selection?.sync();
		},
		onFullScreenChange: ( on ) => setFullScreen( editor, on ),
	};
}

/**
 * Reacts to the stage changing hands.
 *
 * @param editor   The editor.
 * @param previous The tool that just lost it.
 */
function onToolChange( editor: Editor, previous: string ): void {
	// Leaving the text tool finishes the text, rather than abandoning a caret that
	// would then be typing into nothing.
	if ( 'text' === previous ) {
		editor.stage?.text.commit();
	}

	const tool = editor.state.getTool();

	editor.stage?.rail.sync( tool );
	editor.stage?.optionsBar.render();
	editor.shell.stage.dataset.tool = tool;
}

/**
 * Expands the editor to fill the screen, or gives the space back.
 *
 * Uses the Fullscreen API when it is available and a CSS class when it is not --
 * inside a Desktop Mode window the request is often refused, and an editor that
 * silently does nothing when you press F is worse than one that just grows.
 *
 * @param editor The editor.
 * @param on     Whether to fill the screen.
 */
function setFullScreen( editor: Editor, on: boolean ): void {
	const root = editor.shell.root;

	root.classList.toggle( 'is-full-screen', on );

	if ( on && root.requestFullscreen ) {
		void root.requestFullscreen().catch( () => {
			// The CSS class already did the useful part.
		} );
	} else if ( ! on && document.fullscreenElement ) {
		void document.exitFullscreen().catch( () => {} );
	}

	editor.renderer?.view.fit();
}
