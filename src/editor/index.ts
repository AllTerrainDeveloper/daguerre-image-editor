/**
 * The public mount API.
 *
 * There are five places the editor has to appear: the full-screen admin page, the
 * media modal, the block editor, a Desktop Mode native window, and eventually
 * anything a third party builds. Rather than five implementations, there is one
 * mountable editor and five thin adapters that call `mount()`. Nothing outside this
 * package touches Pixi, the recipe model or REST.
 */

import { Editor } from './editor';
import type { EditorInstance, MountOptions } from './types';

/**
 * Mounts the editor into an element.
 *
 * Returns synchronously with a usable handle; loading happens in the background
 * behind a progress state. That matters because the media modal and Desktop Mode
 * both want to place the editor before they know how long the image will take.
 *
 * @param element Element to fill. Its contents are replaced.
 * @param options Mount options.
 */
export function mount( element: HTMLElement, options: MountOptions ): EditorInstance {
	const editor = new Editor( element, options );

	void editor.boot();

	return editor;
}

export type { DroppedImage, EditorInstance, MountOptions } from './types';
export { RecipeStore } from './recipe-store';
export type { RecipeScope } from './recipe-store';
