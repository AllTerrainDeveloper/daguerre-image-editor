/**
 * Options for the text tool and the zoom tool.
 */

import { FONT_STACKS } from '../../engine/paint-shapes';
import { __ } from '../../i18n';
import {
	createButton,
	createCheckbox,
	createNumberField,
	createSelect,
} from '../controls';
import { colourField } from './fields';
import type { OptionsBuilder } from './builder';

/**
 * The text itself, its size, family and weight.
 *
 * @param bar The bar being built.
 */
export function renderTextOptions( bar: OptionsBuilder ): void {
	bar.add(
		createSelect( {
			label: __( 'Font' ),
			value: bar.brush.fontFamily,
			options: FONT_STACKS.map( ( entry ) => ( {
				value: entry.value,
				label: __( entry.label ),
			} ) ),
			onChange: ( value ) => bar.setBrush( { fontFamily: value } ),
		} )
	);

	bar.add(
		createNumberField( {
			compact: true,
			label: __( 'Size' ),
			value: bar.brush.fontSize,
			min: 6,
			max: 1200,
			suffix: 'px',
			onChange: ( value ) => bar.setBrush( { fontSize: value } ),
		} )
	);

	bar.add(
		createCheckbox( {
			label: __( 'Bold' ),
			checked: bar.brush.bold,
			onChange: ( checked ) => bar.setBrush( { bold: checked } ),
		} )
	);

	bar.add(
		createCheckbox( {
			label: __( 'Italic' ),
			checked: bar.brush.italic,
			onChange: ( checked ) => bar.setBrush( { italic: checked } ),
		} )
	);

	bar.divider();
	colourField( bar );

	// The font controls restyle the caret live, so the hint is about the gesture
	// rather than about a field that no longer exists.
	bar.hint(
		bar.options.isTypingText()
			? __( 'Enter for a new line. Cmd/Ctrl+Enter finishes, Escape cancels.' )
			: __( 'Click on the image and type.' )
	);
}

/**
 * Fit and actual-size buttons.
 *
 * @param bar The bar being built.
 */
export function renderZoomOptions( bar: OptionsBuilder ): void {
	bar.add(
		createButton( {
			label: __( 'Fit' ),
			variant: 'secondary',
			onClick: () => bar.options.setZoom( 'fit' ),
		} )
	);

	bar.add(
		createButton( {
			label: __( '100%' ),
			variant: 'secondary',
			onClick: () => bar.options.setZoom( 'actual' ),
		} )
	);

	bar.hint( __( 'Click to zoom in, Alt-click to zoom out.' ) );
}
