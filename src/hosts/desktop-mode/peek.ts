/**
 * The wallpaper thumbnail.
 *
 * Desktop Mode asks registered filters what a file should look like when peeked at on
 * the desktop; this answers for images by handing back the attachment's own thumbnail.
 */

import { state, WINDOW_ID } from './desktop-api';

/**
 * Shows the photo being edited on the dock's hover-peek card.
 *
 * The peek exists to answer "which one is this?" without focusing the window, and for
 * a photo editor the only answer worth giving is the photo. Desktop Mode's default
 * card shows a tinted placeholder body, so the filter swaps in the image's own
 * thumbnail -- which is already downloaded and cached by the media library, so the
 * peek costs nothing to draw.
 */
export function registerPeekThumbnail(): void {
	const hooks = ( window as unknown as {
		wp?: { hooks?: { addFilter?: ( ...args: unknown[] ) => void } };
	} ).wp?.hooks;

	if ( ! hooks?.addFilter || state().peekRegistered ) {
		return;
	}

	state().peekRegistered = true;

	hooks.addFilter(
		'desktop-mode.dock.peek-card-content',
		'lienzo/thumbnail',
		( body: unknown, context: unknown ) => {
			const win = ( context as { window?: { id?: string } } | undefined )
				?.window;

			// Only our own cards, and only once an image is actually open.
			const shared = state();

			if ( ! win?.id?.startsWith( WINDOW_ID ) || ! shared.previewUrl ) {
				return body;
			}

			const image = document.createElement( 'img' );

			image.className = 'lz-peek-thumb';
			image.src = shared.previewUrl;
			image.alt = shared.previewTitle;
			image.loading = 'lazy';
			image.decoding = 'async';

			return image;
		}
	);
}
