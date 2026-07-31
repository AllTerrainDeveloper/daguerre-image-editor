/**
 * The named tool list behind the overflow button.
 *
 * Sixteen glyphs are quick to click and slow to learn, so the same list is also
 * available by name. A plain list rather than Desktop Mode's `wpd-menu`: this has to
 * work identically with the shell absent, and a menu is the one control where a
 * half-registered component would leave the user with nothing clickable.
 */

import { floatingHost, positionFloating } from '../controls';
import { __ } from '../../i18n';
import type { ActiveTool } from '../panels';
import { TOOLS } from './tools';

export interface ToolMenuOptions {
	/** Button the menu hangs off. */
	anchor: HTMLElement;
	/** Element whose editor root the menu is parented to. */
	within: HTMLElement;
	/** Called when a tool is chosen. */
	onSelect: ( tool: ActiveTool ) => void;
}

/**
 * The overflow menu, opened and closed on demand.
 */
export class ToolMenu {
	private options: ToolMenuOptions;

	private el: HTMLElement | null = null;

	private detachAway: ( () => void ) | null = null;

	/**
	 * @param options Menu configuration.
	 */
	constructor( options: ToolMenuOptions ) {
		this.options = options;
	}

	/** Shows the list, or hides it if it is already up. */
	toggle(): void {
		if ( this.el ) {
			this.close();

			return;
		}

		this.open();
	}

	/** Builds and places the list. */
	private open(): void {
		const menu = document.createElement( 'div' );

		menu.className = 'lz-rail-menu';
		menu.setAttribute( 'role', 'menu' );
		menu.setAttribute( 'aria-label', __( 'All tools' ) );

		for ( const tool of TOOLS ) {
			const item = document.createElement( 'button' );

			item.type = 'button';
			item.className = 'lz-rail-menu__item';
			item.setAttribute( 'role', 'menuitem' );

			const glyph = document.createElement( 'span' );
			glyph.className = 'lz-rail-menu__glyph';
			glyph.textContent = tool.glyph;

			const name = document.createElement( 'span' );
			name.textContent = __( tool.label );

			const key = document.createElement( 'kbd' );
			key.textContent = tool.key.toUpperCase();

			item.append( glyph, name, key );
			item.addEventListener( 'click', () => {
				this.options.onSelect( tool.id );
				this.close();
			} );

			menu.appendChild( item );
		}

		// Attached to the editor root rather than beside the button: the rail scrolls,
		// and a scroll container clips a popover that reaches outside it. The editor
		// root is as far out as it can go while still inheriting the palette.
		floatingHost( this.options.within ).appendChild( menu );
		positionFloating( menu, this.options.anchor, 'inline-end' );

		this.el = menu;
		this.watchForClickAway( menu );
	}

	/**
	 * Closes the menu when the next click lands outside it.
	 *
	 * @param menu The open menu.
	 */
	private watchForClickAway( menu: HTMLElement ): void {
		const onAway = ( event: MouseEvent ) => {
			if (
				event.target instanceof Node &&
				! menu.contains( event.target ) &&
				! this.options.anchor.contains( event.target )
			) {
				this.close();
			}
		};

		// Deferred, or the click that opened the menu closes it again.
		window.setTimeout( () => document.addEventListener( 'click', onAway ), 0 );
		this.detachAway = () => document.removeEventListener( 'click', onAway );
	}

	/** Removes the tool list. */
	close(): void {
		this.detachAway?.();
		this.detachAway = null;
		this.el?.remove();
		this.el = null;
	}
}
