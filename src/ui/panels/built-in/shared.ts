/**
 * Helpers more than one built-in panel needs.
 */

/**
 * Writes a value into a select without disturbing it if it already matches.
 *
 * The adaptive kit hides whether the control is a Desktop Mode component or a plain
 * `<select>`, so this looks for the underlying element either way.
 *
 * @param root  The field's root element.
 * @param value Value to select.
 */
export function syncSelectValue( root: HTMLElement, value: string ): void {
	const select = root.querySelector( 'select' );

	if ( select ) {
		if ( select.value !== value ) {
			select.value = value;
		}

		return;
	}

	if ( root.getAttribute( 'value' ) !== value ) {
		root.setAttribute( 'value', value );
	}
}

/**
 * Reads the collapsed flag off a `lz-panel-toggle` event.
 *
 * Panels that own something outside their own body -- an overlay on the stage --
 * listen for this to know when they have been put away.
 *
 * @param event The toggle event.
 */
export function toggleCollapsed( event: Event ): boolean {
	return (
		( event as CustomEvent< { collapsed: boolean } > ).detail?.collapsed === true
	);
}

/** A short hint paragraph. */
export function hintText( text: string ): HTMLElement {
	const hint = document.createElement( 'p' );

	hint.className = 'lz-hint';
	hint.textContent = text;

	return hint;
}

/** A row that lays its buttons out side by side. */
export function buttonRow(): HTMLElement {
	const row = document.createElement( 'div' );

	row.className = 'lz-buttons';

	return row;
}
