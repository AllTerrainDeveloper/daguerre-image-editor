/**
 * Checkboxes.
 */

import { componentTag, onShellEvent } from '../../platform';
import { eventDetail, nameControl } from './internals';
import type { ControlHandle } from './types';

export interface CheckboxOptions {
	label: string;
	checked: boolean;
	title?: string;
	onChange: ( checked: boolean ) => void;
}

/** Handle on a checkbox. */
export interface CheckboxHandle extends ControlHandle {
	setChecked: ( checked: boolean ) => void;
}

/**
 * Builds a checkbox with an inline label.
 *
 * @param options Checkbox configuration.
 */
export function createCheckbox( options: CheckboxOptions ): CheckboxHandle {
	const tag = componentTag( 'checkbox-label' );

	if ( tag ) {
		const field = document.createElement( tag );

		field.setAttribute( 'label', options.label );
		field.toggleAttribute( 'checked', options.checked );

		if ( options.title ) {
			field.setAttribute( 'title', options.title );
		}

		const onChange = ( event: Event ) => {
			const detail = eventDetail< { checked: boolean } >( event );

			options.onChange( true === detail?.checked );
		};

		const off = onShellEvent( field, 'checkbox-change', onChange );

		return {
			el: field,
			setChecked: ( checked ) => field.toggleAttribute( 'checked', checked ),
			destroy: off,
		};
	}

	const wrap = document.createElement( 'label' );
	wrap.className = 'lz-check';

	if ( options.title ) {
		wrap.title = options.title;
	}

	const box = document.createElement( 'input' );
	box.type = 'checkbox';
	nameControl( box, null, 'check' );
	box.checked = options.checked;

	const onChange = () => options.onChange( box.checked );

	box.addEventListener( 'change', onChange );
	wrap.append( box, document.createTextNode( options.label ) );

	return {
		el: wrap,
		setChecked: ( checked ) => {
			box.checked = checked;
		},
		destroy: () => box.removeEventListener( 'change', onChange ),
	};
}
