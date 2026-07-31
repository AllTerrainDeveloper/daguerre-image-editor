/**
 * Shared plumbing behind the control factories.
 *
 * Nothing here is exported from the package barrel. It is the handful of things every
 * factory needs -- an id, an accessible name, and a way to read a `<wpd-*>` event --
 * kept in one place so twelve modules cannot drift into twelve slightly different
 * versions of them.
 */

/** Monotonic, so two controls created in the same millisecond cannot collide. */
let idCounter = 1;

/**
 * A unique id for a native form control.
 *
 * Generated rather than derived from the label, since two panels can legitimately show
 * a field called "Size".
 *
 * @param kind Short prefix describing the control.
 */
export function fieldId( kind: string ): string {
	return `lz-${ kind }-${ ( idCounter++ ).toString( 36 ) }`;
}

/**
 * Gives a native control an id and a name, and ties its label to it.
 *
 * Not decoration. A form field with neither is flagged by the browser's own
 * accessibility audit, because assistive technology and password managers both key off
 * them -- and wrapping the control in a `<label>` satisfies neither, which is why every
 * numeric field in the editor was drawing that warning.
 *
 * @param input Control to name.
 * @param label Its label element, when the association is explicit rather than by
 *              nesting.
 * @param kind  Short prefix describing the control.
 */
export function nameControl(
	input: HTMLInputElement | HTMLSelectElement,
	label: HTMLLabelElement | null,
	kind: string
): void {
	const id = fieldId( kind );

	input.id = id;
	input.name = id;

	if ( label ) {
		label.htmlFor = id;
	}
}

/**
 * Reads the payload off a `<wpd-*>` component event.
 *
 * Every one of them reports through `event.detail`, and every factory used to cast to
 * its own inline `CustomEvent< … >` shape to get at it. One helper means one cast, and
 * one place for the "the component fired but sent nothing" case that a hand-rolled
 * cast tends to forget.
 *
 * @param event Event as delivered to the listener.
 */
export function eventDetail< T >( event: Event ): Partial< T > | null {
	const detail = ( event as CustomEvent< T > ).detail;

	return detail && 'object' === typeof detail ? detail : null;
}

/**
 * Builds the label-plus-control row the native fallbacks share.
 *
 * @param tag       Wrapper element. A `<label>` when it nests its own control, a
 *                  `<div>` when the control names itself.
 * @param label     Visible label text.
 * @param className Wrapper class.
 */
export function labelledRow(
	tag: 'label' | 'div',
	label: string,
	className: string
): { wrap: HTMLElement; text: HTMLElement } {
	const wrap = document.createElement( tag );
	const text = document.createElement( 'span' );

	wrap.className = className;
	text.className = 'lz-field__label';
	text.textContent = label;

	return { wrap, text };
}
