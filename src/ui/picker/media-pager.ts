/**
 * Walking the media library a page at a time.
 *
 * `wp/v2/media` is already paginated and already permission-checked per user, so the
 * picker reads core's own route rather than a Lienzo one. It reports the page count in
 * `X-WP-TotalPages`, which is what tells the picker whether there is anything left to
 * offer.
 */

import { __ } from '../../i18n';
import { request } from '../../platform';
import type { LienzoConfig } from '../../types';
import { MEDIA_FIELDS, PAGE_SIZE } from './types';
import type { MediaItem } from './types';

/**
 * How many pages one `next()` will fetch while looking for something editable.
 *
 * The editable filter runs on the client -- `wp/v2/media` has no "one of these MIME
 * types" query, and the supported list is a plugin concern a server-side filter can
 * change at any time. So a page can come back full of images Lienzo cannot open, and
 * returning nothing would leave a Load more button that appears to do nothing. This
 * caps how long it will keep looking before handing control back.
 */
const MAX_LOOKAHEAD = 5;

/**
 * Reads the media library one page at a time.
 */
export class MediaPager {
	private config: LienzoConfig;

	/** Pages already fetched. */
	private page = 0;

	/** Total pages the server reports. Unknown until the first response. */
	private pages: number | null = null;

	/** Total editable images seen so far. */
	private seen = 0;

	/**
	 * @param config Runtime configuration.
	 */
	constructor( config: LienzoConfig ) {
		this.config = config;
	}

	/** Whether the server has pages the picker has not asked for yet. */
	get hasMore(): boolean {
		return null === this.pages || this.page < this.pages;
	}

	/** How many editable images have been handed out so far. */
	get count(): number {
		return this.seen;
	}

	/**
	 * Fetches the next page or pages, until something editable turns up.
	 *
	 * @return Editable items, which is empty only when the library ran out or the
	 *         lookahead cap was reached.
	 * @throws {Error} When the library could not be read.
	 */
	async next(): Promise< MediaItem[] > {
		for ( let look = 0; look < MAX_LOOKAHEAD && this.hasMore; look++ ) {
			const editable = await this.fetchPage( this.page + 1 );

			this.page++;

			if ( editable.length > 0 ) {
				this.seen += editable.length;

				return editable;
			}
		}

		return [];
	}

	/**
	 * Fetches one page and keeps only what Lienzo can open.
	 *
	 * @param page Page number, one-based.
	 * @throws {Error} When the library could not be read.
	 */
	private async fetchPage( page: number ): Promise< MediaItem[] > {
		const url = new URL( this.config.mediaUrl );

		url.searchParams.set( 'media_type', 'image' );
		url.searchParams.set( 'per_page', String( PAGE_SIZE ) );
		url.searchParams.set( 'page', String( page ) );
		url.searchParams.set( 'orderby', 'date' );
		url.searchParams.set( 'order', 'desc' );
		url.searchParams.set( '_fields', MEDIA_FIELDS );

		const response = await request( url.toString(), {
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': this.config.restNonce },
		} );

		if ( ! response.ok ) {
			throw new Error( __( 'Your media library could not be loaded.' ) );
		}

		// Recorded from every response rather than only the first: an upload during a
		// browsing session changes the count, and a stale total would either hide the
		// last page or offer one that no longer exists.
		const total = Number( response.headers.get( 'X-WP-TotalPages' ) );

		if ( Number.isFinite( total ) && total > 0 ) {
			this.pages = total;
		}

		const items = ( await response.json() ) as MediaItem[];

		return items.filter( ( item ) =>
			this.config.supportedMimes.includes( item.mime_type )
		);
	}
}
