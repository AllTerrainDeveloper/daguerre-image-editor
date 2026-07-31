/**
 * The two-column grid of tool buttons.
 *
 * Two columns rather than one because sixteen tools in a single column is taller than
 * most browser windows, and a tool you have to scroll to is a tool you stop using.
 */

import { createIconButton } from '../controls';
import type { IconButtonHandle } from '../controls';
import { __ } from '../../i18n';
import type { ActiveTool } from '../panels';
import { TOOLS } from './tools';

/** The built grid and the buttons inside it. */
export interface ToolGrid {
	el: HTMLElement;
	buttons: Map< ActiveTool, IconButtonHandle >;
}

/**
 * Builds the grid.
 *
 * @param onSelect Called when a tool is chosen.
 */
export function buildToolGrid( onSelect: ( tool: ActiveTool ) => void ): ToolGrid {
	const el = document.createElement( 'div' );

	el.className = 'lz-rail__grid';
	el.setAttribute( 'role', 'toolbar' );
	el.setAttribute( 'aria-orientation', 'vertical' );
	el.setAttribute( 'aria-label', __( 'Tools' ) );

	const buttons = new Map< ActiveTool, IconButtonHandle >();

	let group = TOOLS[ 0 ]?.group;
	let inGroup = 0;

	for ( const tool of TOOLS ) {
		if ( tool.group !== group ) {
			// A group with an odd number of tools would leave the next group starting
			// in the second column, and every later separator half a row out of place.
			// One empty cell keeps the columns honest however the tool list is later
			// edited, which is better than relying on every group staying even.
			if ( 1 === inGroup % 2 ) {
				el.appendChild( filler( 'lz-rail__spacer' ) );
			}

			el.appendChild( filler( 'lz-rail__rule' ) );
			group = tool.group;
			inGroup = 0;
		}

		inGroup++;

		// From the kit, so the rail is built from Desktop Mode's buttons when they are
		// registered rather than from something that merely resembles them.
		const button = createIconButton( {
			glyph: tool.glyph,
			label: `${ __( tool.label ) } (${ tool.key.toUpperCase() })`,
			className: 'lz-rail__button',
			onClick: () => onSelect( tool.id ),
		} );

		button.el.setAttribute( 'aria-pressed', 'false' );
		buttons.set( tool.id, button );
		el.appendChild( button.el );
	}

	return { el, buttons };
}

/**
 * A decorative cell that only exists to keep the columns lined up.
 *
 * @param className Which kind.
 */
function filler( className: string ): HTMLElement {
	const el = document.createElement( 'span' );

	el.className = className;
	el.setAttribute( 'aria-hidden', 'true' );

	return el;
}
