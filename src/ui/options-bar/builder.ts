/**
 * The bar as the per-tool renderers see it.
 *
 * Each renderer is handed one of these and appends to it. That is what lets them be
 * plain functions in files of their own: they never touch the element, the teardown
 * list or the sync list directly, so none of them can leave a listener behind.
 *
 * The fields that appear on more than one tool live in `fields.ts`, written against
 * this same surface.
 */

import type { BrushSettings } from '../stage-tools';
import type { Field, OptionsBarOptions } from './types';

/**
 * Collects the controls that make up one rendering of the bar.
 */
export class OptionsBuilder {
	readonly options: OptionsBarOptions;

	private el: HTMLElement;

	/** Live controls, so a rebuild can release their listeners first. */
	private fields: Field[] = [];

	/**
	 * Value updaters for the controls currently on the bar.
	 *
	 * A setting changed elsewhere -- the sidebar brush panel, or the eyedropper
	 * sampling a colour -- updates the control in place through these. Rebuilding the
	 * bar instead would be simpler and wrong: it destroys the element the user is
	 * typing into, so the text tool would lose focus and the caret after every
	 * keystroke.
	 */
	private syncers: Array< () => void > = [];

	private rerender: () => void;

	/**
	 * @param el       Element to append to.
	 * @param options  Bar configuration.
	 * @param rerender Rebuilds the whole bar, for a setting that changes which
	 *                 controls exist at all.
	 */
	constructor(
		el: HTMLElement,
		options: OptionsBarOptions,
		rerender: () => void
	) {
		this.el = el;
		this.options = options;
		this.rerender = rerender;
	}

	/** The shared brush settings. */
	get brush(): BrushSettings {
		return this.options.ctx.getBrush();
	}

	/**
	 * Changes a brush setting.
	 *
	 * @param patch    Fields to change.
	 * @param rebuild  Whether the change alters which controls belong on the bar.
	 */
	setBrush( patch: Partial< BrushSettings >, rebuild = false ): void {
		this.options.ctx.setBrush( patch );

		if ( rebuild ) {
			this.rerender();
		}
	}

	/** Rebuilds the bar from scratch. */
	rebuild(): void {
		this.rerender();
	}

	/**
	 * Adds a control and remembers it for teardown.
	 *
	 * @param handle The control.
	 * @param sync   Optional. Pushes the current setting into it.
	 */
	add( handle: Field, sync?: () => void ): void {
		this.fields.push( handle );

		if ( sync ) {
			this.syncers.push( sync );
		}

		this.el.appendChild( handle.el );
	}

	/** A separator between groups of controls. */
	divider(): void {
		const rule = document.createElement( 'span' );

		rule.className = 'lz-options__divider';
		rule.setAttribute( 'aria-hidden', 'true' );
		this.el.appendChild( rule );
	}

	/**
	 * Appends a muted hint.
	 *
	 * @param text Guidance text. An empty string appends nothing.
	 */
	hint( text: string ): void {
		if ( ! text ) {
			return;
		}

		const hint = document.createElement( 'span' );

		hint.className = 'lz-options__hint';
		hint.textContent = text;
		this.el.appendChild( hint );
	}

	/** Pushes the current settings into the controls on the bar. */
	sync(): void {
		for ( const syncer of this.syncers ) {
			syncer();
		}
	}

	/** Releases every control and forgets them. */
	release(): void {
		for ( const field of this.fields ) {
			field.destroy();
		}

		this.fields = [];
		this.syncers = [];
	}
}
