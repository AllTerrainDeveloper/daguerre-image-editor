/**
 * Colour palettes.
 */

import { hasComponent } from '../../platform';
import type { ControlHandle } from './types';

/** Handle on a grid of colour swatches. */
export interface SwatchGridHandle extends ControlHandle {
	/** Marks one swatch as chosen. */
	setValue: ( value: string ) => void;
}

export interface SwatchGridOptions {
	/** Accessible name for the group. */
	label: string;
	/** Colours offered, as CSS hex. */
	colours: string[];
	/** Which one is currently chosen, if any. */
	value?: string;
	onChange: ( value: string ) => void;
}

/**
 * Builds a palette of colour swatches.
 *
 * Prefers Desktop Mode's `<wpd-swatch-grid>` and `<wpd-swatch>`, which is exactly the
 * kind of control worth borrowing rather than restyling: the shell already knows how a
 * chosen swatch should look against its own palette.
 *
 * @param options Palette configuration.
 */
export function createSwatchGrid( options: SwatchGridOptions ): SwatchGridHandle {
	const useWpd = hasComponent( 'wpd-swatch-grid' ) && hasComponent( 'wpd-swatch' );
	const el = document.createElement( useWpd ? 'wpd-swatch-grid' : 'div' );
	const listeners: Array< () => void > = [];

	el.classList.add( 'lz-palette' );
	el.setAttribute( 'aria-label', options.label );

	if ( ! useWpd ) {
		el.setAttribute( 'role', 'group' );
	}

	const chips = new Map< string, HTMLElement >();

	for ( const colour of options.colours ) {
		const chip = document.createElement( useWpd ? 'wpd-swatch' : 'button' );

		chip.classList.add( 'lz-palette__chip' );
		chip.setAttribute( 'title', colour );
		chip.setAttribute( 'aria-label', colour );

		if ( useWpd ) {
			chip.setAttribute( 'value', colour );
			chip.setAttribute( 'preview', colour );
			chip.setAttribute( 'size', 'small' );
		} else {
			( chip as HTMLButtonElement ).type = 'button';
			chip.style.background = colour;
		}

		const onPick = () => options.onChange( colour );

		// wpd-swatch announces its own event; a bare button only has click.
		const event = useWpd ? 'wpd-pick' : 'click';

		chip.addEventListener( event, onPick );
		listeners.push( () => chip.removeEventListener( event, onPick ) );

		chips.set( colour, chip );
		el.appendChild( chip );
	}

	const setValue = ( value: string ) => {
		for ( const [ colour, chip ] of chips ) {
			const on = colour.toLowerCase() === value.toLowerCase();

			chip.toggleAttribute( 'selected', on );
			chip.classList.toggle( 'is-selected', on );
		}
	};

	if ( options.value ) {
		setValue( options.value );
	}

	return {
		el,
		setValue,
		destroy: () => {
			for ( const off of listeners ) {
				off();
			}
		},
	};
}
