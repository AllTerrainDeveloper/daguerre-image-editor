/**
 * Copy and paste.
 *
 * Both work on the composed document rather than the active layer: what you see is
 * what you get, which is the only interpretation that does not need explaining. A
 * paste comes back as a layer of its own, so it can still be moved, scaled and thrown
 * away afterwards.
 */

import { __ } from '../i18n';
import { createRasterLayer } from '../model/document';
import { clipToSelection, selectionBounds } from '../model/selection';
import type { Selection } from '../model/selection';
import { toast } from '../platform';
import type { RecipeStore } from './recipe-store';

/** What the clipboard needs from the renderer. */
export interface ClipboardPixels {
	extractRegion: (
		x: number,
		y: number,
		width: number,
		height: number
	) => HTMLCanvasElement | null;
	addRasterTexture: ( id: string, source: HTMLCanvasElement ) => void;
}

export interface ClipboardOptions {
	store: RecipeStore;
	/** Null until the renderer has started. */
	getPixels: () => ClipboardPixels | null;
	/** The current marquee, or null. */
	getSelection: () => Selection | null;
	/** Called after a paste, so the Transform tool can take the new layer. */
	onPaste: () => void;
}

/**
 * The editor's clipboard.
 *
 * Deliberately not the system clipboard: reading images out of it needs a permission
 * prompt and a secure context, and neither is guaranteed inside an admin iframe.
 */
export class EditorClipboard {
	private options: ClipboardOptions;

	/** Pixels lifted by the last copy. */
	private held: HTMLCanvasElement | null = null;

	/**
	 * @param options Clipboard configuration.
	 */
	constructor( options: ClipboardOptions ) {
		this.options = options;
	}

	/** Whether there is anything to paste. */
	get hasContent(): boolean {
		return null !== this.held;
	}

	/**
	 * Copies the selected region of the composed document.
	 */
	copy(): void {
		const { store } = this.options;
		const pixels = this.options.getPixels();
		const selection = this.options.getSelection();

		if ( ! selection || ! pixels ) {
			toast( __( 'Select an area first.' ), 'info' );

			return;
		}

		const canvas = store.current.canvas;
		const bounds = selectionBounds( selection );
		const origin = { x: bounds.x * canvas.width, y: bounds.y * canvas.height };

		const copied = pixels.extractRegion(
			origin.x,
			origin.y,
			bounds.w * canvas.width,
			bounds.h * canvas.height
		);

		if ( ! copied ) {
			toast( __( 'Nothing to copy.' ), 'error' );

			return;
		}

		// A texture can only be read as a rectangle, but an ellipse, a lasso and a
		// polygon are not rectangles -- so the lifted block is clipped back to the shape
		// that was actually drawn. Without this, copying a lasso gave its bounding box.
		clipToSelection( copied, selection, canvas, origin );

		this.held = copied;
		toast( __( 'Copied.' ), 'success' );
	}

	/**
	 * Pastes the held pixels as a new layer.
	 */
	paste(): void {
		const { store } = this.options;
		const pixels = this.options.getPixels();
		const source = this.held;

		if ( ! source || ! pixels ) {
			toast( __( 'Nothing to paste.' ), 'info' );

			return;
		}

		// Land it where it was copied from when that is still known, so a paste in
		// place looks like nothing happened rather than jumping to the middle.
		const selection = this.options.getSelection();
		const bounds = selection ? selectionBounds( selection ) : null;

		const layer = createRasterLayer( __( 'Pasted' ), {
			x: bounds ? bounds.x + bounds.w / 2 : 0.5,
			y: bounds ? bounds.y + bounds.h / 2 : 0.5,
		} );

		pixels.addRasterTexture( layer.id, source );
		store.setLayers( [ ...store.current.layers, layer ], layer.id );

		this.options.onPaste();
		toast( __( 'Pasted as a new layer.' ), 'success' );
	}
}
