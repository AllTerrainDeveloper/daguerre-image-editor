/**
 * The media modal host.
 *
 * Adds an "Edit with Daguerre" button to the attachment details views, in both the
 * grid modal (`upload.php?mode=grid`) and the insert-media modal.
 *
 * The button is added by extending the view's `render()` rather than by replacing
 * its underscore template. Core's `tmpl-attachment-details-two-column` is long,
 * changes between releases, and forking it would silently freeze this plugin's copy
 * of the metadata form at whatever WordPress version it was copied from. Appending
 * one button after core has rendered survives core changing everything around it.
 *
 * `wp.media` has no hook registry -- extension is Backbone prototype patching --
 * so every step here is feature-detected and bails rather than throwing.
 */

import { __ } from '../i18n';
import { openEditorOverlay } from './overlay';

import type { BackboneView } from '../globals';

/** Marks views already patched, so a re-boot cannot double-wrap them. */
const patched = new WeakSet< object >();

/**
 * Adds the editor button to the media modal.
 *
 * Safe to call on any admin screen; no-ops when `wp.media` is absent.
 */
export function bootMediaModal(): void {
	const details = window.wp?.media?.view?.Attachment?.Details;

	if ( ! details ) {
		return;
	}

	// The two-column view (grid modal) is the high-traffic one; the single-column
	// details view backs the insert-media modal.
	patchView( details.TwoColumn );
	patchView( details );
}

/**
 * Wraps a details view so it renders our button after its own markup.
 *
 * @param view Backbone view constructor.
 */
function patchView( view: BackboneView | undefined ): void {
	if ( ! view?.prototype?.render || patched.has( view ) ) {
		return;
	}

	patched.add( view );

	const originalRender = view.prototype.render;

	view.prototype.render = function ( this: BackboneView[ 'prototype' ], ...args: unknown[] ) {
		const result = originalRender.apply( this, args );

		try {
			addButton( this );
		} catch {
			// A core change to the view's shape must degrade to "no button", never
			// to a broken media modal.
		}

		return result;
	};
}

/**
 * Appends the button to a rendered attachment details view.
 *
 * @param view The view instance, typed loosely because `wp.media` ships no types.
 */
function addButton( view: Record< string, unknown > ): void {
	const el = ( view.el ?? null ) as HTMLElement | null;
	const model = view.model as
		| { get: ( key: string ) => unknown }
		| undefined;

	if ( ! el || ! model ) {
		return;
	}

	const id = Number( model.get( 'id' ) );
	const mime = String( model.get( 'mime' ) ?? '' );
	const config = window.daguerreConfig;

	if ( ! id || ! config || ! config.supportedMimes.includes( mime ) ) {
		return;
	}

	// `can.save` is core's own answer to "may this user edit this attachment",
	// already resolved server-side. Trusting it keeps the button honest without a
	// second round trip.
	const can = model.get( 'can' ) as { save?: boolean } | undefined;

	if ( can && can.save === false ) {
		return;
	}

	if ( el.querySelector( '.dg-modal-button' ) ) {
		return;
	}

	const host =
		el.querySelector( '.attachment-actions' ) ??
		el.querySelector( '.attachment-info' ) ??
		el;

	const button = document.createElement( 'button' );
	button.type = 'button';
	button.className = 'button dg-modal-button';
	button.textContent = __( 'Edit with Daguerre' );

	button.addEventListener( 'click', ( event ) => {
		event.preventDefault();
		event.stopPropagation();

		openEditorOverlay( {
			attachmentId: id,
			onSave: () => {
				// The library behind the modal now has one more item. Ask the
				// collection to refresh so the new copy shows up without a reload.
				const collection = ( view.collection ?? null ) as
					| { more?: () => void; props?: { trigger: ( e: string ) => void } }
					| null;

				collection?.props?.trigger( 'change' );
			},
		} );
	} );

	host.appendChild( button );
}
