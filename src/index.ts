/**
 * Bundle entry point.
 *
 * Publishes the mount API on `window.daguerre` and boots whichever host is present
 * on the current screen. Hosts are self-detecting and no-op when their mount point
 * is absent, so this file stays a list rather than a router.
 */

import { mount } from './api';
import type { EditorInstance, MountOptions } from './api';
import { bootAdminPage } from './hosts/admin-page';
import { bootBlockEditor } from './hosts/block-editor';
import { bootDesktopMode } from './hosts/desktop-mode';
import { bootMediaModal } from './hosts/media-modal';
import { openEditorOverlay } from './hosts/overlay';
import { listPanels, registerPanel, unregisterPanel } from './ui/panels';
import type { PanelDef } from './ui/panels';

/** The public JavaScript API. */
export interface DaguerreApi {
	/** Mounts the editor into an element. */
	mount: ( element: HTMLElement, options: MountOptions ) => EditorInstance;
	/**
	 * Adds a tool to the editor sidebar.
	 *
	 * Panels appear immediately in any open editor, so this can be called at any
	 * time. Registering an id that already exists replaces it, which is how a plugin
	 * would override a built-in tool rather than only adding beside it.
	 */
	registerPanel: ( def: PanelDef ) => void;
	/** Removes a registered panel. */
	unregisterPanel: ( id: string ) => void;
	/** Every registered panel, in display order. */
	listPanels: () => PanelDef[];
	/** Opens the editor in a full-screen overlay over the current page. */
	openOverlay: ( options: { attachmentId: number } ) => { close: () => void };
	/** Bundle version, matching the plugin's. */
	version: string;
}

declare global {
	interface Window {
		daguerre?: DaguerreApi;
	}
}

const api: DaguerreApi = {
	mount,
	openOverlay: openEditorOverlay,
	registerPanel,
	unregisterPanel,
	listPanels,
	version: window.daguerreConfig?.version ?? '0.0.0',
};

window.daguerre = api;

/** Starts every host that has a mount point on this screen. */
function boot(): void {
	bootAdminPage();
	bootMediaModal();
	bootBlockEditor();
	bootDesktopMode();
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', boot, { once: true } );
} else {
	boot();
}

export { mount, openEditorOverlay, registerPanel, unregisterPanel, listPanels };
export type { EditorInstance, MountOptions, PanelDef };
