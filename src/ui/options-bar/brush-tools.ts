/**
 * Options for the tools that stroke.
 *
 * All five are size, strength and hardness in some combination -- what differs is
 * which of them mean anything and what the tool samples from.
 */

import { BRUSH_SHAPES } from '../../engine/brush';
import type { BrushShape } from '../../engine/brush';
import { RETOUCH_MODES, TONE_MODES } from '../../engine/pixel-tools';
import type { PixelOp } from '../../engine/pixel-tools';
import { __ } from '../../i18n';
import { createButton, createSegmented } from '../controls';
import { colourField, percentField, sizeField, toleranceField } from './fields';
import type { OptionsBuilder } from './builder';

/**
 * Brush size, shape, hardness, opacity and colour.
 *
 * @param bar     The bar being built.
 * @param erasing Whether the eraser is active, which has no colour.
 */
export function renderBrushOptions( bar: OptionsBuilder, erasing: boolean ): void {
	const shape = createSegmented( {
		label: __( 'Shape' ),
		value: bar.brush.shape,
		options: BRUSH_SHAPES.map( ( entry ) => ( {
			value: entry.value,
			label: __( entry.label ),
		} ) ),
		onChange: ( value ) => bar.setBrush( { shape: value as BrushShape } ),
	} );

	bar.add( shape, () => shape.setValue( bar.brush.shape ) );

	bar.divider();
	sizeField( bar );
	percentField( bar, 'hardness', __( 'Hardness' ), 0 );
	percentField( bar, 'opacity', __( 'Opacity' ), 1 );

	if ( ! erasing ) {
		bar.divider();
		colourField( bar );
	}
}

/**
 * Mode, size, strength and hardness for the retouching and toning brushes.
 *
 * @param bar  The bar being built.
 * @param tool Which of the two.
 */
export function renderPixelToolOptions(
	bar: OptionsBuilder,
	tool: 'retouch' | 'tone'
): void {
	const modes = 'retouch' === tool ? RETOUCH_MODES : TONE_MODES;

	bar.add(
		createSegmented( {
			label: __( 'Mode' ),
			value: bar.brush[ tool ],
			options: modes.map( ( entry ) => ( {
				value: entry.value,
				label: __( entry.label ),
			} ) ),
			onChange: ( value ) => bar.setBrush( { [ tool ]: value as PixelOp } ),
		} )
	);

	bar.divider();
	sizeField( bar );
	percentField( bar, 'strength', __( 'Strength' ), 1 );
	percentField( bar, 'hardness', __( 'Hardness' ), 0 );

	bar.hint(
		'retouch' === tool && 'heal' === bar.brush.retouch
			? __( 'Dab over a blemish; it fills from the pixels around it.' )
			: ''
	);
}

/**
 * The history brush: size, strength, hardness.
 *
 * @param bar The bar being built.
 */
export function renderHistoryOptions( bar: OptionsBuilder ): void {
	sizeField( bar );
	percentField( bar, 'strength', __( 'Strength' ), 1 );
	percentField( bar, 'hardness', __( 'Hardness' ), 0 );

	bar.hint(
		__( 'Paint the original image back, wherever it has been painted over.' )
	);
}

/**
 * Clone stamp: size, strength, and the sample point.
 *
 * @param bar The bar being built.
 */
export function renderCloneOptions( bar: OptionsBuilder ): void {
	sizeField( bar );
	percentField( bar, 'strength', __( 'Strength' ), 1 );
	percentField( bar, 'hardness', __( 'Hardness' ), 0 );

	bar.divider();

	const clear = createButton( {
		label: __( 'Clear source' ),
		variant: 'ghost',
		onClick: () => {
			bar.options.clearCloneSource();
			bar.rebuild();
		},
	} );

	clear.setDisabled( ! bar.options.hasCloneSource() );
	bar.add( clear );

	bar.hint(
		bar.options.hasCloneSource()
			? __( 'Drag to paint from the sample point. Alt-click to move it.' )
			: __( 'Alt-click to set the point you want to copy from.' )
	);
}

/**
 * Fill tolerance and colour.
 *
 * @param bar The bar being built.
 */
export function renderFillOptions( bar: OptionsBuilder ): void {
	toleranceField( bar );
	percentField( bar, 'opacity', __( 'Opacity' ), 1 );
	bar.divider();
	colourField( bar );
}
