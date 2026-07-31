/**
 * The toolbar row.
 *
 * Undo, redo, compare, reset, recentre, export and save -- plus the rule for when each
 * of them is available. Enabling state is derived in one place from one snapshot,
 * because a Save button that is live on an unedited image produces a duplicate and a
 * Save button that is live twice over produces two.
 */

import { __ } from '../i18n';
import { createButton } from '../ui/controls';
import type { ButtonHandle } from '../ui/controls';
import { createCompareControl } from './compare-control';

export interface ToolbarActions {
	undo: () => void;
	redo: () => void;
	reset: () => void;
	recentre: () => void;
	save: () => void;
	exportToDevice: () => void;
	/** Shows or hides the original, while the compare control is held. */
	setBypass: ( on: boolean ) => void;
	/** Present only when the host wants a close button. */
	close?: () => void;
}

/** What decides which buttons are live. */
export interface ToolbarState {
	canUndo: boolean;
	canRedo: boolean;
	/** True when the edit would produce the original unchanged. */
	identity: boolean;
	/** False while a full-resolution render is in flight, or before one is possible. */
	ready: boolean;
	/** Whether the user may write a new attachment. */
	canSave: boolean;
}

/**
 * The toolbar's buttons and their enabling rules.
 */
export class EditorToolbar {
	private undoButton: ButtonHandle;

	private redoButton: ButtonHandle;

	private resetButton: ButtonHandle;

	private saveButton: ButtonHandle;

	private exportButton: ButtonHandle;

	/** Everything to release, including the buttons with no state of their own. */
	private handles: ButtonHandle[] = [];

	private detach: Array< () => void > = [];

	/**
	 * @param host    Element to append the buttons to.
	 * @param actions What each button does.
	 */
	constructor( host: HTMLElement, actions: ToolbarActions ) {
		this.undoButton = createButton( {
			label: __( 'Undo' ),
			title: __( 'Undo (Ctrl+Z)' ),
			variant: 'ghost',
			onClick: actions.undo,
		} );

		this.redoButton = createButton( {
			label: __( 'Redo' ),
			title: __( 'Redo (Ctrl+Shift+Z)' ),
			variant: 'ghost',
			onClick: actions.redo,
		} );

		const compare = createCompareControl( actions.setBypass );

		this.detach.push( compare.detach );

		this.resetButton = createButton( {
			label: __( 'Reset' ),
			title: __( 'Return every adjustment to zero' ),
			variant: 'secondary',
			onClick: actions.reset,
		} );

		const recentre = createButton( {
			label: '⊕',
			// Easy to scroll into empty pasteboard and lose the picture entirely;
			// this is the way back that does not require knowing the shortcut.
			title: __( 'Recentre the view (0)' ),
			variant: 'ghost',
			onClick: actions.recentre,
		} );

		this.exportButton = createButton( {
			label: __( 'Export' ),
			title: __( 'Download the edited image to this device' ),
			variant: 'secondary',
			onClick: actions.exportToDevice,
		} );

		this.saveButton = createButton( {
			label: __( 'Save a copy' ),
			title: __( 'Save as a new image, leaving the original untouched' ),
			variant: 'primary',
			onClick: actions.save,
		} );

		// Recentre first, matching the order the buttons were originally appended in.
		host.appendChild( recentre.el );
		host.append(
			this.undoButton.el,
			this.redoButton.el,
			compare.handle.el,
			this.resetButton.el,
			this.exportButton.el,
			this.saveButton.el
		);

		this.handles.push(
			recentre,
			this.undoButton,
			this.redoButton,
			compare.handle,
			this.resetButton,
			this.exportButton,
			this.saveButton
		);

		if ( actions.close ) {
			const close = createButton( {
				label: __( 'Close' ),
				variant: 'ghost',
				onClick: actions.close,
			} );

			this.handles.push( close );
			host.appendChild( close.el );
		}
	}

	/**
	 * Enables or disables the buttons to match the state.
	 *
	 * @param state Current editor state.
	 */
	sync( state: ToolbarState ): void {
		this.undoButton.setDisabled( ! state.canUndo );
		this.redoButton.setDisabled( ! state.canRedo );
		this.resetButton.setDisabled( state.identity );

		// Saving an unedited image would just duplicate it, and saving twice while a
		// render is in flight would create two copies.
		const live = state.ready && ! state.identity;

		this.saveButton.setDisabled( ! live || ! state.canSave );
		this.exportButton.setDisabled( ! live );
	}

	/** Releases every button and key binding. */
	destroy(): void {
		for ( const off of this.detach ) {
			off();
		}

		for ( const handle of this.handles ) {
			handle.destroy();
		}

		this.detach = [];
		this.handles = [];
	}
}
