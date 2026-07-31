/**
 * The tab that brings a hidden sidebar back.
 *
 * Hiding the sidebar entirely, rather than narrowing it, gives the picture the whole
 * window -- which is the point of hiding it. This tab is what makes that reversible
 * without hunting for a menu.
 */

import { __ } from '../i18n';
import { readSidebarOpen, writeSidebarOpen } from './prefs';

export interface SidebarToggle {
	/** The reopen tab, to be placed after the sidebar. */
	el: HTMLButtonElement;
	/** Shows or hides the sidebar. */
	setOpen: ( open: boolean ) => void;
	/** Applies the remembered state. */
	restore: () => void;
}

/**
 * Builds the reopen tab and the show/hide behaviour.
 *
 * @param root     Editor root, which carries the hidden class.
 * @param onToggle Called after each change, so the canvas can be re-fitted.
 */
export function createSidebarToggle(
	root: HTMLElement,
	onToggle: () => void
): SidebarToggle {
	const el = document.createElement( 'button' );

	el.type = 'button';
	el.className = 'lz-sidebar-tab';

	// The rotated text lives in a child. Setting `writing-mode` on the button itself
	// would re-map its own logical properties to the vertical axis, so
	// `inset-block-start` would mean "from the right" and the tab would land in the
	// wrong corner.
	const label = document.createElement( 'span' );
	label.className = 'lz-sidebar-tab__label';
	label.textContent = __( 'Tools' );

	el.appendChild( label );
	el.setAttribute( 'aria-controls', 'lz-sidebar' );

	const setOpen = ( open: boolean ) => {
		root.classList.toggle( 'is-sidebar-hidden', ! open );
		el.setAttribute( 'aria-expanded', String( open ) );
		el.hidden = open;

		writeSidebarOpen( open );

		// The stage just changed width, so the canvas has to be re-fitted and every
		// overlay repositioned against it.
		onToggle();
	};

	el.addEventListener( 'click', () => setOpen( true ) );

	return { el, setOpen, restore: () => setOpen( readSidebarOpen() ) };
}
