/**
 * The canvas width and height fields.
 *
 * Resizing the canvas is not resizing the image: the layer keeps its own scale and is
 * repositioned to stay where it was, which is what `resizeCanvas()` works out. These
 * two fields are the only place that distinction is exposed as a direct edit.
 */

import { __ } from '../../../i18n';
import { MIN_CANVAS, resizeCanvas } from '../../../model/document';
import { activeLayer } from '../../../model/recipe';
import { createNumberField } from '../../controls';
import type { FieldHandle } from '../../controls';
import type { PanelContext } from '../types';

/** Largest canvas the fields will accept, in pixels per side. */
const MAX_CANVAS = 20000;

/** The size row and everything it owns. */
export interface CanvasSizeFields {
	el: HTMLElement;
	/** Pulls the displayed numbers back in line with the recipe. */
	sync: () => void;
	handles: FieldHandle[];
}

/**
 * Builds the width and height fields.
 *
 * The pending values are held here rather than read back off the recipe on every
 * keystroke: typing "1" on the way to "1200" would otherwise resize the canvas to a
 * single pixel and lose the layer's position doing it.
 *
 * @param ctx Panel context.
 */
export function createCanvasSizeFields( ctx: PanelContext ): CanvasSizeFields {
	let pendingWidth = ctx.getRecipe().canvas.width;
	let pendingHeight = ctx.getRecipe().canvas.height;

	const applySize = () => {
		const recipe = ctx.getRecipe();
		const next = resizeCanvas( recipe.canvas, activeLayer( recipe ).transform, {
			width: pendingWidth || recipe.canvas.width,
			height: pendingHeight || recipe.canvas.height,
		} );

		ctx.setDocument( next.canvas, next.transform );
	};

	const field = ( label: string, axis: 'width' | 'height' ) =>
		createNumberField( {
			label,
			value: 'width' === axis ? pendingWidth : pendingHeight,
			min: MIN_CANVAS,
			max: MAX_CANVAS,
			suffix: 'px',
			onChange: ( value ) => {
				if ( 'width' === axis ) {
					pendingWidth = value;
				} else {
					pendingHeight = value;
				}

				applySize();
			},
		} );

	const width = field( __( 'Width' ), 'width' );
	const height = field( __( 'Height' ), 'height' );

	const el = document.createElement( 'div' );
	el.className = 'lz-size';
	el.append( width.el, height.el );

	return {
		el,
		sync: () => {
			const canvas = ctx.getRecipe().canvas;

			pendingWidth = canvas.width;
			pendingHeight = canvas.height;
			width.setValue( canvas.width );
			height.setValue( canvas.height );
		},
		handles: [ width, height ],
	};
}
