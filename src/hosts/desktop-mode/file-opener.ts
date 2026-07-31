/**
 * Opening images from the desktop's file manager.
 */

import { __ } from '../../i18n';
import { desktop } from './desktop-api';
import { openInDesktop } from './open-window';

/**
 * Offers Lienzo as a way to open image files on the desktop.
 *
 * Registered with `isDefault: false` so it appears alongside the built-in media
 * editor rather than silently replacing it; a user who wants it as the default sets
 * that in Desktop Mode's own file associations.
 */
export function registerFileOpener(): void {
	const files = desktop()?.files;

	if ( ! files?.registerOpener ) {
		return;
	}

	// On the object, for the same reason the drop target is.
	files.registerOpener( {
		id: 'lienzo',
		label: __( 'Edit in Lienzo' ),
		types: [ 'attachment' ],
		isDefault: false,
		sort: 15,
		handler: {
			kind: 'js',
			open: ( file ) => openInDesktop( Number( file.ref() ) || 0 ),
		},
	} );
}

