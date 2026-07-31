/**
 * Bundle entry point.
 *
 * Publishes the API on `window.lienzo` and boots the desktop integration plus the
 * controls that open it. There is one editing surface -- the native window -- because
 * that is the only place the shell's Pixi, components and drag bridge are reachable;
 * everything else on this list is a way of asking for it.
 */

import { mount } from './editor';
import type { EditorInstance, MountOptions } from './editor';
import { bootBlockEditor } from './hosts/block-editor';
import { bootDesktopMode, openInDesktop } from './hosts/desktop-mode';
import { bootMediaDrag } from './hosts/media-drag';
import { bootMediaModal } from './hosts/media-modal';
import { bootOpenButtons } from './hosts/open-buttons';
import { listPanels, registerPanel, unregisterPanel } from './ui/panels';
import type { PanelDef } from './ui/panels';

/**
 * The public JavaScript API, as it lands on `window.lienzo`.
 *
 * Vite builds this bundle as an IIFE named `lienzo`, which assigns the module's
 * *exports* to the global. So the exports at the foot of this file are the API --
 * there is no second object to keep in step, and an earlier one that tried to be was
 * silently overwritten on every load.
 */
export interface LienzoApi {
	mount: typeof mount;
	/**
	 * Opens an image in the desktop window.
	 *
	 * The only way in. The editor renders into the shell's own DOM, so there is no
	 * in-page overlay and no full-screen admin page to link to.
	 */
	openInDesktop: typeof openInDesktop;
	registerPanel: typeof registerPanel;
	unregisterPanel: typeof unregisterPanel;
	listPanels: typeof listPanels;
	/** Bundle version, matching the plugin's. */
	version: string;
}

declare global {
	interface Window {
		lienzo?: LienzoApi;
	}
}

/** Bundle version, matching the plugin's. */
export const version: string = window.lienzoConfig?.version ?? '0.0.0';

/** Starts every host that has a mount point on this screen. */
function boot(): void {
	bootDesktopMode();
	bootOpenButtons();
	bootMediaDrag();
	bootMediaModal();
	bootBlockEditor();
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', boot, { once: true } );
} else {
	boot();
}

export { mount, openInDesktop, registerPanel, unregisterPanel, listPanels };
export type { EditorInstance, MountOptions, PanelDef };
