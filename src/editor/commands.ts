/**
 * The editor's verbs.
 *
 * Undo, redo, reset, add a layer, save. Each is a small piece of coordination between
 * two or three collaborators rather than a method on any one of them -- undo has to
 * put pixels back *and* move the history, and neither the store nor the recorder can
 * do that alone.
 */

import { __, sprintf } from '../i18n';
import { createRasterLayer } from '../model/document';
import { toast } from '../platform';
import type { PostOrigin } from '../types';
import { openInDesktop } from '../hosts/desktop-mode';
import { announceSave } from './save-banner';
import { askSaveChoice } from './save-choice';
import type { Editor } from './editor';

/**
 * Steps back one edit.
 *
 * A stroke's pixels are restored *before* the recipe moves, because the patch
 * describes the layer as it stood in the entry being left behind.
 *
 * @param editor The editor.
 */
export function undo( editor: Editor ): void {
	if ( ! editor.store.canUndo ) {
		return;
	}

	editor.strokes?.restore();
	editor.store.undo( 'all' );
}

/**
 * Steps forward one edit.
 *
 * @param editor The editor.
 */
export function redo( editor: Editor ): void {
	if ( ! editor.store.canRedo ) {
		return;
	}

	editor.store.redo( 'all' );
	editor.strokes?.restore();
}

/**
 * Returns every adjustment to zero.
 *
 * @param editor The editor.
 */
export function resetAll( editor: Editor ): void {
	if ( editor.store.reset( editor.renderer?.imageSize ) ) {
		toast( __( 'Adjustments reset.' ), 'info' );
	}
}

/**
 * Adds an empty raster layer above the active one.
 *
 * @param editor The editor.
 */
export function addLayer( editor: Editor ): void {
	const recipe = editor.store.current;
	const layer = createRasterLayer(
		/* translators: %d: layer number. */
		sprintf( __( 'Layer %d' ), recipe.layers.length )
	);

	const index = recipe.layers.findIndex(
		( entry ) => entry.id === recipe.activeLayerId
	);
	const layers = [ ...recipe.layers ];

	layers.splice( index + 1, 0, layer );

	editor.renderer?.paint.ensurePaintTexture( layer.id );
	editor.store.setLayers( layers, layer.id );
}

/**
 * Saves the edit as a new attachment, and offers a link to it.
 *
 * @param editor The editor.
 */
export async function save( editor: Editor ): Promise< void > {
	const origin = editor.options.origin;

	// Asked before the render, not after. A full-resolution render of a large photo
	// takes seconds, and spending them on work the user is about to cancel is the
	// difference between a dialog that feels like a question and one that feels like
	// a delay.
	const choice =
		origin && origin.canAttach
			? await askSaveChoice( editor.shell.root, origin )
			: 'copy';

	if ( 'cancel' === choice ) {
		return;
	}

	const result = await editor.output.save();

	if ( ! result ) {
		return;
	}

	if ( 'attach' === choice && origin ) {
		await attachResult( editor, origin, result.id );
	}

	editor.onTeardown(
		announceSave( editor.shell.sidebar, result, () => openInDesktop( result.id ) )
	);
	editor.options.onSave?.( result );
}

/**
 * Points the post at the copy that was just written.
 *
 * A failure here is reported but not fatal: the copy exists either way, so the user
 * has lost nothing except the repoint -- and telling them the save failed when the
 * image is sitting in their library would be worse than telling them what actually
 * went wrong.
 *
 * @param editor The editor.
 * @param origin The post the image came from.
 * @param saved  Attachment that was just written.
 */
async function attachResult(
	editor: Editor,
	origin: PostOrigin,
	saved: number
): Promise< void > {
	try {
		await editor.client.attachToPost(
			origin.postId,
			saved,
			origin.slot || 'thumbnail',
			editor.options.attachmentId
		);

		toast(
			sprintf(
				/* translators: %s: post title. */
				__( '“%s” now uses the edited image.' ),
				origin.postTitle
			),
			'success'
		);
	} catch ( error ) {
		toast(
			error instanceof Error
				? error.message
				: __( 'The copy was saved, but the post could not be updated.' ),
			'error'
		);
	}
}
