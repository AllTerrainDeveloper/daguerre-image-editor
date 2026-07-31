/**
 * Which panels are open, remembered between sessions.
 */

/** Where panel open/closed state is remembered. */
const STORAGE_KEY = 'lienzo.panels.v1';

/** Persisted per-panel state. */
export interface PanelState {
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
export function readState(): Record< string, PanelState > {
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
export function writeState( state: Record< string, PanelState > ): void {
	try {
		window.localStorage.setItem( STORAGE_KEY, JSON.stringify( state ) );
	} catch {
		// Storage full or unavailable. The layout simply will not be remembered.
	}
}
