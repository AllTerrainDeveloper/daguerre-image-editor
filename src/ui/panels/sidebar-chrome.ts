/**
 * The sidebar's own header.
 *
 * Everything above the panel stack: the title, the button that opens the tool picker,
 * and the one that puts the whole sidebar away.
 */

import { __ } from '../../i18n';

export interface SidebarChrome {
	/** Where panels are rendered. */
	stack: HTMLElement;
	/** The button that owns the tool picker. */
	pickerToggle: HTMLButtonElement;
}

export interface SidebarChromeOptions {
	/** Sidebar element to fill. Its contents are replaced. */
	root: HTMLElement;
	/** Called when the picker button is pressed. */
	onPicker: ( toggle: HTMLButtonElement ) => void;
	/** Called when the user closes the sidebar. Omitted when it cannot be closed. */
	onHide?: () => void;
}

/**
 * Builds the sidebar header and the panel container.
 *
 * @param options Chrome configuration.
 */
export function buildSidebarChrome( options: SidebarChromeOptions ): SidebarChrome {
	const { root } = options;

	root.replaceChildren();

	const header = document.createElement( 'div' );
	header.className = 'lz-sidebar__header';

	const label = document.createElement( 'span' );
	label.className = 'lz-sidebar__title';
	label.textContent = __( 'Tools' );

	const pickerToggle = document.createElement( 'button' );
	pickerToggle.type = 'button';
	pickerToggle.className = 'lz-sidebar__picker-toggle';
	pickerToggle.textContent = '⋯';
	pickerToggle.title = __( 'Choose which tools are shown' );
	pickerToggle.setAttribute( 'aria-label', __( 'Choose which tools are shown' ) );
	pickerToggle.setAttribute( 'aria-expanded', 'false' );
	pickerToggle.addEventListener( 'click', () => options.onPicker( pickerToggle ) );

	const actions = document.createElement( 'div' );
	actions.className = 'lz-sidebar__actions';
	actions.appendChild( pickerToggle );

	if ( options.onHide ) {
		const hide = document.createElement( 'button' );
		hide.type = 'button';
		hide.className = 'lz-sidebar__hide';
		hide.textContent = '⟩';
		hide.title = __( 'Hide the tools' );
		hide.setAttribute( 'aria-label', __( 'Hide the tools' ) );
		hide.addEventListener( 'click', () => options.onHide?.() );

		actions.appendChild( hide );
	}

	header.append( label, actions );

	const stack = document.createElement( 'div' );
	stack.className = 'lz-panels';

	root.append( header, stack );

	return { stack, pickerToggle };
}
