/**
 * Text inputs.
 */

import { hasComponent } from '../../platform';
import { eventDetail, labelledRow, nameControl } from './internals';
import type { FieldHandle } from './types';

export interface TextFieldOptions {
	label: string;
	value: string;
	placeholder?: string;
	onChange: ( value: string ) => void;
	/** Fires on Enter or blur, for actions that should not run per keystroke. */
	onCommit?: ( value: string ) => void;
}

/**
 * Builds a labelled text input.
 *
 * @param options Field configuration.
 */
export function createTextField( options: TextFieldOptions ): FieldHandle {
	if ( hasComponent( 'wpd-text-field' ) ) {
		const field = document.createElement( 'wpd-text-field' );

		field.setAttribute( 'label', options.label );
		field.setAttribute( 'value', options.value );

		if ( options.placeholder ) {
			field.setAttribute( 'placeholder', options.placeholder );
		}

		const read = ( event: Event ) =>
			eventDetail< { value: string } >( event )?.value ?? '';

		const onChange = ( event: Event ) => options.onChange( read( event ) );
		const onCommit = ( event: Event ) => options.onCommit?.( read( event ) );

		field.addEventListener( 'wpd-input-change', onChange );
		field.addEventListener( 'wpd-input-commit', onCommit );
		field.addEventListener( 'wpd-submit', onCommit );

		return {
			el: field,
			setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
			destroy: () => {
				field.removeEventListener( 'wpd-input-change', onChange );
				field.removeEventListener( 'wpd-input-commit', onCommit );
				field.removeEventListener( 'wpd-submit', onCommit );
			},
		};
	}

	const { wrap, text } = labelledRow( 'label', options.label, 'lz-field' );

	const input = document.createElement( 'input' );
	input.type = 'text';
	input.className = 'lz-field__control';
	nameControl( input, null, 'text' );
	input.value = options.value;

	if ( options.placeholder ) {
		input.placeholder = options.placeholder;
	}

	const onInput = () => options.onChange( input.value );
	const onCommit = () => options.onCommit?.( input.value );

	input.addEventListener( 'input', onInput );
	input.addEventListener( 'change', onCommit );
	input.addEventListener( 'keydown', ( event ) => {
		if ( 'Enter' === event.key ) {
			onCommit();
		}
	} );

	wrap.append( text, input );

	return {
		el: wrap,
		setValue: ( value ) => {
			input.value = String( value );
		},
		destroy: () => {
			input.removeEventListener( 'input', onInput );
			input.removeEventListener( 'change', onCommit );
		},
	};
}
