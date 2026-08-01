/**
 * The slice of `wp/v2/media` the picker asks for.
 */

/** Shape of the fields requested from `wp/v2/media`. */
export interface MediaItem {
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

/** Only the fields listed here come back, which keeps the payload small. */
export const MEDIA_FIELDS = 'id,mime_type,title,source_url,media_details';

/**
 * How many thumbnails to fetch at a time.
 *
 * Enough to fill a screen, small enough that the first page arrives quickly. The
 * ceiling `wp/v2/media` will accept is 100.
 */
export const PAGE_SIZE = 60;
