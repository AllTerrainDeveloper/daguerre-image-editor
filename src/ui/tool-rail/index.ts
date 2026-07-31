/**
 * The tool rail.
 *
 * Two columns on the leading edge holding one button per tool, in the manner of every
 * raster editor since the 1990s -- two rather than one because sixteen tools in a
 * single column is taller than most browser windows, and a tool you have to scroll to
 * is a tool you stop using.
 *
 * Exactly one tool is active, because they all want the same pointer events on the
 * same stage. Tools are grouped by what they do to the image, with a hairline between
 * groups, so the rail can be read as five short lists rather than one long one.
 *
 * Beneath the buttons sit the foreground and background swatches -- the one piece of
 * shared state almost every tool reads.
 */

import { createIconButton } from '../controls';
import type { IconButtonHandle } from '../controls';
import { __ } from '../../i18n';
import { Swatches } from '../swatches';
import type { ActiveTool } from '../panels';
import { buildToolGrid } from './grid';
import { ToolMenu } from './menu';
import { attachToolShortcuts } from './shortcuts';
import type { ToolRailOptions } from './types';

export type { ToolRailOptions } from './types';

/**
 * A two-column strip of tool buttons, plus the colour swatches.
 */
export class ToolRail {
	public readonly el: HTMLElement;

	private buttons: Map< ActiveTool, IconButtonHandle >;

	private swatches: Swatches;

	private overflow: IconButtonHandle;

	private quickMask: IconButtonHandle;

	private fullScreen: IconButtonHandle;

	/** The tool list, shown by the overflow button. */
	private options: ToolRailOptions;

	private menu: ToolMenu;

	private detach: Array< () => void > = [];

	constructor( options: ToolRailOptions ) {
		this.options = options;

		this.el = document.createElement( 'div' );
		this.el.className = 'lz-rail';

		const grid = buildToolGrid( options.onSelect );

		this.buttons = grid.buttons;

		// The overflow: sixteen glyphs are quick to click and slow to learn, so the
		// same list is also available by name.
		this.overflow = createIconButton( {
			glyph: '⋯',
			label: __( 'All tools' ),
			className: 'lz-rail__button',
			onClick: () => this.menu.toggle(),
		} );

		grid.el.appendChild( this.overflow.el );

		this.menu = new ToolMenu( {
			anchor: this.overflow.el,
			within: this.el,
			onSelect: options.onSelect,
		} );

		this.swatches = new Swatches( options );

		this.quickMask = createIconButton( {
			glyph: '◍',
			label: __( 'Quick mask: show the selection as a red overlay (Q)' ),
			className: 'lz-rail__mode',
			onClick: () => {
				options.setQuickMask( ! options.getQuickMask() );
				this.syncModes();
			},
		} );

		this.fullScreen = createIconButton( {
			glyph: '⛶',
			label: __( 'Full screen (F)' ),
			className: 'lz-rail__mode',
			onClick: () => {
				options.setFullScreen( ! options.getFullScreen() );
				this.syncModes();
			},
		} );

		const modes = document.createElement( 'div' );
		modes.className = 'lz-rail__modes';
		modes.setAttribute( 'role', 'group' );
		modes.setAttribute( 'aria-label', __( 'Screen modes' ) );
		modes.append( this.quickMask.el, this.fullScreen.el );

		this.el.append( grid.el, this.swatches.el, modes );

		this.detach.push(
			attachToolShortcuts( options, this.swatches, () => this.syncModes() )
		);

		this.sync( options.getActive() );
	}

	/**
	 * Marks the active tool.
	 *
	 * @param active Tool now in use.
	 */
	sync( active: ActiveTool ): void {
		for ( const [ id, button ] of this.buttons ) {
			button.setPressed( id === active );
		}

		this.swatches.sync();
		this.syncModes();
	}

	/** Marks the quick-mask and full-screen toggles. */
	private syncModes(): void {
		this.quickMask.setPressed( this.options.getQuickMask() );
		this.fullScreen.setPressed( this.options.getFullScreen() );
	}

	/** Removes the rail and its shortcuts. */
	destroy(): void {
		for ( const off of this.detach ) {
			off();
		}

		this.detach = [];
		this.menu.close();

		for ( const button of this.buttons.values() ) {
			button.destroy();
		}

		this.buttons.clear();
		this.overflow.destroy();
		this.quickMask.destroy();
		this.fullScreen.destroy();
		this.swatches.destroy();
		this.el.remove();
	}
}
