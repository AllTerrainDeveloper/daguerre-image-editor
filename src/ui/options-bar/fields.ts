/**
 * The fields that appear on more than one tool.
 *
 * Kept together because each one carries a syncing rule as well as a control. The
 * eyedropper writes the foreground colour from outside the bar, so a colour field that
 * forgot to register a syncer would silently show the wrong swatch -- and that is
 * exactly the sort of thing that gets forgotten when the field is written out twice.
 */

import { __ } from '../../i18n';
import {
	createButton,
	createColourField,
	createNumberField,
} from '../controls';
import type { OptionsBuilder } from './builder';

/** The brush diameter, shared by every stroking tool. */
export function sizeField( bar: OptionsBuilder ): void {
	const field = createNumberField( {
		compact: true,
		label: __( 'Size' ),
		value: bar.brush.size,
		min: 1,
		max: 400,
		suffix: 'px',
		onChange: ( value ) => bar.setBrush( { size: value } ),
	} );

	bar.add( field, () => field.setValue( bar.brush.size ) );
}

/** Flood fill and wand match tolerance. */
export function toleranceField( bar: OptionsBuilder ): void {
	const field = createNumberField( {
		compact: true,
		label: __( 'Tolerance' ),
		value: bar.brush.tolerance,
		min: 0,
		max: 128,
		onChange: ( value ) => bar.setBrush( { tolerance: value } ),
	} );

	bar.add( field, () => field.setValue( bar.brush.tolerance ) );
}

/**
 * A 0..1 setting shown as a percentage.
 *
 * @param bar   The bar being built.
 * @param key   Which setting.
 * @param label Field label.
 * @param min   Lowest percentage offered. Pass 1 where zero is meaningless.
 */
export function percentField(
	bar: OptionsBuilder,
	key: 'hardness' | 'opacity' | 'strength',
	label: string,
	min: 0 | 1
): void {
	const read = () => Math.round( bar.brush[ key ] * 100 );

	const field = createNumberField( {
		compact: true,
		label,
		value: read(),
		min,
		max: 100,
		suffix: '%',
		onChange: ( value ) => bar.setBrush( { [ key ]: value / 100 } ),
	} );

	bar.add( field, () => field.setValue( read() ) );
}

/**
 * The foreground colour, which most tools paint with.
 *
 * @param bar   The bar being built.
 * @param label Optional. Field label.
 */
export function colourField(
	bar: OptionsBuilder,
	label = __( 'Colour' )
): void {
	const field = createColourField( {
		label,
		value: bar.brush.colour,
		onChange: ( value ) => bar.setBrush( { colour: value } ),
	} );

	// Synced, because the eyedropper writes here from outside the bar.
	bar.add( field, () => field.setValue( bar.brush.colour ) );
}

/** Select-all and deselect, shared by every selection tool. */
export function selectionButtons( bar: OptionsBuilder ): void {
	bar.add(
		createButton( {
			label: __( 'Select all' ),
			variant: 'secondary',
			onClick: () => bar.options.selectAll(),
		} )
	);

	const deselect = createButton( {
		label: __( 'Deselect' ),
		variant: 'ghost',
		onClick: () => {
			bar.options.deselect();
			bar.rebuild();
		},
	} );

	// Disabled rather than hidden, so the control does not move around.
	deselect.setDisabled( ! bar.options.hasSelection() );
	bar.add( deselect );
}
