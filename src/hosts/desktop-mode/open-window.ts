/**
 * Asking the desktop to open an image.
 *
 * Three routes, best first: the shell's own `openWindow`, a postMessage to the parent
 * frame, and a same-frame custom event. Which one is available depends on whether this
 * bundle is running in the shell, in a chromeless iframe, or neither.
 */

import { desktop, state, WINDOW_ID } from './desktop-api';

/** The message an iframe sends to ask the shell to open an image. */
const OPEN_MESSAGE = 'lienzo-open';

/**
 * Opens an image in the desktop window, from anywhere on the page.
 *
 * Callable from the shell itself or from inside a chromeless iframe: the shell's
 * window manager only exists in the top frame, so a request from an iframe is posted
 * up to the listener installed by `bootDesktopMode()`.
 *
 * @param attachmentId Attachment to edit.
 * @return True when the request was handled or forwarded.
 */
export function openInDesktop( attachmentId: number ): boolean {
	const id = Number( attachmentId ) || 0;

	if ( ! id ) {
		return false;
	}

	if ( desktop()?.openWindow ) {
		// The most recently rendered window is the one on screen. Load into it rather
		// than focusing a window showing something else and leaving the id parked.
		const live = [ ...state().openers ].pop();

		if ( live ) {
			live( id );
		} else {
			state().pending = id;
		}

		desktop()?.openWindow?.( WINDOW_ID, { source: 'lienzo' } );

		return true;
	}

	if ( window.parent && window.parent !== window ) {
		window.parent.postMessage(
			{ type: OPEN_MESSAGE, attachmentId: id },
			window.location.origin
		);

		return true;
	}

	return false;
}

/**
 * Listens for open requests posted up from chromeless iframes.
 *
 * Same-origin only, and the payload is one integer -- an iframe on this page is our
 * own admin, but the check costs nothing and the alternative is trusting whatever
 * else might be embedded.
 */
export function listenForOpenRequests(): void {
	if ( state().listenerRegistered ) {
		return;
	}

	state().listenerRegistered = true;

	window.addEventListener( 'message', ( event: MessageEvent ) => {
		if ( event.origin !== window.location.origin ) {
			return;
		}

		const data = event.data as { type?: string; attachmentId?: number } | null;

		if ( ! data || data.type !== OPEN_MESSAGE ) {
			return;
		}

		openInDesktop( Number( data.attachmentId ) || 0 );
	} );
}
