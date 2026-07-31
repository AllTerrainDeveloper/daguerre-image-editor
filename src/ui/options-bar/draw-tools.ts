/**
 * Options for the tools that draw a shape rather than a stroke.
 */

import {
	GRADIENT_KINDS,
	SHAPE_KINDS,
} from '../../engine/paint-shapes';
import type { GradientKind, ShapeKind, ShapeStyle } from '../../engine/paint-shapes';
import { __ } from '../../i18n';
import {
	createCheckbox,
	createColourField,
	createNumberField,
	createSegmented,
	createSelect,
} from '../controls';
import { colourField, percentField } from './fields';
import type { OptionsBuilder } from './builder';

/**
 * Fill-or-outline, which both the path and shape tools offer.
 *
 * @param bar The bar being built.
 */
function styleToggle( bar: OptionsBuilder ): void {
	bar.add(
		createSegmented( {
			label: __( 'Style' ),
			value: bar.brush.shapeStyle,
			options: [
				{ value: 'fill', label: __( 'Fill' ) },
				{ value: 'stroke', label: __( 'Outline' ) },
			],
			onChange: ( value ) =>
				bar.setBrush( { shapeStyle: value as ShapeStyle }, true ),
		} )
	);
}

/**
 * The outline width.
 *
 * @param bar The bar being built.
 */
function widthField( bar: OptionsBuilder ): void {
	bar.add(
		createNumberField( {
			compact: true,
			label: __( 'Width' ),
			value: bar.brush.strokeWidth,
			min: 1,
			max: 200,
			suffix: 'px',
			onChange: ( value ) => bar.setBrush( { strokeWidth: value } ),
		} )
	);
}

/**
 * The path tool: fill or outline, width, colour.
 *
 * @param bar The bar being built.
 */
export function renderPathOptions( bar: OptionsBuilder ): void {
	styleToggle( bar );

	if ( 'stroke' === bar.brush.shapeStyle ) {
		widthField( bar );
	}

	bar.divider();
	colourField( bar );
	percentField( bar, 'opacity', __( 'Opacity' ), 1 );

	bar.hint( __( 'Click to place points, Enter to close and draw it.' ) );
}

/**
 * Gradient kind, endpoints and opacity.
 *
 * @param bar The bar being built.
 */
export function renderGradientOptions( bar: OptionsBuilder ): void {
	bar.add(
		createSegmented( {
			label: __( 'Ramp' ),
			value: bar.brush.gradient,
			options: GRADIENT_KINDS.map( ( entry ) => ( {
				value: entry.value,
				label: __( entry.label ),
			} ) ),
			onChange: ( value ) => bar.setBrush( { gradient: value as GradientKind } ),
		} )
	);

	bar.divider();
	colourField( bar );

	if ( ! bar.brush.gradientFade ) {
		const to = createColourField( {
			label: __( 'To' ),
			value: bar.brush.background,
			onChange: ( value ) => bar.setBrush( { background: value } ),
		} );

		bar.add( to, () => to.setValue( bar.brush.background ) );
	}

	bar.add(
		createCheckbox( {
			label: __( 'Fade out' ),
			checked: bar.brush.gradientFade,
			title: __( 'End transparent instead of at the background colour.' ),
			onChange: ( checked ) => bar.setBrush( { gradientFade: checked }, true ),
		} )
	);

	percentField( bar, 'opacity', __( 'Opacity' ), 1 );
	bar.hint( __( 'Drag to set the direction and length of the ramp.' ) );
}

/**
 * Shape kind, fill or outline, width and colour.
 *
 * @param bar The bar being built.
 */
export function renderShapeOptions( bar: OptionsBuilder ): void {
	bar.add(
		createSelect( {
			label: __( 'Shape' ),
			value: bar.brush.shapeKind,
			options: SHAPE_KINDS.map( ( entry ) => ( {
				value: entry.value,
				label: __( entry.label ),
			} ) ),
			onChange: ( value ) => bar.setBrush( { shapeKind: value as ShapeKind }, true ),
		} )
	);

	// A line has no interior, so offering to fill one would be a lie.
	if ( 'line' !== bar.brush.shapeKind ) {
		styleToggle( bar );
	}

	if ( 'line' === bar.brush.shapeKind || 'stroke' === bar.brush.shapeStyle ) {
		widthField( bar );
	}

	bar.divider();
	colourField( bar );
	percentField( bar, 'opacity', __( 'Opacity' ), 1 );

	bar.hint( __( 'Drag on the image. Hold Shift to keep it square.' ) );
}
