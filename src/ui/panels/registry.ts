/**
 * The panel registry.
 *
 * Every tool in the sidebar -- the histogram, the adjustment sliders, output
 * settings, layers, curves and presets -- is a registered panel rather than markup
 * hardcoded into the editor. That buys three things:
 *
 * - Each panel collapses independently, and remembers whether it was collapsed.
 * - The user chooses which tools are on screen at all, from a picker.
 * - A new tool is a `registerPanel()` call, not an edit to the editor's shell. The
 *   registry is exposed on `window.lienzo`, so a third party can add one too.
 */

import type { PanelDef } from './types';

/** The registry, keyed by id. */
const registry = new Map< string, PanelDef >();

/** Notified whenever the registry changes, so open editors can re-render. */
const listeners = new Set< () => void >();

/** Tells every open editor to rebuild its stack. */
function announce(): void {
	for ( const listener of listeners ) {
		listener();
	}
}

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
	announce();
}

/**
 * Removes a registered panel.
 *
 * @param id Panel id.
 */
export function unregisterPanel( id: string ): void {
	if ( registry.delete( id ) ) {
		announce();
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
