/**
 * The "Edit with Daguerre" controls scattered around the admin.
 *
 * The row action in the media list, the button on the attachment screen, and anything
 * a plugin adds with the same attribute. They used to be links to a full-screen editor
 * page; inside the desktop shell that page loaded as an *iframe* window, which is the
 * one place the editor cannot reach the shell's components, its drag bridge or its
 * Pixi. So they are buttons now, and they open the native window instead.
 *
 * One delegated listener rather than one per control: the media list re-renders its
 * rows on every filter and sort, and re-binding after each of those is how a button
 * ends up silently dead.
 */

import { openInDesktop } from './desktop-mode';

/** Marks a control that opens an image in the desktop window. */
const ATTRIBUTE = 'data-daguerre-open';

/**
 * Wires up every open control on the page, present and future.
 */
export function bootOpenButtons(): void {
	document.addEventListener( 'click', ( event ) => {
		const target = event.target;

		if ( ! ( target instanceof Element ) ) {
			return;
		}

		const control = target.closest( `[${ ATTRIBUTE }]` );

		if ( ! ( control instanceof HTMLElement ) ) {
			return;
		}

		const attachmentId = Number( control.getAttribute( ATTRIBUTE ) ) || 0;

		if ( ! attachmentId ) {
			return;
		}

		// Prevented before the request is made, not after: if the shell is somehow
		// unreachable the control should do nothing visible rather than navigate the
		// whole desktop away to a page that no longer exists.
		event.preventDefault();
		openInDesktop( attachmentId );
	} );
}
