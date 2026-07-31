/**
 * The scalar adjustment panels.
 *
 * Adjustments and Effects are the same panel twice over a different slice of the op
 * schema, which is the whole point of keeping ops uniform: a new adjustment is a
 * schema entry and a display rule, not a new panel.
 */

import { __ } from '../../../i18n';
import { EFFECT_OP_ORDER, OP_LABELS, PANEL_OP_ORDER, getOp } from '../../../model/recipe';
import type { OpType } from '../../../model/recipe';
import { createSlider } from '../../controls';
import type { SliderHandle } from '../../controls';
import { registerPanel } from '../registry';
import type { PanelContext } from '../types';

/**
 * How each adjustment is presented.
 *
 * Recipes store canonical units (-1..1 for the gain-style adjustments, degrees for
 * hue) because that is what the maths wants. People think in percentages, so the
 * slider multiplies on the way out and divides on the way in.
 */
const OP_DISPLAY: Record< OpType, { scale: number; suffix: string; step: number } > = {
	exposure: { scale: 100, suffix: '', step: 1 },
	contrast: { scale: 100, suffix: '', step: 1 },
	temperature: { scale: 100, suffix: '', step: 1 },
	tint: { scale: 100, suffix: '', step: 1 },
	saturation: { scale: 100, suffix: '', step: 1 },
	vibrance: { scale: 100, suffix: '', step: 1 },
	hue: { scale: 1, suffix: '°', step: 1 },
	sharpen: { scale: 100, suffix: '', step: 1 },
	blur: { scale: 100, suffix: '', step: 1 },
	vignette: { scale: 100, suffix: '', step: 1 },
	grain: { scale: 100, suffix: '', step: 1 },
};

/**
 * Builds the slider row for one adjustment.
 *
 * @param type Op type.
 * @param ctx  Panel context.
 * @return The slider, or null when the server does not offer this op.
 */
function adjustmentSlider( type: OpType, ctx: PanelContext ): SliderHandle | null {
	const spec = ctx.payload.schema[ type ];

	// A filter can remove an op server-side. Offering a slider the server would
	// reject on save would be a trap.
	if ( ! spec ) {
		return null;
	}

	const display = OP_DISPLAY[ type ];

	return createSlider( {
		label: __( OP_LABELS[ type ] ),
		min: Math.round( spec.min * display.scale ),
		max: Math.round( spec.max * display.scale ),
		step: display.step,
		suffix: display.suffix,
		value: getOp( ctx.getRecipe(), type, ctx.payload.schema ) * display.scale,
		resetTo: Math.round( spec.default * display.scale ),
		onInput: ( value ) => ctx.setOp( type, value / display.scale ),
	} );
}

/**
 * Renders a list of scalar adjustments into a panel body.
 *
 * @param host  Panel body.
 * @param ctx   Panel context.
 * @param order Which ops to show, in order.
 * @return Teardown.
 */
export function renderAdjustments(
	host: HTMLElement,
	ctx: PanelContext,
	order: OpType[]
): () => void {
	const sliders = new Map< OpType, SliderHandle >();

	for ( const type of order ) {
		const slider = adjustmentSlider( type, ctx );

		if ( ! slider ) {
			continue;
		}

		sliders.set( type, slider );
		host.appendChild( slider.el );
	}

	// Undo, redo and reset change the recipe without touching the sliders, so the
	// panel follows the model rather than assuming it owns it.
	const off = ctx.onRecipeChange( ( recipe ) => {
		for ( const [ type, slider ] of sliders ) {
			const display = OP_DISPLAY[ type ];

			slider.setValue(
				Math.round( getOp( recipe, type, ctx.payload.schema ) * display.scale )
			);
		}
	} );

	return () => {
		off();

		for ( const slider of sliders.values() ) {
			slider.destroy();
		}
	};
}

/** Registers the Adjustments and Effects panels. */
export function registerAdjustmentPanels(): void {
	registerPanel( {
		id: 'adjustments',
		title: __( 'Adjustments' ),
		order: 20,
		render: ( host, ctx ) => renderAdjustments( host, ctx, PANEL_OP_ORDER ),
	} );

	registerPanel( {
		id: 'effects',
		title: __( 'Detail & effects' ),
		order: 60,
		defaultCollapsed: true,
		render: ( host, ctx ) => renderAdjustments( host, ctx, EFFECT_OP_ORDER ),
	} );
}
