/**
 * Options for the tools that select rather than paint.
 */

import { __ } from '../../i18n';
import { SELECTION_SHAPES } from '../../model/selection';
import type { SelectionShape } from '../../model/selection';
import { createSegmented } from '../controls';
import { selectionButtons, toleranceField } from './fields';
import type { OptionsBuilder } from './builder';

/**
 * Shape picker, plus select-all and deselect.
 *
 * @param bar The bar being built.
 */
export function renderSelectOptions( bar: OptionsBuilder ): void {
	// Segmented rather than a dropdown: four choices worth seeing at once, and a
	// shape you can identify without opening anything.
	bar.add(
		createSegmented( {
			label: __( 'Shape' ),
			value: bar.options.getSelectionShape(),
			options: SELECTION_SHAPES.map( ( entry ) => ( {
				value: entry.value,
				label: __( entry.label ),
			} ) ),
			onChange: ( value ) => {
				bar.options.setSelectionShape( value as SelectionShape );
				bar.rebuild();
			},
		} )
	);

	bar.divider();
	selectionButtons( bar );

	bar.hint(
		'polygon' === bar.options.getSelectionShape()
			? __( 'Click to add points, Enter to close.' )
			: __( 'Drag on the image. Escape deselects.' )
	);
}

/**
 * Tolerance for the wand, plus the same selection buttons.
 *
 * @param bar The bar being built.
 */
export function renderWandOptions( bar: OptionsBuilder ): void {
	toleranceField( bar );
	bar.divider();
	selectionButtons( bar );

	bar.hint( __( 'Click a colour to select the region around it.' ) );
}
