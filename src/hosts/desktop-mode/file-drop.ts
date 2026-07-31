/**
 * Native file drops onto the window body.
 *
 * The shell's drop target covers payloads the desktop itself is dragging; this covers
 * everything the browser hands over -- a file from the Finder, a thumbnail from another
 * tab, a URL from the address bar.
 */

import type { DroppedImage } from '../../editor';
import { __, sprintf } from '../../i18n';
import { ATTACHMENT_TYPE } from '../media-drag';
import { toast } from '../../platform';
import { readDroppedImage, WP_MEDIA_TYPE } from './drop-payload';

/**
 * Accepts images dragged onto the editor by the browser.
 *
 * The shell's drag manager handles drags that start on the *desktop* -- a My WordPress
 * media tile, a desktop icon. Everything else is a plain HTML5 drag the manager never
 * sees: a file from Finder, and, crucially, a thumbnail dragged out of the Media
 * Library window, which is an iframe whose drags reach the parent as ordinary
 * `dragover`/`drop` events.
 *
 * Listened for on the **document**, not on the window body, and then hit-tested against
 * the body's bounds. A drag over the desktop passes over a good deal of the shell's own
 * furniture -- overlays, drag layers, the window chrome -- and an event whose target is
 * one of those never reaches a listener bound to an element it is not inside. Bubbling
 * to the document always happens; the hit test is what keeps us from claiming drops
 * meant for someone else.
 *
 * @param element Drop area, used for hit-testing and for the highlight.
 * @param drop    Called with each image dropped.
 * @return Teardown.
 */
export function attachFileDrop(
	element: HTMLElement,
	drop: ( dropped: DroppedImage ) => void
): () => void {
	/**
	 * Whether a drag looks like it holds an image.
	 *
	 * `dragover` cannot read the data -- the browser withholds it until the drop -- so
	 * this goes on the advertised *types*. Being generous here is right: refusing a
	 * drag is final, and the drop handler can still decline.
	 */
	const looksLikeImage = ( event: DragEvent ): boolean => {
		const types = Array.from( event.dataTransfer?.types ?? [] );

		return (
			types.includes( ATTACHMENT_TYPE ) ||
			types.includes( WP_MEDIA_TYPE ) ||
			types.includes( 'Files' ) ||
			types.includes( 'text/uri-list' ) ||
			types.includes( 'text/html' ) ||
			types.includes( 'text/plain' )
		);
	};

	/** Whether a point is inside the drop area. */
	const inside = ( event: DragEvent ): boolean => {
		const box = element.getBoundingClientRect();

		return (
			box.width > 0 &&
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom
		);
	};

	const onOver = ( event: DragEvent ) => {
		if ( ! looksLikeImage( event ) || ! inside( event ) ) {
			element.classList.remove( 'is-drop-target' );

			return;
		}

		// Both are required: without preventDefault on dragover the browser refuses the
		// drop outright, and without `dropEffect` the cursor claims it will move the
		// original rather than copy it.
		event.preventDefault();

		if ( event.dataTransfer ) {
			event.dataTransfer.dropEffect = 'copy';
		}

		element.classList.add( 'is-drop-target' );
	};

	const onLeave = ( event: DragEvent ) => {
		if ( inside( event ) ) {
			return;
		}

		element.classList.remove( 'is-drop-target' );
	};

	const onDrop = ( event: DragEvent ) => {
		element.classList.remove( 'is-drop-target' );

		if ( ! inside( event ) ) {
			return;
		}

		const dropped = readDroppedImage( event.dataTransfer );

		// Always claimed, even when unusable. `dragover` already told the user this was
		// a valid target by highlighting; letting the browser have the drop after that
		// would navigate the whole desktop to the dragged URL.
		event.preventDefault();

		if ( ! dropped ) {
			// Said out loud rather than swallowed. A drop that highlights and then does
			// nothing is indistinguishable from a broken feature -- which is exactly how
			// the Media Library case went unnoticed.
			toast(
				sprintf(
					__( 'That drag carried no image Lienzo could read (%s).' ),
					Array.from( event.dataTransfer?.types ?? [] ).join( ', ' ) ||
						__( 'no data' )
				),
				'info'
			);

			return;
		}

		drop( { ...dropped, clientX: event.clientX, clientY: event.clientY } );
	};

	// Capture phase, so a drop is claimed before the shell's own document-level
	// handlers can take it -- they yield to anything that has already called
	// `preventDefault()`, which is exactly what this does when the point is ours.
	document.addEventListener( 'dragover', onOver, true );
	document.addEventListener( 'dragleave', onLeave, true );
	document.addEventListener( 'drop', onDrop, true );

	return () => {
		document.removeEventListener( 'dragover', onOver, true );
		document.removeEventListener( 'dragleave', onLeave, true );
		document.removeEventListener( 'drop', onDrop, true );
	};
}
