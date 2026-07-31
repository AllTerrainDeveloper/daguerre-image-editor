/**
 * The Curves and Levels panels.
 *
 * Together because they are two views of the same question -- where the tones land --
 * and because a change to one is almost always a change to the other.
 */

import { IDENTITY_LEVELS } from '../../../engine/lut';
import type { CurvePoint, Curves } from '../../../engine/lut';
import { __ } from '../../../i18n';
import { createSelect, createSlider } from '../../controls';
import { CurveEditor } from '../../curve-editor';
import { registerPanel } from '../registry';
import type { PanelContext } from '../types';
import { hintText } from './shared';

/** A straight line through the tone range, used when a channel has no curve yet. */
const IDENTITY_CURVE: CurvePoint[] = [
	[ 0, 0 ],
	[ 255, 255 ],
];

/** Registers the Curves panel. */
function registerCurvesPanel(): void {
	registerPanel( {
		id: 'curves',
		title: __( 'Curves' ),
		order: 40,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			let channel: keyof Curves = 'rgb';

			const editor = new CurveEditor( {
				getPoints: () => ctx.getRecipe().curves[ channel ] ?? IDENTITY_CURVE,
				onChange: ( points ) => ctx.setCurve( channel, points ),
				onCommit: () => {},
			} );

			const picker = createSelect( {
				label: __( 'Channel' ),
				value: 'rgb',
				options: [
					{ value: 'rgb', label: __( 'RGB' ) },
					{ value: 'r', label: __( 'Red' ) },
					{ value: 'g', label: __( 'Green' ) },
					{ value: 'b', label: __( 'Blue' ) },
				],
				onChange: ( value ) => {
					channel = value as keyof Curves;
					editor.sync();
				},
			} );

			const offRecipe = ctx.onRecipeChange( editor.sync );

			host.append(
				picker.el,
				editor.el,
				hintText(
					__(
						'Click to add a point, drag it well outside to remove it, double-click to reset.'
					)
				)
			);

			return () => {
				offRecipe();
				editor.destroy();
				picker.destroy();
			};
		},
	} );
}

/**
 * One levels slider.
 *
 * @param ctx   Panel context.
 * @param label Visible label.
 * @param key   Which levels field it drives.
 * @param min   Lowest displayed value.
 * @param max   Highest displayed value.
 * @param scale Display units per stored unit.
 */
function levelsSlider(
	ctx: PanelContext,
	label: string,
	key: 'black' | 'white' | 'gamma',
	min: number,
	max: number,
	scale: number
) {
	return createSlider( {
		label,
		min,
		max,
		step: 1,
		value: ctx.getRecipe().levels[ key ] * scale,
		resetTo: IDENTITY_LEVELS[ key ] * scale,
		onInput: ( value ) =>
			ctx.setLevels( { ...ctx.getRecipe().levels, [ key ]: value / scale } ),
	} );
}

/** Registers the Levels panel. */
function registerLevelsPanel(): void {
	registerPanel( {
		id: 'levels',
		title: __( 'Levels' ),
		order: 50,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const black = levelsSlider( ctx, __( 'Black point' ), 'black', 0, 254, 1 );
			const white = levelsSlider( ctx, __( 'White point' ), 'white', 1, 255, 1 );
			// Gamma is stored as a multiplier but shown as a percentage, so the slider
			// can step in units a person can aim at.
			const gamma = levelsSlider( ctx, __( 'Midtones' ), 'gamma', 10, 400, 100 );

			const offRecipe = ctx.onRecipeChange( ( recipe ) => {
				black.setValue( recipe.levels.black );
				white.setValue( recipe.levels.white );
				gamma.setValue( Math.round( recipe.levels.gamma * 100 ) );
			} );

			host.append( black.el, white.el, gamma.el );

			return () => {
				offRecipe();
				black.destroy();
				white.destroy();
				gamma.destroy();
			};
		},
	} );
}

/** Registers the tone panels. */
export function registerTonePanels(): void {
	registerCurvesPanel();
	registerLevelsPanel();
}
