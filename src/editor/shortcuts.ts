/**
 * Keyboard shortcuts.
 *
 * All of them in one table rather than three listeners scattered across the editor.
 * That matters because they compete: `Enter` means different things to the path tool
 * and the polygon marquee, and `Escape` only means "deselect" when there is a selection
 * to lose. Those decisions are easier to get right -- and to read -- side by side.
 */

import { hasCommandKey, onEditorKey } from './keys';

/** What the shortcuts act on. */
export interface ShortcutTarget {
	undo: () => void;
	redo: () => void;
	copy: () => void;
	paste: () => void;
	selectAll: () => void;
	/** Clears the marquee and any in-progress path. */
	deselect: () => void;
	/** Whether anything is selected. */
	hasSelection: () => boolean;
	/** Which tool owns the stage. */
	getTool: () => string;
	/** Which shape the marquee tool is drawing. */
	getSelectionShape: () => string;
	/** Closes an in-progress path. True when one was closed. */
	commitPath: () => boolean;
	/** Abandons an in-progress path without drawing it. */
	clearPath: () => void;
	/** Fits the whole picture back on screen. */
	resetView: () => void;
}

/**
 * Binds every editor shortcut.
 *
 * @param target What the shortcuts act on.
 * @return Detach function.
 */
export function attachEditorShortcuts( target: ShortcutTarget ): () => void {
	const detach = [
		onEditorKey( 'keydown', ( event ) => {
			if ( hasCommandKey( event ) ) {
				handleCommand( event, target );

				return;
			}

			handlePlain( event, target );
		} ),
	];

	return () => {
		for ( const off of detach ) {
			off();
		}
	};
}

/**
 * Shortcuts that need Cmd or Ctrl.
 *
 * @param event  Key event.
 * @param target What the shortcuts act on.
 */
function handleCommand( event: KeyboardEvent, target: ShortcutTarget ): void {
	const key = event.key.toLowerCase();

	if ( 'z' === key && ! event.shiftKey ) {
		event.preventDefault();
		target.undo();
	} else if ( ( 'z' === key && event.shiftKey ) || 'y' === key ) {
		event.preventDefault();
		target.redo();
	} else if ( 'a' === key ) {
		event.preventDefault();
		target.selectAll();
	} else if ( 'd' === key ) {
		event.preventDefault();
		target.deselect();
	} else if ( 'c' === key ) {
		event.preventDefault();
		target.copy();
	} else if ( 'v' === key ) {
		event.preventDefault();
		target.paste();
	}
}

/**
 * Shortcuts that are a bare keypress.
 *
 * @param event  Key event.
 * @param target What the shortcuts act on.
 */
function handlePlain( event: KeyboardEvent, target: ShortcutTarget ): void {
	if ( 'Escape' === event.key && target.hasSelection() ) {
		event.preventDefault();
		target.deselect();

		return;
	}

	// Enter closes whatever is being placed click by click: a polygon selection, or a
	// path, which is drawn rather than selected.
	if ( 'Enter' === event.key ) {
		if ( 'path' === target.getTool() ) {
			event.preventDefault();

			if ( target.commitPath() ) {
				target.deselect();
			}

			return;
		}

		if ( 'polygon' === target.getSelectionShape() ) {
			event.preventDefault();
			target.clearPath();
		}

		return;
	}

	// The universal "show me everything again" key.
	if ( '0' === event.key ) {
		target.resetView();
	}
}
