/**
 * Numeric fields.
 */

import { onShellEvent, pickComponent } from '../../platform';
import { eventDetail, labelledRow, nameControl } from './internals';
import type { FieldHandle } from './types';

export interface NumberFieldOptions {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	/**
	 * Renders the label beside the control rather than inside it, and narrows the
	 * control to a few digits.
	 *
	 * For the options bar, where the values are two or three digits and the fields sit
	 * in a row. Letting the component own the label there makes every field a different
	 * width -- the label is inside the same box -- so "Hardness" ends up with a visibly
	 * narrower input than "Size", and all of them far wider than any value they hold.
	 */
	compact?: boolean;
	onChange: ( value: number ) => void;
}

/**
 * Builds a compact numeric field.
 *
 * Three tiers, best first. The number field clamps on commit and emits an
 * already-parsed number. When it is absent -- which is the common case, since the
 * shell only registers it once a bundle importing it loads -- the text field in
 * numeric mode is used instead: still the shell's own control, still the shell's own
 * styling, and only the parsing has to be done here. A bare `<input type="number">` is
 * the last resort, for a page with no Desktop Mode at all.
 *
 * @param options Field configuration.
 */
export function createNumberField( options: NumberFieldOptions ): FieldHandle {
	const tag = pickComponent( [ 'number-field', 'text-field' ] );

	return tag ? componentField( tag, options ) : nativeField( options );
}

/**
 * Numeric field backed by one of the shell's components.
 *
 * @param tag     Which component was available.
 * @param options Field configuration.
 */
function componentField( tag: string, options: NumberFieldOptions ): FieldHandle {
	const numeric = tag.endsWith( '-number-field' );
	const field = document.createElement( tag );

	if ( options.compact ) {
		field.setAttribute( 'aria-label', options.label );
	} else {
		field.setAttribute( 'label', options.label );
	}

	field.setAttribute( 'value', String( Math.round( options.value ) ) );
	field.classList.add( 'lz-field--compact' );

	if ( numeric ) {
		field.setAttribute( 'min', String( options.min ) );
		field.setAttribute( 'max', String( options.max ) );
		field.setAttribute( 'step', String( options.step ?? 1 ) );
	} else {
		// The text field passes `type` through to its inner input, so the browser
		// still gives spinners and a numeric keypad; the clamping is ours.
		field.setAttribute( 'type', 'number' );
	}

	if ( options.suffix ) {
		field.setAttribute( 'suffix', options.suffix );
	}

	const onChange = ( event: Event ) => {
		const detail = eventDetail< { value: number | string } >( event );

		if ( ! detail ) {
			return;
		}

		const next = Number( detail.value );

		if ( ! Number.isFinite( next ) ) {
			return;
		}

		// The number field has already clamped; a text field has not.
		options.onChange( numeric ? next : clamp( next, options ) );
	};

	const offs = [
		onShellEvent( field, 'input-change', onChange ),
		onShellEvent( field, 'input-commit', onChange ),
	];

	const handle: FieldHandle = {
		el: field,
		setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
		destroy: () => {
			for ( const off of offs ) {
				off();
			}
		},
	};

	if ( ! options.compact ) {
		return handle;
	}

	// The label goes outside, so every field in the row can share one width no
	// matter how long its name is.
	const { wrap, text } = labelledRow(
		'div',
		options.label,
		'lz-field lz-field--compact lz-field--narrow'
	);

	wrap.append( text, field );

	return { ...handle, el: wrap };
}

/**
 * Numeric field built from a native input, for a page with no Desktop Mode at all.
 *
 * @param options Field configuration.
 */
function nativeField( options: NumberFieldOptions ): FieldHandle {
	const { wrap, text } = labelledRow(
		'label',
		options.label,
		options.compact
			? 'lz-field lz-field--compact lz-field--narrow'
			: 'lz-field lz-field--compact'
	);

	const input = document.createElement( 'input' );
	input.type = 'number';
	input.className = 'lz-field__control';
	nameControl( input, null, 'number' );
	input.value = String( Math.round( options.value ) );
	input.min = String( options.min );
	input.max = String( options.max );
	input.step = String( options.step ?? 1 );

	const onInput = () => {
		const next = Number( input.value );

		if ( Number.isFinite( next ) ) {
			options.onChange( clamp( next, options ) );
		}
	};

	input.addEventListener( 'input', onInput );
	wrap.append( text, input );

	return {
		el: wrap,
		setValue: ( value ) => {
			input.value = String( value );
		},
		destroy: () => input.removeEventListener( 'input', onInput ),
	};
}

/**
 * Holds a value inside the field's range.
 *
 * @param value  Value to clamp.
 * @param bounds Field bounds.
 */
function clamp( value: number, bounds: { min: number; max: number } ): number {
	return Math.min( bounds.max, Math.max( bounds.min, value ) );
}
