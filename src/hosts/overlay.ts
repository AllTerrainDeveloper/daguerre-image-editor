/**
 * A full-screen overlay host for the editor.
 *
 * Both remaining Phase 3 surfaces -- the media modal and the block editor -- need
 * to put the editor on screen over whatever the user was already doing. Rather than
 * implement that twice, and rather than weave the editor into `wp.media`'s Backbone
 * state machine (which is load-order sensitive and changes between releases), both
 * open this one overlay.
 *
 * The trade is deliberate: a little less visual integration with the media modal's
 * own chrome, in exchange for one implementation that cannot be broken by a core
 * refactor of `wp.media.view`.
 */

import { mount } from '../api';
import type { EditorInstance } from '../api';
import { __ } from '../i18n';
import type { SaveResult } from '../types';

/** Selector matching everything focusable, for the focus trap. */
const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface OverlayOptions {
	/** Attachment to open. */
	attachmentId: number;
	/** Called after each successful save. */
	onSave?: ( result: SaveResult ) => void;
	/** Called once the overlay has closed. */
	onClose?: () => void;
}

/** The overlay currently on screen, so two cannot stack. */
let active: { close: () => void } | null = null;

/**
 * Opens the editor in a full-screen overlay.
 *
 * @param options Overlay configuration.
 * @return A handle that closes it.
 */
export function openEditorOverlay( options: OverlayOptions ): { close: () => void } {
	// A second editor would mean a second WebGL context and a second copy of the
	// image in GPU memory, for no benefit.
	active?.close();

	const previousFocus = document.activeElement as HTMLElement | null;

	const backdrop = document.createElement( 'div' );
	backdrop.className = 'dg-overlay';

	const dialog = document.createElement( 'div' );
	dialog.className = 'dg-overlay__dialog';
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-modal', 'true' );
	dialog.setAttribute( 'aria-label', __( 'Edit image with Daguerre' ) );

	const mountPoint = document.createElement( 'div' );
	mountPoint.className = 'dg-overlay__editor';

	dialog.appendChild( mountPoint );
	backdrop.appendChild( dialog );

	let editor: EditorInstance | null = null;
	let closed = false;

	const close = () => {
		if ( closed ) {
			return;
		}

		closed = true;
		active = null;

		document.removeEventListener( 'keydown', onKeyDown, true );

		editor?.destroy();
		backdrop.remove();
		document.body.classList.remove( 'dg-overlay-open' );

		// Return focus where it was, or a keyboard user is dumped at the top of the
		// document with no idea where they came from.
		previousFocus?.focus?.();

		options.onClose?.();
	};

	/**
	 * Handles Escape, and keeps Tab inside the dialog.
	 *
	 * Captured rather than bubbled: the media modal binds its own Escape handler,
	 * and without capture it would close the whole modal out from under the editor.
	 */
	function onKeyDown( event: KeyboardEvent ): void {
		if ( event.key === 'Escape' ) {
			event.stopPropagation();
			event.preventDefault();
			close();
			return;
		}

		if ( event.key !== 'Tab' ) {
			return;
		}

		const focusable = Array.from(
			dialog.querySelectorAll< HTMLElement >( FOCUSABLE )
		).filter( ( el ) => el.offsetParent !== null );

		if ( focusable.length === 0 ) {
			return;
		}

		const first = focusable[ 0 ];
		const last = focusable[ focusable.length - 1 ];

		if ( event.shiftKey && document.activeElement === first ) {
			event.preventDefault();
			last.focus();
		} else if ( ! event.shiftKey && document.activeElement === last ) {
			event.preventDefault();
			first.focus();
		}
	}

	backdrop.addEventListener( 'pointerdown', ( event ) => {
		// Only a click on the backdrop itself closes; one that started inside the
		// dialog and drifted out (a slider drag past the edge) must not.
		if ( event.target === backdrop ) {
			close();
		}
	} );

	document.addEventListener( 'keydown', onKeyDown, true );
	document.body.appendChild( backdrop );
	document.body.classList.add( 'dg-overlay-open' );

	editor = mount( mountPoint, {
		attachmentId: options.attachmentId,
		host: 'modal',
		onClose: close,
		onSave: options.onSave,
	} );

	// Move focus into the dialog so the trap has somewhere to start.
	window.requestAnimationFrame( () => {
		dialog.querySelector< HTMLElement >( FOCUSABLE )?.focus();
	} );

	active = { close };

	return { close };
}
