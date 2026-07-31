/**
 * Buttons, with and without text.
 *
 * Both kinds are the same element wearing different clothes, so they share one builder.
 * What they do not share is how they get an accessible name: a text button has one
 * already, and an icon button has to be given one -- which is the whole reason
 * `createIconButton()` exists as a separate entry point rather than a flag.
 */

import { hasComponent } from '../../platform';
import type { ButtonHandle, ButtonVariant } from './types';

export interface ButtonOptions {
	label: string;
	title?: string;
	variant?: ButtonVariant;
	onClick: () => void;
}

/** Handle on an icon button. */
export interface IconButtonHandle extends ButtonHandle {
	/** Replaces the glyph, for a button that toggles between two states. */
	setGlyph: ( glyph: string ) => void;
}

export interface IconButtonOptions {
	/** The glyph shown. */
	glyph: string;
	/** Accessible name, and the tooltip. */
	label: string;
	/** Extra class for sizing and placement. */
	className?: string;
	variant?: ButtonVariant;
	onClick: () => void;
}

/** What both factories need from the shared builder. */
interface BuildOptions {
	/** Text or glyph shown inside. */
	content: string;
	/** Class marking which kind of button this is. */
	className: string;
	variant?: ButtonVariant;
	/** Class toggled by `setPressed()`. */
	pressedClass: string;
	/** True for an icon-only button, which the shell styles differently. */
	iconOnly?: boolean;
	onClick: () => void;
}

/**
 * Builds a button element and its handle.
 *
 * Prefers `<wpd-button>` when the shell has registered it, so the button carries the
 * desktop's own theming rather than an approximation of it.
 *
 * @param options Shared button configuration.
 */
function buildButton( options: BuildOptions ): ButtonHandle & { el: HTMLElement } {
	const useWpd = hasComponent( 'wpd-button' );
	const el = document.createElement( useWpd ? 'wpd-button' : 'button' );

	el.classList.add( options.className );
	el.textContent = options.content;

	if ( useWpd ) {
		el.setAttribute( 'variant', options.variant ?? 'ghost' );

		if ( options.iconOnly ) {
			el.setAttribute( 'icon-only', '' );
		}
	} else {
		( el as HTMLButtonElement ).type = 'button';
		el.classList.add( `lz-button--${ options.variant ?? 'ghost' }` );
	}

	el.addEventListener( 'click', options.onClick );

	return {
		el,
		setDisabled: ( disabled ) => {
			el.toggleAttribute( 'disabled', disabled );
			el.classList.toggle( 'is-disabled', disabled );

			// wpd-button reflects `disabled`, but a bare custom element still needs
			// removing from the tab order for keyboard users.
			if ( useWpd ) {
				el.setAttribute( 'aria-disabled', String( disabled ) );
			}
		},
		setPressed: ( pressed ) => {
			el.classList.toggle( options.pressedClass, pressed );
			el.setAttribute( 'aria-pressed', String( pressed ) );
		},
		destroy: () => el.removeEventListener( 'click', options.onClick ),
	};
}

/**
 * Builds a button.
 *
 * @param options Button configuration.
 */
export function createButton( options: ButtonOptions ): ButtonHandle {
	const handle = buildButton( {
		content: options.label,
		className: 'lz-button',
		variant: options.variant,
		pressedClass: 'is-pressed',
		onClick: options.onClick,
	} );

	if ( options.title ) {
		handle.el.setAttribute( 'title', options.title );
		handle.el.setAttribute( 'aria-label', options.title );
	}

	return handle;
}

/**
 * Builds an icon-only button.
 *
 * Its own factory rather than a flag on `createButton()` because the two differ in
 * more than presentation: an icon button has no visible text, so the accessible name
 * has to come from an attribute, and every caller getting that wrong once is exactly
 * how a toolbar ends up unusable with a screen reader.
 *
 * @param options Button configuration.
 */
export function createIconButton( options: IconButtonOptions ): IconButtonHandle {
	const handle = buildButton( {
		content: options.glyph,
		className: 'lz-icon-button',
		variant: options.variant,
		// An icon button reads as a state, not a press -- it is what the tool rail and
		// the options bar use for their toggles.
		pressedClass: 'is-active',
		iconOnly: true,
		onClick: options.onClick,
	} );

	if ( options.className ) {
		handle.el.classList.add( options.className );
	}

	handle.el.setAttribute( 'title', options.label );
	handle.el.setAttribute( 'aria-label', options.label );

	return {
		...handle,
		setGlyph: ( glyph ) => {
			handle.el.textContent = glyph;
		},
	};
}
