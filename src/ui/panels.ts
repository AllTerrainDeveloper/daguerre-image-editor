/**
 * The sidebar panel system.
 *
 * Every tool in the sidebar -- the histogram, the adjustment sliders, output
 * settings, and eventually layers, curves and presets -- is a registered panel
 * rather than markup hardcoded into the editor. That buys three things:
 *
 * - Each panel collapses independently, and remembers whether it was collapsed.
 * - The user chooses which tools are on screen at all, from a picker.
 * - A new tool is a `registerPanel()` call, not an edit to the editor's shell. The
 *   registry is exposed on `window.daguerre`, so a third party can add one too.
 *
 * Panels are an accordion rather than tabs on purpose: a histogram is something you
 * watch *while* dragging a slider, so hiding it behind a tab switch would break the
 * one workflow it exists for. Anything you would rather not see can be closed
 * outright from the picker.
 */

import { createCheckbox } from './controls';
import { __ } from '../i18n';
import type { CanvasSize, LayerTransform } from '../model/document';
import type { Histogram } from '../engine/histogram';
import type { Curves, Levels } from '../engine/lut';
import type { OpType, Recipe } from '../model/recipe';
import type { Layer } from '../model/document';
import type { BrushSettings } from './stage-tools';
import type { MediaPayload, Preset } from '../types';

/**
 * Which tool currently owns the stage.
 *
 * Only one can: they all want the same pointer events on the same surface.
 */
export type ActiveTool =
	| 'transform'
	| 'select'
	| 'wand'
	| 'crop'
	| 'eyedropper'
	| 'retouch'
	| 'brush'
	| 'clone'
	| 'eraser'
	| 'fill'
	| 'gradient'
	| 'tone'
	| 'text'
	| 'shape'
	| 'hand'
	| 'zoom';

/** Tools that paint into a layer, and so need a raster target and a stroke history. */
export const PAINTING_TOOLS: ActiveTool[] = [
	'brush',
	'eraser',
	'fill',
	'gradient',
	'shape',
	'text',
	'retouch',
	'tone',
	'clone',
];

/** Where panel open/closed state is remembered between sessions. */
const STORAGE_KEY = 'daguerre.panels.v1';

/** What a panel is given when it renders. */
export interface PanelContext {
	/** The image being edited. */
	payload: MediaPayload;
	/** The edit as it currently stands. */
	getRecipe: () => Recipe;
	/** Applies one adjustment, in canonical units. */
	setOp: ( type: OpType, value: number ) => void;
	/** Replaces the output encoding settings without touching undo history. */
	setOutput: ( patch: { format?: string; quality?: number } ) => void;
	/** Moves, scales or rotates the layer. Never touches the canvas. */
	setLayer: ( layer: LayerTransform, label?: string ) => void;
	/** Resizes the canvas and repositions the layer together. */
	setDocument: (
		canvas: CanvasSize,
		layer: LayerTransform,
		label?: string
	) => void;
	/** Native pixel size of the image on the layer. */
	getImageSize: () => CanvasSize;
	/**
	 * Which direct-manipulation tool owns the stage.
	 *
	 * Only one can, because their overlays would otherwise fight over the same
	 * pointer events. Transform is the default, so the handles are there the moment
	 * an image opens rather than waiting for a panel to be expanded.
	 */
	getActiveTool: () => ActiveTool;
	/** Claims the stage for a tool. Pass 'transform' to hand it back. */
	setActiveTool: ( tool: ActiveTool ) => void;
	/** Subscribes to tool changes. */
	onActiveToolChange: ( listener: ( tool: ActiveTool ) => void ) => () => void;
	/** Replaces one curve channel, or clears it. */
	setCurve: ( channel: keyof Curves, points: [ number, number ][] | undefined ) => void;
	/** Replaces the black point, white point and gamma. */
	setLevels: ( levels: Levels ) => void;
	/**
	 * The canvas area.
	 *
	 * A panel that needs direct manipulation -- crop today, layers later -- attaches
	 * its overlay here rather than reaching for the DOM itself.
	 */
	stage: HTMLElement;
	/** Where the image sits inside the stage. Null when nothing is loaded. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Subscribes to viewport changes, so an overlay can follow a resize. */
	onViewportChange: ( listener: () => void ) => () => void;
	/** Subscribes to histogram updates. Returns an unsubscribe function. */
	onHistogram: ( listener: ( histogram: Histogram ) => void ) => () => void;
	/** Subscribes to recipe changes, including undo and reset. */
	onRecipeChange: ( listener: ( recipe: Recipe ) => void ) => () => void;
	/** Lists the current user's saved looks. */
	listPresets: () => Promise< Preset[] >;
	/** Saves the current look under a name. */
	savePreset: ( name: string ) => Promise< Preset >;
	/** Deletes a saved look. */
	deletePreset: ( id: string ) => Promise< void >;
	/** Applies a saved look to the current edit, leaving the crop alone. */
	applyPreset: ( preset: Preset ) => void;
	/** The layer stack, back to front. */
	getLayers: () => Layer[];
	/** Which layer the tools act on. */
	getActiveLayerId: () => string;
	/** Replaces the stack, optionally changing which layer is active. */
	setLayers: ( layers: Layer[], activeId?: string ) => void;
	/** Adds an empty layer above the active one and selects it. */
	addLayer: () => void;
	/** Brush, eraser and fill settings, shared by all three. */
	getBrush: () => BrushSettings;
	/** Changes brush settings. */
	setBrush: ( patch: Partial< BrushSettings > ) => void;
	/** Subscribes to brush changes. */
	onBrushChange: ( listener: ( brush: BrushSettings ) => void ) => () => void;
	/** Rulers and snapping. */
	getView: () => ViewPrefs;
	/** Changes view preferences. */
	setView: ( patch: Partial< ViewPrefs > ) => void;
}

/** Preferences about how the stage is presented, not what it contains. */
export interface ViewPrefs {
	rulers: boolean;
	snapping: boolean;
}

/** A registered sidebar tool. */
export interface PanelDef {
	/** Stable identifier, used as the persistence key. */
	id: string;
	/** Heading shown on the panel and in the picker. */
	title: string;
	/** Sort order; lower comes first. Defaults to 100. */
	order?: number;
	/** Whether the panel is shown before the user has expressed a preference. */
	defaultVisible?: boolean;
	/** Whether the panel starts collapsed. */
	defaultCollapsed?: boolean;
	/**
	 * Renders the panel body.
	 *
	 * The body carries `data-collapsed` and emits a `dg-panel-toggle` CustomEvent
	 * whenever that changes, so a panel owning anything outside its own markup can
	 * follow along.
	 *
	 * Return a teardown function to release listeners; it runs when the panel is
	 * hidden or the editor is destroyed.
	 */
	render: ( host: HTMLElement, ctx: PanelContext ) => void | ( () => void );
}

/** The registry, in registration order. */
const registry = new Map< string, PanelDef >();

/** Notified whenever the registry changes, so open editors can re-render. */
const listeners = new Set< () => void >();

/**
 * Registers a sidebar tool.
 *
 * Registering an existing id replaces it, which lets a plugin override a built-in
 * panel rather than only adding to them.
 *
 * @param def Panel definition.
 */
export function registerPanel( def: PanelDef ): void {
	registry.set( def.id, def );

	for ( const listener of listeners ) {
		listener();
	}
}

/**
 * Removes a registered panel.
 *
 * @param id Panel id.
 */
export function unregisterPanel( id: string ): void {
	if ( registry.delete( id ) ) {
		for ( const listener of listeners ) {
			listener();
		}
	}
}

/** Every registered panel, in display order. */
export function listPanels(): PanelDef[] {
	return [ ...registry.values() ].sort(
		( a, b ) => ( a.order ?? 100 ) - ( b.order ?? 100 )
	);
}

/**
 * Subscribes to registry changes.
 *
 * @param listener Called after any registration change.
 * @return Unsubscribe function.
 */
export function onPanelsChanged( listener: () => void ): () => void {
	listeners.add( listener );

	return () => {
		listeners.delete( listener );
	};
}

/** Persisted per-panel state. */
interface PanelState {
	collapsed?: boolean;
	hidden?: boolean;
}

/**
 * Reads persisted panel state.
 *
 * Storage can throw in private browsing modes and is missing entirely in some
 * embedded contexts, so every access is guarded -- a panel layout is not worth
 * breaking the editor over.
 */
function readState(): Record< string, PanelState > {
	try {
		const raw = window.localStorage.getItem( STORAGE_KEY );

		return raw ? ( JSON.parse( raw ) as Record< string, PanelState > ) : {};
	} catch {
		return {};
	}
}

/**
 * Persists panel state.
 *
 * @param state State to store.
 */
function writeState( state: Record< string, PanelState > ): void {
	try {
		window.localStorage.setItem( STORAGE_KEY, JSON.stringify( state ) );
	} catch {
		// Storage full or unavailable. The layout simply will not be remembered.
	}
}

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

	private onHide: ( () => void ) | undefined;

	/**
	 * @param root   Sidebar element to fill.
	 * @param ctx    Context handed to every panel.
	 * @param onHide Optional. Called when the user closes the sidebar.
	 */
	constructor( root: HTMLElement, ctx: PanelContext, onHide?: () => void ) {
		this.root = root;
		this.ctx = ctx;
		this.onHide = onHide;
		this.state = readState();

		this.buildChrome();
		this.render();

		// A panel registered after the editor opened should appear straight away.
		this.unsubscribe = onPanelsChanged( () => this.render() );
	}

	/** Builds the sidebar header and the panel container. */
	private buildChrome(): void {
		this.root.replaceChildren();

		const header = document.createElement( 'div' );
		header.className = 'dg-sidebar__header';

		const label = document.createElement( 'span' );
		label.className = 'dg-sidebar__title';
		label.textContent = __( 'Tools' );

		const toggle = document.createElement( 'button' );
		toggle.type = 'button';
		toggle.className = 'dg-sidebar__picker-toggle';
		toggle.textContent = '⋯';
		toggle.title = __( 'Choose which tools are shown' );
		toggle.setAttribute( 'aria-label', __( 'Choose which tools are shown' ) );
		toggle.setAttribute( 'aria-expanded', 'false' );
		toggle.addEventListener( 'click', () => this.togglePicker( toggle ) );

		const actions = document.createElement( 'div' );
		actions.className = 'dg-sidebar__actions';
		actions.appendChild( toggle );

		if ( this.onHide ) {
			const hide = document.createElement( 'button' );
			hide.type = 'button';
			hide.className = 'dg-sidebar__hide';
			hide.textContent = '⟩';
			hide.title = __( 'Hide the tools' );
			hide.setAttribute( 'aria-label', __( 'Hide the tools' ) );
			hide.addEventListener( 'click', () => this.onHide?.() );

			actions.appendChild( hide );
		}

		header.append( label, actions );

		this.stack = document.createElement( 'div' );
		this.stack.className = 'dg-panels';

		this.root.append( header, this.stack );
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

		const menu = document.createElement( 'div' );
		menu.className = 'dg-picker-menu';
		menu.setAttribute( 'role', 'group' );
		menu.setAttribute( 'aria-label', __( 'Tools' ) );

		for ( const def of listPanels() ) {
			const row = createCheckbox( {
				label: def.title,
				checked: this.isVisible( def ),
				onChange: ( checked ) => {
					this.setPanelState( def.id, { hidden: ! checked } );
					this.render();
				},
			} );

			row.el.classList.add( 'dg-picker-menu__item' );
			menu.appendChild( row.el );
		}

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

		return def.defaultVisible !== false;
	}

	/**
	 * Whether a panel should render collapsed.
	 *
	 * @param def Panel definition.
	 */
	private isCollapsed( def: PanelDef ): boolean {
		const stored = this.state[ def.id ]?.collapsed;

		return stored !== undefined ? stored : def.defaultCollapsed === true;
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

			this.stack.appendChild( this.renderPanel( def ) );
		}
	}

	/**
	 * Builds one collapsible panel.
	 *
	 * The body stays in the DOM when collapsed rather than being destroyed. The
	 * histogram subscribes to updates on render, and tearing that down on every
	 * collapse would mean a reopened panel showed a stale plot until the next
	 * adjustment.
	 *
	 * @param def Panel definition.
	 */
	private renderPanel( def: PanelDef ): HTMLElement {
		const collapsed = this.isCollapsed( def );

		const section = document.createElement( 'section' );
		section.className = 'dg-panel';
		section.dataset.panel = def.id;
		section.classList.toggle( 'is-collapsed', collapsed );

		const bodyId = `dg-panel-body-${ def.id }`;

		const header = document.createElement( 'button' );
		header.type = 'button';
		header.className = 'dg-panel__header';
		header.setAttribute( 'aria-expanded', String( ! collapsed ) );
		header.setAttribute( 'aria-controls', bodyId );

		const chevron = document.createElement( 'span' );
		chevron.className = 'dg-panel__chevron';
		chevron.setAttribute( 'aria-hidden', 'true' );
		chevron.textContent = '▸';

		const title = document.createElement( 'span' );
		title.className = 'dg-panel__title';
		title.textContent = def.title;

		header.append( chevron, title );

		const body = document.createElement( 'div' );
		body.className = 'dg-panel__body';
		body.id = bodyId;
		body.hidden = collapsed;

		body.dataset.collapsed = String( collapsed );

		header.addEventListener( 'click', () => {
			const next = ! section.classList.contains( 'is-collapsed' );

			section.classList.toggle( 'is-collapsed', next );
			body.hidden = next;
			body.dataset.collapsed = String( next );
			header.setAttribute( 'aria-expanded', String( ! next ) );
			this.setPanelState( def.id, { collapsed: next } );

			// Panels that own something outside their own body -- the crop overlay
			// lives on the stage -- need to know when they are put away.
			body.dispatchEvent(
				new CustomEvent( 'dg-panel-toggle', {
					detail: { collapsed: next },
					bubbles: false,
				} )
			);
		} );

		const teardown = def.render( body, this.ctx );

		if ( typeof teardown === 'function' ) {
			this.teardowns.push( teardown );
		}

		section.append( header, body );

		return section;
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
