/**
 * Labelled sliders.
 *
 * A slider is a value plus a way back to its default, so the reset affordance is part
 * of the control rather than something every caller remembers to add. The two backing
 * implementations -- the shell's component and a native range input -- are private:
 * callers ask for a slider and get whichever one the host can render.
 */

import { hasComponent } from '../../platform';
import { createButton } from './button';
import { eventDetail, fieldId } from './internals';
import type { SliderHandle } from './types';

export interface SliderOptions {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	/** Appended to the numeric readout, e.g. a degree sign. */
	suffix?: string;
	/** Value the reset control returns to. */
	resetTo: number;
	/** Fires continuously while dragging. */
	onInput: ( value: number ) => void;
	/** Fires once when a drag finishes, for history bookkeeping. */
	onCommit?: () => void;
}

/**
 * Builds a labelled slider with a numeric readout and a reset affordance.
 *
 * @param options Slider configuration.
 */
export function createSlider( options: SliderOptions ): SliderHandle {
	const row = document.createElement( 'div' );
	row.className = 'lz-adjust';

	const handle = hasComponent( 'wpd-range-field' )
		? createWpdSlider( options )
		: createNativeSlider( options );

	row.appendChild( handle.el );

	const reset = createButton( {
		label: '↺',
		title: `Reset ${ options.label }`,
		variant: 'ghost',
		onClick: () => {
			handle.setValue( options.resetTo );
			options.onInput( options.resetTo );
			options.onCommit?.();
		},
	} );

	reset.el.classList.add( 'lz-adjust__reset' );
	row.appendChild( reset.el );

	return {
		el: row,
		setValue: handle.setValue,
		destroy: () => {
			handle.destroy();
			reset.destroy();
		},
	};
}

/**
 * Slider backed by Desktop Mode's `<wpd-range-field>`.
 *
 * @param options Slider configuration.
 */
function createWpdSlider( options: SliderOptions ): SliderHandle {
	const field = document.createElement( 'wpd-range-field' );

	field.setAttribute( 'label', options.label );
	field.setAttribute( 'min', String( options.min ) );
	field.setAttribute( 'max', String( options.max ) );
	field.setAttribute( 'step', String( options.step ) );
	field.setAttribute( 'value', String( options.value ) );

	if ( options.suffix ) {
		field.setAttribute( 'suffix', options.suffix );
	}

	const onChange = ( event: Event ) => {
		const detail = eventDetail< { value: number } >( event );

		if ( detail && 'number' === typeof detail.value ) {
			options.onInput( detail.value );
		}
	};

	// The component emits an already-parsed number, so there is nothing to coerce.
	field.addEventListener( 'wpd-range-change', onChange );

	// It has no "drag finished" event, so pointer release stands in for one.
	const onRelease = () => options.onCommit?.();
	field.addEventListener( 'pointerup', onRelease );
	field.addEventListener( 'keyup', onRelease );

	return {
		el: field,
		setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
		destroy: () => {
			field.removeEventListener( 'wpd-range-change', onChange );
			field.removeEventListener( 'pointerup', onRelease );
			field.removeEventListener( 'keyup', onRelease );
		},
	};
}

/**
 * Slider built from a native range input.
 *
 * @param options Slider configuration.
 */
function createNativeSlider( options: SliderOptions ): SliderHandle {
	const wrap = document.createElement( 'div' );
	wrap.className = 'lz-slider';

	const id = fieldId( 'slider' );

	const label = document.createElement( 'label' );
	label.className = 'lz-slider__label';
	label.htmlFor = id;
	label.textContent = options.label;

	const readout = document.createElement( 'output' );
	readout.className = 'lz-slider__value';
	readout.htmlFor = id;

	const input = document.createElement( 'input' );
	input.type = 'range';
	input.id = id;
	input.name = id;
	input.className = 'lz-slider__input';
	input.min = String( options.min );
	input.max = String( options.max );
	input.step = String( options.step );
	input.value = String( options.value );

	const paint = ( value: number ) => {
		readout.textContent = `${ value }${ options.suffix ?? '' }`;
		// Lets CSS tint the filled portion of the track.
		const ratio = ( value - options.min ) / ( options.max - options.min || 1 );
		wrap.style.setProperty( '--lz-slider-fill', String( ratio ) );
		wrap.classList.toggle( 'is-modified', value !== options.resetTo );
	};

	paint( options.value );

	const onInput = () => {
		const value = Number( input.value );
		paint( value );
		options.onInput( value );
	};

	const onChange = () => options.onCommit?.();

	input.addEventListener( 'input', onInput );
	input.addEventListener( 'change', onChange );

	const head = document.createElement( 'div' );
	head.className = 'lz-slider__head';
	head.append( label, readout );
	wrap.append( head, input );

	return {
		el: wrap,
		setValue: ( value ) => {
			input.value = String( value );
			paint( value );
		},
		destroy: () => {
			input.removeEventListener( 'input', onInput );
			input.removeEventListener( 'change', onChange );
		},
	};
}
