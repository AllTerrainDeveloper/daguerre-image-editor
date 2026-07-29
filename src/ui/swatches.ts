/**
 * The foreground and background colour swatches.
 *
 * Two overlapping squares at the foot of the tool rail, with a swap arrow and a reset
 * to black-on-white -- the arrangement every raster editor has used for thirty years,
 * because almost every tool reads one of these two colours and they need to be visible
 * without opening anything.
 *
 * Clicking a swatch opens a popover holding the adaptive colour field, so the picker is
 * a Desktop Mode control when Desktop Mode is present, plus a palette of the shades
 * people actually reach for. A bare `<input type="color">` in the rail would be a
 * 56px-wide native dialog trigger and nothing else.
 */

import { createButton, createColourField } from './controls';
import { __ } from '../i18n';

export interface SwatchesOptions {
	/** Reads the current pair. */
	getColours: () => { colour: string; background: string };
	/** Writes either or both. */
	setColours: ( patch: { colour?: string; background?: string } ) => void;
	/** Subscribes to changes made elsewhere -- the eyedropper, mostly. */
	onColoursChange: ( listener: () => void ) => () => void;
}

/** What the reset button restores. */
const DEFAULT_FOREGROUND = '#000000';
const DEFAULT_BACKGROUND = '#ffffff';

/**
 * A short palette, offered alongside the picker.
 *
 * Greys plus one saturated step per hue: enough to work with, few enough to stay two
 * rows tall in a narrow rail.
 */
const PALETTE = [
	'#000000',
	'#404040',
	'#808080',
	'#c0c0c0',
	'#ffffff',
	'#d63638',
	'#e06d1f',
	'#dba617',
	'#00a32a',
	'#2271b1',
	'#3858e9',
	'#8c1eb0',
];

/**
 * The swatch pair.
 */
export class Swatches {
	public readonly el: HTMLElement;

	private options: SwatchesOptions;

	private foreground: HTMLButtonElement;

	private background: HTMLButtonElement;

	private popover: HTMLElement | null = null;

	private release: Array< () => void > = [];

	private off: () => void;

	constructor( options: SwatchesOptions ) {
		this.options = options;

		this.el = document.createElement( 'div' );
		this.el.className = 'dg-swatches';

		this.foreground = this.makeSwatch( 'colour', __( 'Foreground colour' ) );
		this.background = this.makeSwatch( 'background', __( 'Background colour' ) );

		const swap = document.createElement( 'button' );
		swap.type = 'button';
		swap.className = 'dg-swatches__action dg-swatches__swap';
		swap.textContent = '⇄';
		swap.title = __( 'Swap colours (X)' );
		swap.setAttribute( 'aria-label', __( 'Swap colours' ) );
		swap.addEventListener( 'click', () => this.swap() );

		const reset = document.createElement( 'button' );
		reset.type = 'button';
		reset.className = 'dg-swatches__action dg-swatches__reset';
		reset.textContent = '◨';
		reset.title = __( 'Reset to black and white (D)' );
		reset.setAttribute( 'aria-label', __( 'Reset colours' ) );
		reset.addEventListener( 'click', () => this.reset() );

		const stack = document.createElement( 'div' );
		stack.className = 'dg-swatches__stack';
		stack.append( this.foreground, this.background );

		this.el.append( stack, swap, reset );

		this.off = options.onColoursChange( () => this.sync() );
		this.sync();
	}

	/**
	 * Builds one swatch button.
	 *
	 * @param which Which colour it shows.
	 * @param label Accessible name.
	 */
	private makeSwatch(
		which: 'colour' | 'background',
		label: string
	): HTMLButtonElement {
		const button = document.createElement( 'button' );

		button.type = 'button';
		button.className = `dg-swatches__chip dg-swatches__chip--${ which }`;
		button.title = label;
		button.setAttribute( 'aria-label', label );
		button.setAttribute( 'aria-haspopup', 'dialog' );
		button.addEventListener( 'click', ( event ) => {
			event.stopPropagation();
			this.openPicker( which, button, label );
		} );

		return button;
	}

	/**
	 * Opens the colour picker for one swatch.
	 *
	 * @param which  Which colour is being edited.
	 * @param anchor The swatch the popover hangs from.
	 * @param label  Accessible name.
	 */
	private openPicker(
		which: 'colour' | 'background',
		anchor: HTMLElement,
		label: string
	): void {
		const already = this.popover?.dataset.which === which;

		this.closePicker();

		if ( already ) {
			return;
		}

		const popover = document.createElement( 'div' );
		popover.className = 'dg-swatch-popover';
		popover.dataset.which = which;
		popover.setAttribute( 'role', 'dialog' );
		popover.setAttribute( 'aria-label', label );

		const field = createColourField( {
			label,
			value: this.options.getColours()[ which ],
			onChange: ( value ) => {
				this.options.setColours( { [ which ]: value } );
				this.sync();
			},
		} );

		const palette = document.createElement( 'div' );
		palette.className = 'dg-swatch-popover__palette';

		for ( const colour of PALETTE ) {
			const chip = document.createElement( 'button' );

			chip.type = 'button';
			chip.className = 'dg-swatch-popover__chip';
			chip.style.background = colour;
			chip.title = colour;
			chip.setAttribute( 'aria-label', colour );
			chip.addEventListener( 'click', () => {
				this.options.setColours( { [ which ]: colour } );
				field.setValue( colour );
				this.sync();
			} );

			palette.appendChild( chip );
		}

		const done = createButton( {
			label: __( 'Done' ),
			variant: 'secondary',
			onClick: () => this.closePicker(),
		} );

		popover.append( field.el, palette, done.el );
		anchor.after( popover );

		this.popover = popover;
		this.release = [ field.destroy, done.destroy ];

		// Clicking anywhere else closes it, which is what a popover is expected to do.
		const onAway = ( event: MouseEvent ) => {
			if ( event.target instanceof Node && ! popover.contains( event.target ) ) {
				this.closePicker();
			}
		};
		const onKey = ( event: KeyboardEvent ) => {
			if ( event.key === 'Escape' ) {
				event.stopPropagation();
				this.closePicker();
			}
		};

		// Deferred, or the click that opened the popover closes it again.
		window.setTimeout( () => document.addEventListener( 'click', onAway ), 0 );
		popover.addEventListener( 'keydown', onKey );

		this.release.push( () => document.removeEventListener( 'click', onAway ) );
	}

	/** Closes the picker, if one is open. */
	private closePicker(): void {
		for ( const off of this.release ) {
			off();
		}

		this.release = [];
		this.popover?.remove();
		this.popover = null;
	}

	/** Exchanges the two colours. */
	swap(): void {
		const { colour, background } = this.options.getColours();

		this.options.setColours( { colour: background, background: colour } );
		this.sync();
	}

	/** Restores black on white. */
	reset(): void {
		this.options.setColours( {
			colour: DEFAULT_FOREGROUND,
			background: DEFAULT_BACKGROUND,
		} );
		this.sync();
	}

	/** Repaints both chips from the current settings. */
	sync(): void {
		const { colour, background } = this.options.getColours();

		this.foreground.style.background = colour;
		this.background.style.background = background;
		this.foreground.title = `${ __( 'Foreground colour' ) }: ${ colour }`;
		this.background.title = `${ __( 'Background colour' ) }: ${ background }`;
	}

	/** Releases listeners. */
	destroy(): void {
		this.closePicker();
		this.off();
		this.el.remove();
	}
}
