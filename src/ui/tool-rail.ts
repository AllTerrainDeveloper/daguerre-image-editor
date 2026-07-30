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

import { createIconButton, floatingHost, positionFloating } from './controls';
import type { IconButtonHandle } from './controls';
import { __ } from '../i18n';
import { Swatches } from './swatches';
import type { SwatchesOptions } from './swatches';
import type { ActiveTool } from './panels';

/** A tool's presentation. */
interface ToolDef {
	id: ActiveTool;
	glyph: string;
	label: string;
	/** Single-key shortcut, matching the convention users already have. */
	key: string;
	/** Which group the tool belongs to; a change draws a separator. */
	group: number;
}

/**
 * Every tool, in rail order.
 *
 * The glyphs are Unicode rather than an icon font: Dashicons has no marquee, no wand
 * and no dodge tool, and shipping an icon set for sixteen buttons would cost more
 * bytes than the entire tool implementation. Text-presentation symbols throughout, not
 * emoji -- a rail of grey glyphs with three colour pictures in it reads as a mistake.
 */
export const TOOLS: ToolDef[] = [
	{ id: 'transform', glyph: '✥', label: 'Move & transform', key: 'v', group: 1 },
	{ id: 'select', glyph: '⬚', label: 'Select', key: 'm', group: 1 },
	{ id: 'wand', glyph: '✧', label: 'Magic wand', key: 'w', group: 1 },
	{ id: 'crop', glyph: '⌗', label: 'Crop', key: 'c', group: 1 },

	{ id: 'eyedropper', glyph: '⌖', label: 'Eyedropper', key: 'i', group: 2 },
	{ id: 'retouch', glyph: '◌', label: 'Retouch', key: 'r', group: 2 },
	{ id: 'clone', glyph: '⎗', label: 'Clone stamp', key: 's', group: 2 },
	{ id: 'tone', glyph: '◐', label: 'Dodge & burn', key: 'o', group: 2 },

	{ id: 'brush', glyph: '✎', label: 'Brush', key: 'b', group: 3 },
	{ id: 'history', glyph: '↺', label: 'History brush', key: 'y', group: 3 },
	{ id: 'eraser', glyph: '◻', label: 'Eraser', key: 'e', group: 3 },
	{ id: 'fill', glyph: '◧', label: 'Fill', key: 'g', group: 3 },

	{ id: 'gradient', glyph: '▨', label: 'Gradient', key: 'n', group: 4 },
	{ id: 'shape', glyph: '▬', label: 'Shape', key: 'u', group: 4 },
	{ id: 'path', glyph: '✒', label: 'Path', key: 'p', group: 4 },
	{ id: 'text', glyph: 'T', label: 'Text', key: 't', group: 4 },

	{ id: 'hand', glyph: '☞', label: 'Hand', key: 'h', group: 5 },
	{ id: 'zoom', glyph: '⌕', label: 'Zoom', key: 'z', group: 5 },
];

export interface ToolRailOptions extends SwatchesOptions {
	/** Called when a tool is chosen. */
	onSelect: ( tool: ActiveTool ) => void;
	/** The tool currently active. */
	getActive: () => ActiveTool;
	/** Whether the selection is shown as a red overlay rather than as an outline. */
	getQuickMask: () => boolean;
	/** Turns the quick mask on or off. */
	setQuickMask: ( on: boolean ) => void;
	/** Whether the editor fills the screen. */
	getFullScreen: () => boolean;
	/** Fills the screen, or gives it back. */
	setFullScreen: ( on: boolean ) => void;
}

/**
 * A two-column strip of tool buttons, plus the colour swatches.
 */
export class ToolRail {
	public readonly el: HTMLElement;

	private buttons = new Map< ActiveTool, IconButtonHandle >();

	private swatches: Swatches;

	private overflow: IconButtonHandle;

	private quickMask: IconButtonHandle;

	private fullScreen: IconButtonHandle;

	/** The tool list, shown by the overflow button. */
	private menu: HTMLElement | null = null;

	private options: ToolRailOptions;

	private detach: Array< () => void > = [];

	private menuHandles: IconButtonHandle[] = [];

	private closeAway: ( () => void ) | null = null;

	constructor( options: ToolRailOptions ) {
		this.options = options;

		this.el = document.createElement( 'div' );
		this.el.className = 'lz-rail';

		const grid = document.createElement( 'div' );
		grid.className = 'lz-rail__grid';
		grid.setAttribute( 'role', 'toolbar' );
		grid.setAttribute( 'aria-orientation', 'vertical' );
		grid.setAttribute( 'aria-label', __( 'Tools' ) );

		let group = TOOLS[ 0 ]?.group;
		let inGroup = 0;

		for ( const tool of TOOLS ) {
			if ( tool.group !== group ) {
				// A group with an odd number of tools would leave the next group starting
				// in the second column, and every later separator half a row out of
				// place. One empty cell keeps the columns honest however the tool list is
				// later edited, which is better than relying on every group staying even.
				if ( inGroup % 2 === 1 ) {
					const spacer = document.createElement( 'span' );

					spacer.className = 'lz-rail__spacer';
					spacer.setAttribute( 'aria-hidden', 'true' );
					grid.appendChild( spacer );
				}

				const rule = document.createElement( 'span' );

				rule.className = 'lz-rail__rule';
				rule.setAttribute( 'aria-hidden', 'true' );
				grid.appendChild( rule );
				group = tool.group;
				inGroup = 0;
			}

			inGroup++;

			// From the kit, so the rail is built from Desktop Mode's buttons when they
			// are registered rather than from something that merely resembles them.
			const button = createIconButton( {
				glyph: tool.glyph,
				label: `${ __( tool.label ) } (${ tool.key.toUpperCase() })`,
				className: 'lz-rail__button',
				onClick: () => options.onSelect( tool.id ),
			} );

			button.el.setAttribute( 'aria-pressed', 'false' );
			this.buttons.set( tool.id, button );
			grid.appendChild( button.el );
		}

		// The overflow: sixteen glyphs are quick to click and slow to learn, so the
		// same list is also available by name.
		this.overflow = createIconButton( {
			glyph: '⋯',
			label: __( 'All tools' ),
			className: 'lz-rail__button',
			onClick: () => this.toggleMenu(),
		} );

		grid.appendChild( this.overflow.el );

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

		this.el.append( grid, this.swatches.el, modes );

		// Single-key shortcuts, but never while typing -- otherwise naming a preset
		// would silently switch tools halfway through the word.
		const onKey = ( event: KeyboardEvent ) => {
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				isTypingTarget( event.target )
			) {
				return;
			}

			const key = event.key.toLowerCase();

			// X and D are the colour shortcuts every editor shares, and they belong here
			// rather than in the swatches because this is where key handling already is.
			if ( key === 'x' ) {
				event.preventDefault();
				this.swatches.swap();

				return;
			}

			if ( key === 'd' ) {
				event.preventDefault();
				this.swatches.reset();

				return;
			}

			if ( key === 'q' ) {
				event.preventDefault();
				options.setQuickMask( ! options.getQuickMask() );
				this.syncModes();

				return;
			}

			if ( key === 'f' ) {
				event.preventDefault();
				options.setFullScreen( ! options.getFullScreen() );
				this.syncModes();

				return;
			}

			const match = TOOLS.find( ( tool ) => tool.key === key );

			if ( match ) {
				event.preventDefault();
				options.onSelect( match.id );
			}
		};

		document.addEventListener( 'keydown', onKey );
		this.detach.push( () => document.removeEventListener( 'keydown', onKey ) );

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

	/**
	 * Shows or hides the named tool list.
	 *
	 * A plain list rather than Desktop Mode's `wpd-menu`: this has to work identically
	 * with the shell absent, and a menu is the one control where a half-registered
	 * component would leave the user with nothing clickable.
	 */
	private toggleMenu(): void {
		if ( this.menu ) {
			this.closeMenu();

			return;
		}

		const menu = document.createElement( 'div' );
		menu.className = 'lz-rail-menu';
		menu.setAttribute( 'role', 'menu' );
		menu.setAttribute( 'aria-label', __( 'All tools' ) );

		const handles: IconButtonHandle[] = [];

		for ( const tool of TOOLS ) {
			const item = document.createElement( 'button' );

			item.type = 'button';
			item.className = 'lz-rail-menu__item';
			item.setAttribute( 'role', 'menuitem' );
			item.innerHTML = '';

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
				this.closeMenu();
			} );

			menu.appendChild( item );
		}

		// Attached to the editor root rather than beside the button: the rail scrolls,
		// and a scroll container clips a popover that reaches outside it. The editor
		// root is as far out as it can go while still inheriting the palette.
		floatingHost( this.el ).appendChild( menu );
		positionFloating( menu, this.overflow.el, 'inline-end' );

		this.menu = menu;
		this.menuHandles = handles;

		const onAway = ( event: MouseEvent ) => {
			if (
				event.target instanceof Node &&
				! menu.contains( event.target ) &&
				! this.overflow.el.contains( event.target )
			) {
				this.closeMenu();
			}
		};

		// Deferred, or the click that opened the menu closes it again.
		window.setTimeout( () => document.addEventListener( 'click', onAway ), 0 );
		this.closeAway = () => document.removeEventListener( 'click', onAway );
	}

	/** Removes the tool list. */
	private closeMenu(): void {
		this.closeAway?.();
		this.closeAway = null;

		for ( const handle of this.menuHandles ) {
			handle.destroy();
		}

		this.menuHandles = [];
		this.menu?.remove();
		this.menu = null;
	}

	/** Removes the rail and its shortcuts. */
	destroy(): void {
		for ( const off of this.detach ) {
			off();
		}

		this.detach = [];
		this.closeMenu();

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

/**
 * Whether an event target is somewhere the user is typing.
 *
 * @param target Event target.
 */
function isTypingTarget( target: EventTarget | null ): boolean {
	if ( ! ( target instanceof HTMLElement ) ) {
		return false;
	}

	return (
		target.isContentEditable ||
		[ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( target.tagName ) ||
		// A Desktop Mode control is a custom element wrapping its own input, so the
		// tag test alone would let a keystroke inside one switch tools.
		target.tagName.startsWith( 'WPD-' ) ||
		target.closest( '[ contenteditable="true" ]' ) !== null
	);
}
