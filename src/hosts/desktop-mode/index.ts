/**
 * The Desktop Mode host.
 *
 * Renders the editor as a native Desktop Mode window -- in the parent shell's DOM
 * rather than a chromeless iframe -- and wires it into the desktop's own idioms:
 * double-clicking a photo on the wallpaper opens it here, a photo can be dragged
 * onto the window to load it, and a saved result can be dragged back out into a
 * Gutenberg window.
 *
 * Everything is feature-detected. This module also loads on plain WordPress admin
 * screens where none of these APIs exist, so every entry point must be a silent
 * no-op rather than a console error.
 */

import { desktop } from './desktop-api';
import { registerFileOpener } from './file-opener';
import './native-window';
import { listenForOpenRequests } from './open-window';
import { registerPeekThumbnail } from './peek';

/**
 * Registers the native window renderer and the desktop integrations.
 *
 * Safe to call anywhere; no-ops without Desktop Mode.
 */
export function bootDesktopMode(): void {
	if ( ! desktop() ) {
		return;
	}

	registerPeekThumbnail();

	try {
		registerFileOpener();
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.warn( '[lienzo] file opener unavailable:', error );
	}

	listenForOpenRequests();
}

export { openInDesktop } from './open-window';
