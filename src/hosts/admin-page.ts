/**
 * The full-screen admin page host.
 *
 * The simplest of the editor's surfaces, and the one the others are validated
 * against: it does nothing but find the mount point PHP printed and hand it to
 * `mount()`. If the editor works here it works everywhere, because every other host
 * differs only in where the element lives.
 */

import { mount } from '../api';
import type { EditorInstance } from '../api';
import { __ } from '../i18n';
import { renderPicker } from '../ui/picker';

/** The live instance, so a re-boot cannot leak a second Pixi context. */
let instance: EditorInstance | null = null;

/**
 * Finds the admin page's mount point and starts the editor.
 *
 * Safe to call on any admin screen; it no-ops when the mount point is absent.
 */
export function bootAdminPage(): void {
	const root = document.querySelector< HTMLElement >(
		'[data-daguerre-root][data-host="page"]'
	);

	if ( ! root ) {
		return;
	}

	const attachmentId = Number( root.dataset.attachment ?? 0 );

	if ( ! attachmentId ) {
		renderEmptyState( root );
		return;
	}

	instance?.destroy();
	instance = mount( root, { attachmentId, host: 'page' } );

	// Reachable from the console for diagnosing render problems.
	( window as unknown as { daguerreEditor?: unknown } ).daguerreEditor = instance;

	// A bfcache restore or a Turbo-style navigation would otherwise leave a live
	// WebGL context and its textures behind.
	window.addEventListener(
		'pagehide',
		() => {
			instance?.destroy();
			instance = null;
		},
		{ once: true }
	);
}

/**
 * Shown when the page is opened without an attachment.
 *
 * @param root Mount point.
 */
function renderEmptyState( root: HTMLElement ): void {
	const config = window.daguerreConfig;

	if ( ! config ) {
		root.textContent = __( 'Daguerre could not load its configuration.' );
		return;
	}

	void renderPicker( root, config );
}
