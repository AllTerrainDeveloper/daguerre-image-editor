/**
 * Placement for popovers and pickers.
 */

/**
 * Where a floating element should be attached.
 *
 * The nearest editor root, not the body. The body escapes the clipping but also
 * escapes the palette: every colour in this stylesheet is a custom property declared
 * on `.lz-editor`, so a popover parented to the body inherits none of them and renders
 * as transparent text over the canvas. Staying inside the editor keeps the variables
 * and still clears the tool rail's own scroll container.
 *
 * @param anchor Element the popover belongs to.
 */
export function floatingHost( anchor: HTMLElement ): HTMLElement {
	return anchor.closest( '.lz-editor' ) ?? document.body;
}

/**
 * Positions a floating element next to an anchor, using fixed coordinates.
 *
 * Absolute positioning is the obvious choice and the wrong one here: the tool rail
 * scrolls, and a scroll container clips absolutely positioned descendants that reach
 * outside it. A popover anchored that way is in the DOM, has a size, passes every
 * query -- and is invisible. Fixed positioning is measured against the viewport, so
 * nothing between the element and the screen can clip it.
 *
 * The element must be appended somewhere before this is called, so it has a box to
 * measure.
 *
 * @param el        Floating element.
 * @param anchor    Element to sit beside.
 * @param placement Which side to prefer.
 */
export function positionFloating(
	el: HTMLElement,
	anchor: HTMLElement,
	placement: 'inline-end' | 'block-end' = 'inline-end'
): void {
	const from = anchor.getBoundingClientRect();

	el.style.position = 'fixed';
	el.style.insetInlineStart = 'auto';
	el.style.insetBlockStart = 'auto';

	const box = el.getBoundingClientRect();
	const gap = 6;

	let left = 'inline-end' === placement ? from.right + gap : from.left;
	let top = 'inline-end' === placement ? from.top : from.bottom + gap;

	// Nudge back on screen rather than letting a popover hang off the edge.
	left = Math.max( gap, Math.min( left, window.innerWidth - box.width - gap ) );
	top = Math.max( gap, Math.min( top, window.innerHeight - box.height - gap ) );

	el.style.left = `${ Math.round( left ) }px`;
	el.style.top = `${ Math.round( top ) }px`;
}
