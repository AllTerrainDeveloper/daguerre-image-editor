/**
 * On-canvas text editing.
 *
 * Typing into a field in the toolbar and then clicking to stamp the result is not how
 * anyone thinks about text: you cannot see it against the image, you cannot tell how
 * big it is, and every correction means going back up to the toolbar. So the caret
 * goes where the text goes.
 *
 * Clicking with the Text tool opens a transparent `<textarea>` sitting exactly where
 * the glyphs will land, styled with the same font, size and colour the render will
 * use, and scaled to the current zoom. What you type is what appears. Committing
 * rasterises it through the same `textCanvas()` the tool always used, so the editing
 * surface and the output cannot drift apart -- they share the measurement code.
 *
 * A textarea rather than a contenteditable div: it gives a native caret, native
 * selection, native undo within the field and plain text on paste, none of which are
 * worth reimplementing.
 */

import { cssFont } from '../engine/paint-shapes';
import type { CanvasSize } from '../model/document';

/** How the text is drawn. Mirrors the fields `textCanvas()` reads. */
export interface TextStyle {
	size: number;
	family: string;
	colour: string;
	bold: boolean;
	italic: boolean;
}

export interface TextEditorOptions {
	/** The canvas area the editor floats over. */
	stage: HTMLElement;
	/** Where the canvas sits inside the stage, in CSS pixels. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Canvas size in its own pixels. */
	getCanvas: () => CanvasSize;
	/** Current text style. */
	getStyle: () => TextStyle;
	/**
	 * Called when the text is finished.
	 *
	 * @param text  What was typed. Never empty.
	 * @param point Where the glyphs' top-left corner sits, in canvas pixels.
	 */
	onCommit: ( text: string, point: { x: number; y: number } ) => void;
	/** Called when editing starts or stops, so the toolbar can follow. */
	onStateChange?: () => void;
}

/**
 * A text caret on the canvas.
 */
export class TextEditor {
	private options: TextEditorOptions;

	private field: HTMLTextAreaElement | null = null;

	/** Where the text begins, in canvas pixels. */
	private anchor: { x: number; y: number } | null = null;

	constructor( options: TextEditorOptions ) {
		this.options = options;
	}

	/** Whether something is being typed right now. */
	get isEditing(): boolean {
		return this.field !== null;
	}

	/**
	 * What a press on the canvas means while the text tool is active.
	 *
	 * One press does one thing. Clicking away from a caret finishes the text and stops
	 * there -- it does not also start the next one, because "I am done writing this" and
	 * "here is where the next paragraph goes" are two different intentions and a single
	 * click cannot be both. Typing then clicking away would otherwise leave an empty
	 * caret sitting wherever you happened to click to get rid of the last one.
	 *
	 * Press again and, with nothing being typed, a new caret opens where you clicked.
	 *
	 * @param point Canvas coordinates for the top-left of the first line.
	 */
	place( point: { x: number; y: number } ): void {
		if ( this.isEditing ) {
			this.commit();

			return;
		}

		this.open( point );
	}

	/**
	 * Opens a caret at a point on the canvas.
	 *
	 * Anything already being typed is committed first, so no caller can end up with two
	 * carets open at once.
	 *
	 * @param point Canvas coordinates for the top-left of the first line.
	 */
	open( point: { x: number; y: number } ): void {
		this.commit();

		const field = document.createElement( 'textarea' );

		field.className = 'lz-text-editor';
		field.rows = 1;
		field.spellcheck = false;
		field.setAttribute( 'aria-label', 'Text' );

		// The stage listens for pointerdown to place text; without this, clicking into
		// what you are already typing would commit it and start again one character in.
		field.addEventListener( 'pointerdown', ( event ) => event.stopPropagation() );
		field.addEventListener( 'input', this.onInput );
		field.addEventListener( 'keydown', this.onKeyDown );
		// Clicking away is a commit, the same as it is in a spreadsheet cell.
		field.addEventListener( 'blur', () => this.commit() );

		this.anchor = point;
		this.field = field;
		this.options.stage.appendChild( field );

		this.restyle();
		field.focus();
		this.options.onStateChange?.();
	}

	/** Grows the field to fit what has been typed. */
	private onInput = (): void => {
		this.resize();
	};

	/**
	 * Handles the keys that finish or abandon the text.
	 *
	 * @param event Key event.
	 */
	private onKeyDown = ( event: KeyboardEvent ): void => {
		// Kept from reaching the editor's own shortcuts: a plain letter here is a
		// letter, not a tool switch, and Escape means "abandon this" rather than
		// "deselect".
		event.stopPropagation();

		if ( event.key === 'Escape' ) {
			event.preventDefault();
			this.cancel();

			return;
		}

		// Enter inserts a line break, because text is often more than one line. The
		// modifier commits, matching every other multi-line field in the admin.
		if ( event.key === 'Enter' && ( event.metaKey || event.ctrlKey ) ) {
			event.preventDefault();
			this.commit();
		}
	};

	/** Applies the current style and position to the field. */
	restyle = (): void => {
		const field = this.field;
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! field || ! this.anchor || ! viewport || canvas.width < 1 ) {
			return;
		}

		const style = this.options.getStyle();
		// Canvas pixels to screen pixels: the type size is defined against the image, so
		// the caret has to grow and shrink with the zoom or it would lie about the size.
		const scale = viewport.width / canvas.width;

		field.style.font = cssFont( {
			text: '',
			size: Math.max( 1, style.size * scale ),
			family: style.family,
			colour: style.colour,
			bold: style.bold,
			italic: style.italic,
		} );
		field.style.lineHeight = '1.25';
		field.style.color = style.colour;
		field.style.insetInlineStart = `${
			viewport.x + ( this.anchor.x / canvas.width ) * viewport.width
		}px`;
		field.style.insetBlockStart = `${
			viewport.y + ( this.anchor.y / canvas.height ) * viewport.height
		}px`;

		this.resize();
	};

	/** Sizes the field to its contents, in both directions. */
	private resize(): void {
		const field = this.field;

		if ( ! field ) {
			return;
		}

		// Measured rather than guessed: a textarea does not size itself, and a fixed
		// width would either clip long lines or leave a box far wider than the text.
		field.style.blockSize = 'auto';
		field.style.inlineSize = '0';
		field.style.inlineSize = `${ field.scrollWidth + 4 }px`;
		field.style.blockSize = `${ field.scrollHeight }px`;
	}

	/** Rasterises what was typed and closes the caret. */
	commit(): void {
		const field = this.field;
		const anchor = this.anchor;

		if ( ! field || ! anchor ) {
			return;
		}

		const text = field.value;

		this.close();

		if ( text.trim() ) {
			this.options.onCommit( text, anchor );
		}
	}

	/** Closes the caret, discarding what was typed. */
	cancel(): void {
		this.close();
	}

	/** Removes the field. */
	private close(): void {
		const field = this.field;

		this.field = null;
		this.anchor = null;

		// Removing a focused field fires blur, which calls commit() -- harmless, because
		// the field reference is already gone and commit() returns immediately.
		field?.remove();

		this.options.onStateChange?.();
	}

	/** Removes the editor entirely. */
	destroy(): void {
		this.close();
	}
}
