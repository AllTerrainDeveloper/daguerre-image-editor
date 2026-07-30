/**
 * The image picker shown when the editor page is opened without an attachment.
 *
 * "Media -> Edit Photos" is a reasonable thing to click before you have chosen a
 * photo, so that route needs to end somewhere useful rather than telling you to go
 * somewhere else and come back.
 *
 * It reads core's own `wp/v2/media` route rather than a Daguerre one: the data is
 * already exposed, already paginated, and already permission-checked per user.
 */

import { __, sprintf } from '../i18n';
import { request } from '../platform';
import type { DaguerreConfig } from '../types';

/** How many thumbnails to fetch. Enough to fill a screen without a pager. */
const PAGE_SIZE = 60;

/** Shape of the fields requested from `wp/v2/media`. */
interface MediaItem {
	id: number;
	mime_type: string;
	title?: { rendered?: string };
	media_details?: {
		width?: number;
		height?: number;
		sizes?: Record< string, { source_url?: string } >;
	};
	source_url?: string;
}

/**
 * Picks the smallest available rendition for a grid thumbnail.
 *
 * Falling back to `source_url` would download the full-resolution original for
 * every tile, which on a library of 4000px photographs is tens of megabytes to draw
 * a grid of 150px squares.
 *
 * @param item Media item.
 */
function thumbnailFor( item: MediaItem ): string {
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
 * Renders a grid of editable images into an element.
 *
 * @param root   Element to fill.
 * @param config Runtime configuration.
 * @param onPick Optional. When given, intercepts the click instead of navigating --
 *               needed inside a Desktop Mode window, where following the link would
 *               navigate the whole shell away from the desktop.
 */
export async function renderPicker(
	root: HTMLElement,
	config: DaguerreConfig,
	onPick?: ( attachmentId: number ) => void,
	isStale?: () => boolean
): Promise< void > {
	if ( isStale?.() ) {
		return;
	}

	root.classList.add( 'dg-picker' );

	const heading = document.createElement( 'h2' );
	heading.className = 'dg-picker__heading';
	heading.textContent = __( 'Choose a photo to edit' );

	const status = document.createElement( 'p' );
	status.className = 'dg-picker__status';
	status.textContent = __( 'Loading your photos…' );

	root.replaceChildren( heading, status );

	let items: MediaItem[];

	try {
		const url = new URL( config.mediaUrl );
		url.searchParams.set( 'media_type', 'image' );
		url.searchParams.set( 'per_page', String( PAGE_SIZE ) );
		url.searchParams.set( 'orderby', 'date' );
		url.searchParams.set( 'order', 'desc' );
		url.searchParams.set( '_fields', 'id,mime_type,title,source_url,media_details' );

		const response = await request( url.toString(), {
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': config.restNonce },
		} );

		if ( ! response.ok ) {
			throw new Error( __( 'Your media library could not be loaded.' ) );
		}

		items = ( await response.json() ) as MediaItem[];
	} catch ( error ) {
		status.classList.add( 'dg-picker__status--error' );
		status.textContent =
			error instanceof Error ? error.message : __( 'Your media library could not be loaded.' );
		return;
	}

	// The fetch above is the only await, and anything can happen during it -- most
	// often the user picking a photo, which mounts the editor into this very element.
	// Writing the grid after that would erase the editor and leave the picker showing
	// over a window that had already moved on.
	if ( isStale?.() ) {
		return;
	}

	// Filter client-side rather than by a REST parameter: `wp/v2/media` has no
	// "one of these MIME types" filter, and the supported list is a plugin concern
	// that a filter on the server can change at any time.
	const editable = items.filter( ( item ) =>
		config.supportedMimes.includes( item.mime_type )
	);

	if ( editable.length === 0 ) {
		status.textContent = __(
			'No editable images yet. Upload a JPEG, PNG, WebP or AVIF to get started.'
		);

		const link = document.createElement( 'a' );
		link.className = 'button button-primary';
		link.href = 'media-new.php';
		link.textContent = __( 'Upload a photo' );
		root.appendChild( link );

		return;
	}

	status.remove();

	const grid = document.createElement( 'div' );
	grid.className = 'dg-picker__grid';
	grid.setAttribute( 'role', 'list' );

	for ( const item of editable ) {
		grid.appendChild( renderTile( item, onPick ) );
	}

	root.appendChild( grid );
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
function renderTile(
	item: MediaItem,
	onPick?: ( attachmentId: number ) => void
): HTMLElement {
	const title =
		item.title?.rendered?.replace( /<[^>]*>/g, '' ) || __( 'Untitled image' );

	const tile = document.createElement( 'button' );
	tile.type = 'button';
	tile.className = 'dg-picker__tile';
	tile.setAttribute( 'role', 'listitem' );

	const image = document.createElement( 'img' );
	image.className = 'dg-picker__thumb';
	image.src = thumbnailFor( item );
	image.alt = '';
	image.loading = 'lazy';
	image.decoding = 'async';

	const caption = document.createElement( 'span' );
	caption.className = 'dg-picker__caption';
	caption.textContent = title;

	const { width, height } = item.media_details ?? {};

	tile.title =
		width && height
			? sprintf( '%s — %d × %d', title, width, height )
			: title;

	tile.addEventListener( 'click', () => onPick?.( item.id ) );
	tile.append( image, caption );

	return tile;
}
