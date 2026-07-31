/**
 * The menu that chooses which panels are on screen at all.
 */

import { createCheckbox } from '../controls';
import { __ } from '../../i18n';
import { listPanels } from './registry';
import type { PanelDef } from './types';

export interface ToolPickerOptions {
	/** Whether a panel is currently shown. */
	isVisible: ( def: PanelDef ) => boolean;
	/** Called when a panel is ticked or unticked. */
	onToggle: ( def: PanelDef, visible: boolean ) => void;
}

/**
 * Builds the tool picker menu.
 *
 * Rebuilt each time it opens rather than kept around, so a panel registered while it
 * was closed is in the list the next time it is opened.
 *
 * @param options Picker configuration.
 */
export function createToolPicker( options: ToolPickerOptions ): HTMLElement {
	const menu = document.createElement( 'div' );

	menu.className = 'lz-picker-menu';
	menu.setAttribute( 'role', 'group' );
	menu.setAttribute( 'aria-label', __( 'Tools' ) );

	for ( const def of listPanels() ) {
		const row = createCheckbox( {
			label: def.title,
			checked: options.isVisible( def ),
			onChange: ( checked ) => options.onToggle( def, checked ),
		} );

		row.el.classList.add( 'lz-picker-menu__item' );
		menu.appendChild( row.el );
	}

	return menu;
}
