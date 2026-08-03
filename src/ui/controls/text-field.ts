/**
 * Text inputs.
 */

import { componentTag, onShellEvent } from '../../platform';
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
	const tag = componentTag( 'text-field' );

	if ( tag ) {
		const field = document.createElement( tag );

		field.setAttribute( 'label', options.label );
		field.setAttribute( 'value', options.value );

		if ( options.placeholder ) {
			field.setAttribute( 'placeholder', options.placeholder );
		}

		const read = ( event: Event ) =>
			eventDetail< { value: string } >( event )?.value ?? '';

		const onChange = ( event: Event ) => options.onChange( read( event ) );
		const onCommit = ( event: Event ) => options.onCommit?.( read( event ) );

		const offs = [
			onShellEvent( field, 'input-change', onChange ),
			onShellEvent( field, 'input-commit', onCommit ),
			onShellEvent( field, 'submit', onCommit ),
		];

		return {
			el: field,
			setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
			destroy: () => {
				for ( const off of offs ) {
					off();
				}
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
