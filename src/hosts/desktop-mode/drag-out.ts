/**
 * Dragging a saved copy back out of the window.
 *
 * The other half of the desktop's drag bridge: once a render has been saved, the
 * banner announcing it becomes a drag source, so the result can be dropped straight
 * into a Gutenberg window.
 */

import { __ } from '../../i18n';
import type { SaveResult } from '../../types';
import { desktop } from './desktop-api';

/**
 * Makes the saved-copy banner draggable into other desktop windows.
 *
 * The point of a desktop metaphor is that a result is an object you can pick up. A
 * photo edited here should be draggable straight into a Gutenberg window, where the
 * shell's own drop receiver turns it into a `core/image` block.
 *
 * @param root   Editor root, which holds the banner.
 * @param result The attachment that was just created.
 */
export function attachDragOut( root: HTMLElement, result: SaveResult ): void {
	const bridge = desktop()?.dragBridge;

	if ( ! bridge?.start ) {
		return;
	}

	const banner = root.querySelector< HTMLElement >( '.lz-saved a' );

	if ( ! banner ) {
		return;
	}

	banner.draggable = true;
	banner.title = __( 'Drag into another window to insert it' );

	banner.addEventListener( 'dragstart', () => {
		bridge.start?.( {
			kind: 'attachment',
			id: result.id,
			url: result.url,
			title: __( 'Edited image' ),
			alt: '',
			mime: result.mime,
			thumbnailUrl: result.url,
		} );
	} );

	banner.addEventListener( 'dragend', () => bridge.end?.() );
}
