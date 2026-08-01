/**
 * What to do with an edit of a post's image.
 *
 * Only asked when the editor was opened *from* a post -- a product dropped on the
 * icon, say. Opening a photo from the picker has no post to update, so there is
 * nothing to ask and the save just runs.
 *
 * Both answers are non-destructive. Lienzo has no path that rewrites an original and
 * this does not add one: "update the product" writes a new attachment and points the
 * product at it, leaving the previous image in the library. That is what makes the
 * change reversible -- the old image is still there, and putting it back is one more
 * repoint rather than a restore from backup.
 */

import { __, sprintf } from '../i18n';
import { createButton } from '../ui/controls';
import type { PostOrigin } from '../types';

/** What the user chose. */
export type SaveChoice = 'attach' | 'copy' | 'cancel';

/**
 * Asks whether the edit should replace the post's image.
 *
 * A dialog rather than two toolbar buttons: the question only exists for images
 * opened from a post, and a button that appears and disappears depending on how the
 * editor was opened is a button nobody learns.
 *
 * @param root   Element to render the dialog into.
 * @param origin The post the image came from.
 * @return What the user chose.
 */
export function askSaveChoice(
	root: HTMLElement,
	origin: PostOrigin
): Promise< SaveChoice > {
	return new Promise( ( resolve ) => {
		const overlay = document.createElement( 'div' );
		overlay.className = 'lz-choice';

		const dialog = document.createElement( 'div' );
		dialog.className = 'lz-choice__dialog';
		dialog.setAttribute( 'role', 'dialog' );
		dialog.setAttribute( 'aria-modal', 'true' );
		dialog.setAttribute( 'aria-labelledby', 'lz-choice-title' );

		const title = document.createElement( 'h2' );
		title.className = 'lz-choice__title';
		title.id = 'lz-choice-title';
		title.textContent = sprintf(
			/* translators: %s: post title. */
			__( 'Save your edit of “%s”' ),
			origin.postTitle
		);

		const body = document.createElement( 'p' );
		body.className = 'lz-choice__body';
		body.textContent = sprintf(
			/* translators: %s: singular post type label, e.g. "product". */
			__(
				'Either way the original image stays in your library untouched — this saves a new copy. The only question is whether the %s should start using it.'
			),
			origin.postTypeLabel.toLowerCase()
		);

		const actions = document.createElement( 'div' );
		actions.className = 'lz-choice__actions';

		const handles: Array< { destroy: () => void } > = [];

		/**
		 * Closes the dialog and answers.
		 *
		 * @param choice What the user chose.
		 */
		const finish = ( choice: SaveChoice ) => {
			document.removeEventListener( 'keydown', onKey );

			for ( const handle of handles ) {
				handle.destroy();
			}

			overlay.remove();
			resolve( choice );
		};

		const onKey = ( event: KeyboardEvent ) => {
			if ( 'Escape' === event.key ) {
				event.preventDefault();
				finish( 'cancel' );
			}
		};

		const attach = createButton( {
			label: sprintf(
				/* translators: %s: singular post type label, e.g. "Product". */
				__( 'Update the %s' ),
				origin.postTypeLabel.toLowerCase()
			),
			title: sprintf(
				/* translators: %s: singular post type label. */
				__( 'Save a copy and point the %s at it.' ),
				origin.postTypeLabel.toLowerCase()
			),
			variant: 'primary',
			onClick: () => finish( 'attach' ),
		} );

		const copy = createButton( {
			label: __( 'Just save a copy' ),
			title: __( 'Save a copy and leave this post as it is.' ),
			variant: 'secondary',
			onClick: () => finish( 'copy' ),
		} );

		const cancel = createButton( {
			label: __( 'Cancel' ),
			variant: 'ghost',
			onClick: () => finish( 'cancel' ),
		} );

		handles.push( attach, copy, cancel );
		actions.append( attach.el, copy.el, cancel.el );
		dialog.append( title, body, actions );
		overlay.appendChild( dialog );

		// Clicking the backdrop is a cancel, the same as Escape. Guarded on the target
		// so a click that started inside the dialog and drifted out does not dismiss it.
		overlay.addEventListener( 'click', ( event ) => {
			if ( event.target === overlay ) {
				finish( 'cancel' );
			}
		} );

		document.addEventListener( 'keydown', onKey );
		root.appendChild( overlay );

		// Focus the safe option rather than the destructive-sounding one, and give the
		// dialog focus at all so Escape and Tab land somewhere sensible.
		( copy.el as HTMLElement ).focus?.();
	} );
}
