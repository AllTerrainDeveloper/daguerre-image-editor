/**
 * The sidebar's panel stack.
 *
 * Panels are an accordion rather than tabs on purpose: a histogram is something you
 * watch *while* dragging a slider, so hiding it behind a tab switch would break the
 * one workflow it exists for. Anything you would rather not see can be closed
 * outright from the picker.
 */

import { createPanelSection } from './panel-section';
import { listPanels, onPanelsChanged } from './registry';
import { buildSidebarChrome } from './sidebar-chrome';
import { readState, writeState } from './state';
import type { PanelState } from './state';
import { createToolPicker } from './tool-picker';
import type { PanelContext, PanelDef } from './types';

/**
 * Renders and manages the panel stack inside a sidebar element.
 */
export class PanelHost {
	private root: HTMLElement;

	private ctx: PanelContext;

	private state: Record< string, PanelState >;

	private teardowns: Array< () => void > = [];

	private unsubscribe: () => void;

	private stack!: HTMLElement;

	private picker: HTMLElement | null = null;

	/**
	 * @param root   Sidebar element to fill.
	 * @param ctx    Context handed to every panel.
	 * @param onHide Optional. Called when the user closes the sidebar.
	 */
	constructor( root: HTMLElement, ctx: PanelContext, onHide?: () => void ) {
		this.root = root;
		this.ctx = ctx;
		this.state = readState();

		this.stack = buildSidebarChrome( {
			root,
			onPicker: ( toggle ) => this.togglePicker( toggle ),
			...( onHide ? { onHide } : {} ),
		} ).stack;

		this.render();

		// A panel registered after the editor opened should appear straight away.
		this.unsubscribe = onPanelsChanged( () => this.render() );
	}

	/**
	 * Opens or closes the tool picker.
	 *
	 * @param toggle The button that owns it.
	 */
	private togglePicker( toggle: HTMLButtonElement ): void {
		if ( this.picker ) {
			this.picker.remove();
			this.picker = null;
			toggle.setAttribute( 'aria-expanded', 'false' );

			return;
		}

		const menu = createToolPicker( {
			isVisible: ( def ) => this.isVisible( def ),
			onToggle: ( def, visible ) => {
				this.setPanelState( def.id, { hidden: ! visible } );
				this.render();
			},
		} );

		toggle.setAttribute( 'aria-expanded', 'true' );
		toggle.after( menu );
		this.picker = menu;
	}

	/**
	 * Whether a panel should be on screen.
	 *
	 * @param def Panel definition.
	 */
	private isVisible( def: PanelDef ): boolean {
		const stored = this.state[ def.id ]?.hidden;

		if ( stored !== undefined ) {
			return ! stored;
		}

		return false !== def.defaultVisible;
	}

	/**
	 * Whether a panel should render collapsed.
	 *
	 * @param def Panel definition.
	 */
	private isCollapsed( def: PanelDef ): boolean {
		const stored = this.state[ def.id ]?.collapsed;

		return stored !== undefined ? stored : true === def.defaultCollapsed;
	}

	/**
	 * Merges and persists state for one panel.
	 *
	 * @param id    Panel id.
	 * @param patch Fields to change.
	 */
	private setPanelState( id: string, patch: PanelState ): void {
		this.state = { ...this.state, [ id ]: { ...this.state[ id ], ...patch } };
		writeState( this.state );
	}

	/** Rebuilds every visible panel. */
	private render(): void {
		this.releasePanels();
		this.stack.replaceChildren();

		for ( const def of listPanels() ) {
			if ( ! this.isVisible( def ) ) {
				continue;
			}

			const section = createPanelSection( {
				def,
				ctx: this.ctx,
				collapsed: this.isCollapsed( def ),
				onToggle: ( collapsed ) => this.setPanelState( def.id, { collapsed } ),
			} );

			if ( section.teardown ) {
				this.teardowns.push( section.teardown );
			}

			this.stack.appendChild( section.el );
		}
	}

	/** Runs every panel teardown. */
	private releasePanels(): void {
		for ( const teardown of this.teardowns ) {
			teardown();
		}

		this.teardowns = [];
	}

	/** Releases everything the host owns. */
	destroy(): void {
		this.unsubscribe();
		this.releasePanels();
		this.picker = null;
		this.root.replaceChildren();
	}
}
