/**
 * The mount API's public types.
 */

import type { Recipe } from '../model/recipe';
import type { MediaPayload, PostOrigin, SaveResult } from '../types';
import type { DroppedImage } from './image-source';

export interface MountOptions {
	/** Attachment to open. */
	attachmentId: number;
	/** Which surface is hosting the editor. Affects chrome only, never the engine. */
	host?: 'page' | 'modal' | 'window';
	/**
	 * The post this image was opened from, when it was opened from one.
	 *
	 * Present when a product -- or any post with a picture -- was dropped onto the
	 * icon. Saving then offers to point that post at the edit, which is the whole
	 * reason the drop skips the picker.
	 */
	origin?: PostOrigin;
	/** Called when the user asks to leave. */
	onClose?: () => void;
	/** Called after a successful save, with the attachment that was created. */
	onSave?: ( result: SaveResult ) => void;
	/**
	 * Called once the editor has finished loading, successfully or not.
	 *
	 * `mount()` returns immediately and loads in the background, so a host with its
	 * own loading state -- a Desktop Mode window, which covers its body with a spinner
	 * until it is told otherwise -- has no other way to know when to stop waiting.
	 * Fired on failure too: a window that failed to open an image is finished loading,
	 * and leaving the spinner up would claim otherwise.
	 */
	onReady?: ( payload: MediaPayload | null ) => void;
}

export interface EditorInstance {
	/** Releases the canvas, the GPU resources and every listener. */
	destroy: () => void;
	/**
	 * Adds an image to the document as a new layer.
	 *
	 * The drop-to-add path: the image lands where it was released, scaled to sit
	 * inside the canvas, as an object the Transform tool can move like any other.
	 *
	 * @return True when a layer was added.
	 */
	addImageLayer: ( dropped: DroppedImage ) => Promise< boolean >;
	/** Renderer internals, for diagnosing render problems. */
	debug: () => Record< string, unknown >;
	/** The edit as it currently stands. */
	getRecipe: () => Recipe;
	/** Replaces the edit and re-renders. */
	setRecipe: ( recipe: Recipe ) => void;
}

export type { DroppedImage };
