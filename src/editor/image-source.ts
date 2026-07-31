/**
 * Turning whatever was dropped into pixels.
 *
 * Three ways in -- an attachment id, a file from the desktop, a bare URL -- and one
 * decoded image out. The order matters: an attachment id gets the CORS-safe path, so
 * it is always preferred over a URL that happens to point at the same file.
 */

import { __ } from '../i18n';
import {
	loadImageFile,
	loadImageUrl,
	loadSourceImage,
} from '../net/image-loader';
import type { LoadedImage } from '../net/image-loader';
import type { RestClient } from '../net/rest';

/** Where an image dropped onto the editor came from, and where it landed. */
export interface DroppedImage {
	/** Attachment to add. Its pixels are loaded through the CORS-safe path. */
	attachmentId?: number;
	/** A file dragged in from outside the browser. Used when there is no attachment. */
	file?: File;
	/**
	 * An image URL, for a drag that carried a link rather than bytes.
	 *
	 * What dragging a thumbnail out of the Media Library actually offers. Used only
	 * when no attachment id could be recovered, since an id gets the CORS-safe path.
	 */
	url?: string;
	/** Name for the layer. Falls back to the attachment's title or the file's name. */
	title?: string;
	/** Where the pointer released, in client coordinates. Defaults to the centre. */
	clientX?: number;
	clientY?: number;
}

/** A decoded drop, ready to become a layer. */
export interface ResolvedImage extends LoadedImage {
	/** What to call the layer. */
	title: string;
}

/**
 * Loads an image URL, preferring the full-size original behind a generated size.
 *
 * A thumbnail dragged out of the Media Library list gives its *rendered* URL, which is
 * usually a WordPress-generated size -- `photo-150x150.jpg`. Adding that as a layer
 * would put a 150-pixel image on the canvas when the original is sitting right there.
 *
 * The suffix is stripped and tried first, with the URL as it came as the fallback,
 * because the guess is not safe on its own: a file legitimately named
 * `poster-1920x1080.jpg` looks exactly like a generated size.
 *
 * @param url URL as dragged.
 */
export async function loadFullSize( url: string ): Promise< LoadedImage > {
	const full = url.replace( /-\d+x\d+(\.[a-z0-9]+)(\?|#|$)/i, '$1$2' );

	if ( full !== url ) {
		try {
			return await loadImageUrl( full );
		} catch {
			// Not a generated size after all -- the name merely looked like one.
		}
	}

	return loadImageUrl( url );
}

/**
 * A readable layer name from an image URL.
 *
 * @param url Image URL.
 */
export function fileNameFromUrl( url: string ): string {
	try {
		const path = new URL( url, window.location.href ).pathname;

		return (
			decodeURIComponent( path.split( '/' ).pop() ?? '' ).replace(
				/\.[^.]+$/,
				''
			) || 'Image'
		);
	} catch {
		return 'Image';
	}
}

/**
 * Decodes whatever was dropped.
 *
 * @param dropped What was dropped.
 * @param client  REST client, for the attachment path.
 * @return The decoded image, or null when the drop carried nothing usable.
 * @throws {Error} When the source was identified but could not be loaded.
 */
export async function resolveDroppedImage(
	dropped: DroppedImage,
	client: RestClient
): Promise< ResolvedImage | null > {
	if ( dropped.attachmentId ) {
		// Through the media payload rather than straight at a URL, so a CDN-served
		// file falls back to the same-origin byte proxy instead of tainting the canvas
		// and breaking every later save.
		const payload = await client.getMedia( dropped.attachmentId );
		const loaded = await loadSourceImage( payload, client );

		return { ...loaded, title: dropped.title || payload.title };
	}

	if ( dropped.file ) {
		const loaded = await loadImageFile( dropped.file );

		return {
			...loaded,
			title: dropped.title || dropped.file.name.replace( /\.[^.]+$/, '' ),
		};
	}

	if ( dropped.url ) {
		const loaded = await loadFullSize( dropped.url );

		return { ...loaded, title: dropped.title || fileNameFromUrl( dropped.url ) };
	}

	return null;
}

/**
 * Names a text layer after the words it holds.
 *
 * A stack of layers called "Layer 3" is a stack you have to click through to read. The
 * first line, trimmed, is what someone would call it themselves.
 *
 * @param text What was typed.
 */
export function textLayerName( text: string ): string {
	const first = text.split( '\n' )[ 0 ].trim();

	if ( ! first ) {
		return __( 'Text' );
	}

	return first.length > 24 ? `${ first.slice( 0, 23 ) }…` : first;
}
