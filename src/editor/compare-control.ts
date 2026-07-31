/**
 * Hold-to-see-the-original.
 *
 * A hold rather than a toggle, because the useful question is "what did I change?" and
 * the answer is clearest when the two states flip under one finger. Backslash does the
 * same thing for the keyboard, matching the convention in most raw processors.
 */

import { __ } from '../i18n';
import { createButton } from '../ui/controls';
import type { ButtonHandle } from '../ui/controls';
import { onEditorKey } from './keys';

/**
 * Builds the compare button and its key binding.
 *
 * @param setBypass Shows or hides the original.
 * @return The button, and a detach function for the key binding.
 */
export function createCompareControl( setBypass: ( on: boolean ) => void ): {
	handle: ButtonHandle;
	detach: () => void;
} {
	const handle = createButton( {
		label: __( 'Compare' ),
		title: __( 'Hold to see the original' ),
		variant: 'ghost',
		onClick: () => {},
	} );

	const start = () => {
		setBypass( true );
		handle.setPressed( true );
	};

	const end = () => {
		setBypass( false );
		handle.setPressed( false );
	};

	handle.el.addEventListener( 'pointerdown', start );
	handle.el.addEventListener( 'pointerup', end );
	handle.el.addEventListener( 'pointerleave', end );
	handle.el.addEventListener( 'pointercancel', end );

	// Release is unconditional. The press is ignored while the user is typing, but
	// once bypass is on it has to be possible to turn it off from anywhere -- a guard
	// here is how the editor gets stuck showing the original.
	const onKeyUp = ( event: KeyboardEvent ) => {
		if ( '\\' === event.key ) {
			end();
		}
	};

	document.addEventListener( 'keyup', onKeyUp );

	const offKeyDown = onEditorKey( 'keydown', ( event ) => {
		if ( '\\' === event.key && ! event.repeat ) {
			start();
		}
	} );

	return {
		handle,
		detach: () => {
			offKeyDown();
			document.removeEventListener( 'keyup', onKeyUp );
		},
	};
}
