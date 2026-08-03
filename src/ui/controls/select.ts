/**
 * Dropdowns.
 */

import { componentTag, onShellEvent } from '../../platform';
import { fieldId, nameControl, siblingTag } from './internals';
import type { ControlHandle, ControlOption } from './types';

/** Handle on a built select. */
export interface SelectHandle extends ControlHandle {
	getValue: () => string;
}

export interface SelectOptions {
	label: string;
	value: string;
	options: ControlOption[];
	onChange: ( value: string ) => void;
}

/**
 * Builds a labelled dropdown.
 *
 * The select component is not in the shell's eagerly registered set, so this usually
 * falls back to a native `<select>` -- which is no loss: a native select gets the
 * platform's own picker, which on touch devices is considerably better than
 * anything a web component reimplements.
 *
 * @param options Select configuration.
 */
export function createSelect( options: SelectOptions ): SelectHandle {
	const tag = componentTag( 'select' );
	const useWpd = null !== tag;

	const wrap = document.createElement( 'div' );
	wrap.className = 'lz-field';

	const label = document.createElement( 'label' );
	label.className = 'lz-field__label';
	label.textContent = options.label;

	const select = document.createElement( tag ?? 'select' );
	select.className = 'lz-field__control';

	if ( useWpd ) {
		// A custom element is not a form control, so it needs the id for the label but
		// not a name -- setting one would be a claim it does not honour.
		const id = fieldId( 'select' );

		select.id = id;
		label.htmlFor = id;
	} else {
		nameControl( select as HTMLSelectElement, label, 'select' );
	}

	for ( const option of options.options ) {
		const node = document.createElement(
			tag ? siblingTag( tag, 'option' ) : 'option'
		);
		node.setAttribute( 'value', option.value );
		node.textContent = option.label;
		select.appendChild( node );
	}

	if ( useWpd ) {
		select.setAttribute( 'value', options.value );
	} else {
		( select as HTMLSelectElement ).value = options.value;
	}

	const read = () =>
		useWpd
			? select.getAttribute( 'value' ) ?? options.value
			: ( select as HTMLSelectElement ).value;

	const onChange = () => options.onChange( read() );

	// `change` covers the native fallback; the shell spellings cover the component.
	select.addEventListener( 'change', onChange );

	const off = onShellEvent( select, 'change', onChange );

	wrap.append( label, select );

	return {
		el: wrap,
		getValue: read,
		destroy: () => {
			select.removeEventListener( 'change', onChange );
			off();
		},
	};
}
