/**
 * Colour swatches.
 */

import { hasComponent } from '../../platform';
import { eventDetail, labelledRow, nameControl } from './internals';
import type { FieldHandle } from './types';

export interface ColourFieldOptions {
	label: string;
	value: string;
	onChange: ( value: string ) => void;
}

/**
 * Builds a colour swatch.
 *
 * @param options Field configuration.
 */
export function createColourField( options: ColourFieldOptions ): FieldHandle {
	if ( hasComponent( 'wpd-color-field' ) ) {
		const field = document.createElement( 'wpd-color-field' );

		field.setAttribute( 'label', options.label );
		field.setAttribute( 'value', options.value );

		const onChange = ( event: Event ) => {
			const detail = eventDetail< { value: string } >( event );

			if ( detail?.value ) {
				options.onChange( detail.value );
			}
		};

		field.addEventListener( 'wpd-color-change', onChange );

		return {
			el: field,
			setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
			destroy: () => field.removeEventListener( 'wpd-color-change', onChange ),
		};
	}

	const { wrap, text } = labelledRow(
		'label',
		options.label,
		'lz-field lz-field--compact'
	);

	const input = document.createElement( 'input' );
	input.type = 'color';
	input.className = 'lz-field__control lz-colour';
	nameControl( input, null, 'colour' );
	input.value = options.value;

	const onInput = () => options.onChange( input.value );

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
