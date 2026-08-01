/**
 * One thumbnail in the picker grid.
 */

import { __, sprintf } from '../../i18n';
import type { MediaItem } from './types';

/**
 * Picks the smallest available rendition for a grid thumbnail.
 *
 * Falling back to `source_url` would download the full-resolution original for
 * every tile, which on a library of 4000px photographs is tens of megabytes to draw
 * a grid of 150px squares.
 *
 * @param item Media item.
 */
export function thumbnailFor( item: MediaItem ): string {
	const sizes = item.media_details?.sizes ?? {};

	for ( const name of [ 'thumbnail', 'medium', 'medium_large', 'large' ] ) {
		const url = sizes[ name ]?.source_url;

		if ( url ) {
			return url;
		}
	}

	return item.source_url ?? '';
}

/**
 * Builds one thumbnail tile.
 *
 * A button, not a link. It was a link once, for the browser's own affordances --
 * middle-click, open in a new tab, a shareable URL. There is no longer a page at the
 * other end: the editor is a desktop window. Worse, a link with an admin URL is
 * intercepted by the shell's own link handling, which opens it as an iframe window
 * *before* a click handler on the link can call `preventDefault()` -- so every pick
 * navigated to a page that no longer exists and produced a 403.
 *
 * @param item   Media item.
 * @param onPick Called with the chosen attachment.
 */
export function renderTile(
	item: MediaItem,
	onPick?: ( attachmentId: number ) => void
): HTMLElement {
	const title =
		item.title?.rendered?.replace( /<[^>]*>/g, '' ) || __( 'Untitled image' );

	const tile = document.createElement( 'button' );
	tile.type = 'button';
	tile.className = 'lz-picker__tile';
	tile.setAttribute( 'role', 'listitem' );

	const image = document.createElement( 'img' );
	image.className = 'lz-picker__thumb';
	image.src = thumbnailFor( item );
	image.alt = '';
	image.loading = 'lazy';
	image.decoding = 'async';

	const caption = document.createElement( 'span' );
	caption.className = 'lz-picker__caption';
	caption.textContent = title;

	const { width, height } = item.media_details ?? {};

	tile.title =
		width && height ? sprintf( '%s — %d × %d', title, width, height ) : title;

	tile.addEventListener( 'click', () => onPick?.( item.id ) );
	tile.append( image, caption );

	return tile;
}
