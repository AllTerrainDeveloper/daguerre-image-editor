/**
 * Dropping something onto the Lienzo icon.
 *
 * Drag a photo -- or a product, or any post with a picture -- onto the wallpaper icon
 * and it opens straight in the editor. That is the whole point: someone who already
 * knows which image they want should not have to open an empty editor and then find
 * it again in a grid of four thousand.
 *
 * The shell owns the actual drop target on every tile, because a tile has to reject
 * foreign payloads rather than let them fall through to the wallpaper underneath.
 * Registering a target on the icon directly is silently displaced. Instead the shell
 * consults a handler registry for its accept predicate, its hover chip and its drop --
 * which is what this registers into.
 */

import { __ } from '../../i18n';
import { desktop, state, WINDOW_ID } from './desktop-api';
import type { TilePayloadContext } from './desktop-api';
import { openInDesktop, openPostInDesktop } from './open-window';

/** Payload types worth accepting. Anything else keeps the shell's rejection. */
const ACCEPTED = [ 'attachment', 'shortcut' ];

/**
 * Whether a tile is ours.
 *
 * Deliberately narrow. Handlers sharing a payload type resolve first-applies-wins, so
 * one that matched every placement would shadow every handler registered after it --
 * including other plugins' icons.
 *
 * @param ctx The tile under the cursor.
 */
function isLienzoIcon( ctx: TilePayloadContext ): boolean {
	return WINDOW_ID === ctx.placement?.file?.ref;
}

/**
 * An attachment id out of a drag payload, when it carries one.
 *
 * Media tiles drag as `attachment` with the id in `ref`; a media entity dragged from
 * the site window arrives as a `shortcut` whose `kind` says what the `ref` means. Both
 * spellings are read rather than assumed, because the shape depends on the source and
 * guessing wrong is a drop that silently does nothing.
 *
 * @param data Payload data.
 */
export function attachmentFrom( data: Record< string, unknown > ): number {
	const kind = String( data.kind ?? '' );

	if ( '' !== kind && 'attachment' !== kind && 'media' !== kind ) {
		return 0;
	}

	return Number( data.ref ?? data.id ?? data.mediaId ?? 0 ) || 0;
}

/**
 * A post id out of a drag payload, when it carries one.
 *
 * Every post type drags as `kind: 'post'` -- a product, a page and a post are one
 * file type as far as the desktop is concerned -- so which one it is does not matter
 * here. The server decides whether that post has an image worth opening.
 *
 * @param data Payload data.
 */
export function postFrom( data: Record< string, unknown > ): number {
	if ( 'post' !== String( data.kind ?? '' ) ) {
		return 0;
	}

	return Number( data.ref ?? data.id ?? 0 ) || 0;
}

/**
 * Opens whatever was dropped.
 *
 * @param data Payload data.
 */
function openDropped( data: Record< string, unknown > ): void {
	const attachment = attachmentFrom( data );

	if ( attachment ) {
		openInDesktop( attachment );

		return;
	}

	const post = postFrom( data );

	if ( post ) {
		void openPostInDesktop( post );
	}
}

/**
 * Lets the Lienzo icon accept photos and posts.
 *
 * Idempotent: registering twice would put two handlers on the same tile for the same
 * payload type, and the first would win every time while the second leaked.
 */
export function registerIconDrop(): void {
	const files = desktop()?.files;
	const shared = state();

	if ( ! files?.registerTilePayloadHandler || shared.iconDropRegistered ) {
		return;
	}

	shared.iconDropRegistered = true;

	const handler = {
		appliesTo: isLienzoIcon,
		accept: ( data: Record< string, unknown > ) =>
			!! ( attachmentFrom( data ) || postFrom( data ) ),
		acceptLabel: __( 'Open in Lienzo' ),
		onDrop: ( session: { payload: { data?: Record< string, unknown > } } ) =>
			openDropped( session.payload.data ?? {} ),
	};

	for ( const type of ACCEPTED ) {
		files.registerTilePayloadHandler( type, handler );
	}
}
