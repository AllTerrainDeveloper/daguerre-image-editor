/**
 * Handing a finished render to the user.
 */

import { __, sprintf } from '../i18n';
import type { SaveResult } from '../types';

/**
 * What to say about a completed save.
 *
 * The dimensions the site actually stored, not the ones rendered: WordPress applies
 * `big_image_size_threshold` to every upload and will quietly downscale a large
 * render, and claiming otherwise would be a comfortable lie.
 *
 * @param result   Save response.
 * @param rendered Width the editor rendered at, when known.
 */
export function savedMessage( result: SaveResult, rendered?: number ): string {
	const downscaled =
		rendered !== undefined && result.width > 0 && result.width < rendered;

	return sprintf(
		downscaled
			? /* translators: 1: stored width, 2: stored height. */
			  __( 'Saved as a copy. This site stores images at up to %1$d × %2$d.' )
			: /* translators: 1: stored width, 2: stored height. */
			  __( 'Saved as a copy — %1$d × %2$d.' ),
		result.width,
		result.height
	);
}

/**
 * Hands a blob to the browser as a download.
 *
 * @param blob     What to download.
 * @param filename What to call it.
 */
export function download( blob: Blob, filename: string ): void {
	const url = URL.createObjectURL( blob );
	const link = document.createElement( 'a' );

	link.href = url;
	link.download = filename;
	document.body.appendChild( link );
	link.click();
	link.remove();

	// Revoking immediately can abort the download in some browsers; a generous delay
	// is enough for the click to have been consumed.
	window.setTimeout( () => URL.revokeObjectURL( url ), 60_000 );
}

/**
 * A safe filename for an exported image.
 *
 * @param title  Image title, which can hold anything a caption can.
 * @param format Output MIME type.
 */
export function exportFilename( title: string, format: string ): string {
	const extension = format.split( '/' )[ 1 ] ?? 'jpg';
	const base = ( title || 'image' ).replace( /[^\w-]+/g, '-' );

	return `${ base }-edited.${ 'jpeg' === extension ? 'jpg' : extension }`;
}
