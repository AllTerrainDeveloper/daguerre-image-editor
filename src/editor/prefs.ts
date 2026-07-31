/**
 * Preferences the editor remembers between sessions.
 *
 * Presentation only -- whether the rulers are on, whether the sidebar is open. None of
 * it belongs in the recipe: it describes how one person likes to work, not what the
 * picture should look like, so it stays on this device rather than being saved with
 * the image.
 *
 * Every access is guarded. Storage throws in private browsing modes and is missing
 * entirely in some embedded contexts, and a ruler preference is not worth breaking the
 * editor over.
 */

import type { ViewPrefs } from '../ui/panels';

/** Where view preferences are remembered. */
const VIEW_KEY = 'lienzo.view.v1';

/** Where the sidebar's open state is remembered. */
const SIDEBAR_KEY = 'lienzo.sidebar.v1';

/** Reads remembered view preferences, defaulting both on. */
export function readViewPrefs(): ViewPrefs {
	try {
		const raw = window.localStorage.getItem( VIEW_KEY );

		if ( ! raw ) {
			return { rulers: true, snapping: true };
		}

		const stored = JSON.parse( raw ) as Partial< ViewPrefs >;

		return {
			rulers: false !== stored.rulers,
			snapping: false !== stored.snapping,
		};
	} catch {
		return { rulers: true, snapping: true };
	}
}

/**
 * Remembers view preferences.
 *
 * @param prefs Preferences to store.
 */
export function writeViewPrefs( prefs: ViewPrefs ): void {
	try {
		window.localStorage.setItem( VIEW_KEY, JSON.stringify( prefs ) );
	} catch {
		// Storage unavailable; the preference simply will not be remembered.
	}
}

/** Reads the remembered sidebar state, defaulting to open. */
export function readSidebarOpen(): boolean {
	try {
		return 'closed' !== window.localStorage.getItem( SIDEBAR_KEY );
	} catch {
		return true;
	}
}

/**
 * Remembers the sidebar state.
 *
 * @param open Whether the sidebar is visible.
 */
export function writeSidebarOpen( open: boolean ): void {
	try {
		window.localStorage.setItem( SIDEBAR_KEY, open ? 'open' : 'closed' );
	} catch {
		// Storage unavailable. The preference simply will not be remembered.
	}
}
