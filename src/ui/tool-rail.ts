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
	{ id: 'eraser', glyph: '◻', label: 'Eraser', key: 'e', group: 3 },
	{ id: 'fill', glyph: '◧', label: 'Fill', key: 'g', group: 3 },
	{ id: 'gradient', glyph: '▨', label: 'Gradient', key: 'n', group: 3 },

	{ id: 'shape', glyph: '▬', label: 'Shape', key: 'u', group: 4 },
	{ id: 'text', glyph: 'T', label: 'Text', key: 't', group: 4 },

	{ id: 'hand', glyph: '☞', label: 'Hand', key: 'h', group: 5 },
	{ id: 'zoom', glyph: '⌕', label: 'Zoom', key: 'z', group: 5 },
];

export interface ToolRailOptions extends SwatchesOptions {
	/** Called when a tool is chosen. */
	onSelect: ( tool: ActiveTool ) => void;
	/** The tool currently active. */
	getActive: () => ActiveTool;
}

/**
 * A two-column strip of tool buttons, plus the colour swatches.
 */
export class ToolRail {
	public readonly el: HTMLElement;

	private buttons = new Map< ActiveTool, HTMLButtonElement >();

	private swatches: Swatches;

	private detach: Array< () => void > = [];

	constructor( options: ToolRailOptions ) {
		this.el = document.createElement( 'div' );
		this.el.className = 'dg-rail';

		const grid = document.createElement( 'div' );
		grid.className = 'dg-rail__grid';
		grid.setAttribute( 'role', 'toolbar' );
		grid.setAttribute( 'aria-orientation', 'vertical' );
		grid.setAttribute( 'aria-label', __( 'Tools' ) );

		let group = TOOLS[ 0 ]?.group;

		for ( const tool of TOOLS ) {
			if ( tool.group !== group ) {
				const rule = document.createElement( 'span' );

				rule.className = 'dg-rail__rule';
				rule.setAttribute( 'aria-hidden', 'true' );
				grid.appendChild( rule );
				group = tool.group;
			}

			const button = document.createElement( 'button' );

			button.type = 'button';
			button.className = 'dg-rail__button';
			button.textContent = tool.glyph;
			button.title = `${ __( tool.label ) } (${ tool.key.toUpperCase() })`;
			button.setAttribute( 'aria-label', __( tool.label ) );
			button.setAttribute( 'aria-pressed', 'false' );
			button.addEventListener( 'click', () => options.onSelect( tool.id ) );

			this.buttons.set( tool.id, button );
			grid.appendChild( button );
		}

		this.swatches = new Swatches( options );
		this.el.append( grid, this.swatches.el );

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
			const on = id === active;

			button.classList.toggle( 'is-active', on );
			button.setAttribute( 'aria-pressed', String( on ) );
		}

		this.swatches.sync();
	}

	/** Removes the rail and its shortcuts. */
	destroy(): void {
		for ( const off of this.detach ) {
			off();
		}

		this.detach = [];
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
