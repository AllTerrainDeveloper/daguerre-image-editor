/**
 * One collapsible panel.
 *
 * Split out from the host because it is the piece with the accessibility contract --
 * the `aria-expanded`/`aria-controls` pairing, and the `lz-panel-toggle` event a panel
 * owning something outside its own body relies on. That contract is easier to keep
 * right when it is not buried in the middle of a render loop.
 */

import type { PanelContext, PanelDef } from './types';

/** A built panel section and whatever its body needs releasing. */
export interface PanelSection {
	el: HTMLElement;
	/** The panel's own teardown, when it returned one. */
	teardown: ( () => void ) | null;
}

export interface PanelSectionOptions {
	def: PanelDef;
	ctx: PanelContext;
	/** Whether it starts collapsed. */
	collapsed: boolean;
	/** Called when the user collapses or expands it, so the state can be persisted. */
	onToggle: ( collapsed: boolean ) => void;
}

/**
 * Builds one collapsible panel.
 *
 * The body stays in the DOM when collapsed rather than being destroyed. The
 * histogram subscribes to updates on render, and tearing that down on every
 * collapse would mean a reopened panel showed a stale plot until the next
 * adjustment.
 *
 * @param options Section configuration.
 */
export function createPanelSection( options: PanelSectionOptions ): PanelSection {
	const { def, collapsed } = options;

	const section = document.createElement( 'section' );
	section.className = 'lz-panel';
	section.dataset.panel = def.id;
	section.classList.toggle( 'is-collapsed', collapsed );

	const bodyId = `lz-panel-body-${ def.id }`;

	const header = document.createElement( 'button' );
	header.type = 'button';
	header.className = 'lz-panel__header';
	header.setAttribute( 'aria-expanded', String( ! collapsed ) );
	header.setAttribute( 'aria-controls', bodyId );

	const chevron = document.createElement( 'span' );
	chevron.className = 'lz-panel__chevron';
	chevron.setAttribute( 'aria-hidden', 'true' );
	chevron.textContent = '▸';

	const title = document.createElement( 'span' );
	title.className = 'lz-panel__title';
	title.textContent = def.title;

	header.append( chevron, title );

	const body = document.createElement( 'div' );
	body.className = 'lz-panel__body';
	body.id = bodyId;
	body.hidden = collapsed;
	body.dataset.collapsed = String( collapsed );

	header.addEventListener( 'click', () => {
		const next = ! section.classList.contains( 'is-collapsed' );

		section.classList.toggle( 'is-collapsed', next );
		body.hidden = next;
		body.dataset.collapsed = String( next );
		header.setAttribute( 'aria-expanded', String( ! next ) );
		options.onToggle( next );

		// Panels that own something outside their own body -- the crop overlay
		// lives on the stage -- need to know when they are put away.
		body.dispatchEvent(
			new CustomEvent( 'lz-panel-toggle', {
				detail: { collapsed: next },
				bubbles: false,
			} )
		);
	} );

	const teardown = def.render( body, options.ctx );

	section.append( header, body );

	return {
		el: section,
		teardown: 'function' === typeof teardown ? teardown : null,
	};
}
