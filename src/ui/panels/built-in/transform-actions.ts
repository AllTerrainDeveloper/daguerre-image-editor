/**
 * The one-click transforms.
 *
 * Rotate, flip, fit and fill are all "compute a transform and set it", so they are a
 * table of actions rather than four near-identical button bodies.
 */

import { __ } from '../../../i18n';
import { coverScale, fitScale, normaliseAngle } from '../../../model/document';
import type { LayerTransform } from '../../../model/document';
import { activeLayer } from '../../../model/recipe';
import { createButton } from '../../controls';
import type { ButtonHandle } from '../../controls';
import type { PanelContext } from '../types';
import { buttonRow } from './shared';

/** A row of buttons and the handles that have to be released with it. */
export interface ActionRow {
	el: HTMLElement;
	handles: ButtonHandle[];
}

/**
 * Builds a row of buttons from a table of actions.
 *
 * @param actions Label, tooltip and what to run.
 */
function actionRow(
	actions: Array< { label: string; title: string; run: () => void } >
): ActionRow {
	const el = buttonRow();
	const handles = actions.map( ( action ) => {
		const button = createButton( {
			label: action.label,
			title: action.title,
			variant: 'secondary',
			onClick: action.run,
		} );

		el.appendChild( button.el );

		return button;
	} );

	return { el, handles };
}

/**
 * Rotate and flip, in quarter turns.
 *
 * @param ctx Panel context.
 */
export function rotateFlipRow( ctx: PanelContext ): ActionRow {
	const current = (): LayerTransform => activeLayer( ctx.getRecipe() ).transform;

	const quarter = ( direction: 1 | -1 ) => {
		const layer = current();

		ctx.setLayer( {
			...layer,
			rotation: normaliseAngle( layer.rotation + direction * 90 ),
		} );
	};

	return actionRow( [
		{ label: '⟲', title: __( 'Rotate left' ), run: () => quarter( -1 ) },
		{ label: '⟳', title: __( 'Rotate right' ), run: () => quarter( 1 ) },
		{
			label: '↔',
			title: __( 'Flip horizontally' ),
			run: () => ctx.setLayer( { ...current(), flipH: ! current().flipH } ),
		},
		{
			label: '↕',
			title: __( 'Flip vertically' ),
			run: () => ctx.setLayer( { ...current(), flipV: ! current().flipV } ),
		},
	] );
}

/**
 * Scale the image to fit inside, or cover, the canvas.
 *
 * @param ctx Panel context.
 */
export function fitFillRow( ctx: PanelContext ): ActionRow {
	const apply = ( compute: typeof fitScale ) => () => {
		const recipe = ctx.getRecipe();
		const value = compute( ctx.getImageSize(), recipe.canvas );

		ctx.setLayer( {
			...activeLayer( recipe ).transform,
			scaleX: value,
			scaleY: value,
			x: 0.5,
			y: 0.5,
		} );
	};

	return actionRow( [
		{
			label: __( 'Fit' ),
			title: __( 'Scale the image to fit inside the canvas' ),
			run: apply( fitScale ),
		},
		{
			label: __( 'Fill' ),
			title: __( 'Scale the image to cover the canvas' ),
			run: apply( coverScale ),
		},
	] );
}
