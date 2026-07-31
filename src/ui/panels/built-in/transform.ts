/**
 * The Transform panel.
 */

import { __ } from '../../../i18n';
import { IDENTITY_TRANSFORM, MAX_SCALE, MIN_SCALE } from '../../../model/document';
import { activeLayer } from '../../../model/recipe';
import { createButton, createCheckbox, createSlider } from '../../controls';
import { TransformOverlay } from '../../transform-overlay';
import { registerPanel } from '../registry';
import type { PanelContext } from '../types';
import { toggleCollapsed } from './shared';
import { fitFillRow, rotateFlipRow } from './transform-actions';

/**
 * Puts the transform overlay on the stage and keeps it in step with the tool.
 *
 * Visible whenever transform owns the stage, which it does by default -- so an image
 * can be moved the moment it opens, without expanding a panel to unlock it. Only
 * another direct-manipulation tool takes it away.
 *
 * @param host Panel body.
 * @param ctx  Panel context.
 * @return Teardown.
 */
function attachOverlay( host: HTMLElement, ctx: PanelContext ): () => void {
	const overlay = new TransformOverlay( {
		stage: ctx.stage,
		getViewport: ctx.getViewport,
		getCanvas: () => ctx.getRecipe().canvas,
		getImageSize: ctx.getImageSize,
		getTransform: () => activeLayer( ctx.getRecipe() ).transform,
		// One label for the whole gesture, so History collapses it into a single undo
		// step rather than one per pointer move.
		onChange: ( layer ) => ctx.setLayer( layer, 'transform-drag' ),
		onCommit: () => {},
		getSnapping: () => ctx.getView().snapping,
	} );

	const offViewport = ctx.onViewportChange( overlay.sync );
	const offRecipe = ctx.onRecipeChange( overlay.sync );

	overlay.setVisible( 'transform' === ctx.getActiveTool() );

	const offTool = ctx.onActiveToolChange( ( tool ) =>
		overlay.setVisible( 'transform' === tool )
	);

	// Expanding this panel is also a way of asking for the tool back.
	const onToggle = ( event: Event ) => {
		if ( ! toggleCollapsed( event ) ) {
			ctx.setActiveTool( 'transform' );
		}
	};

	host.addEventListener( 'lz-panel-toggle', onToggle );

	return () => {
		host.removeEventListener( 'lz-panel-toggle', onToggle );
		offViewport();
		offRecipe();
		offTool();
		overlay.destroy();
	};
}

/** Registers the Transform panel. */
export function registerTransformPanel(): void {
	registerPanel( {
		id: 'transform',
		title: __( 'Transform' ),
		order: 30,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const detachOverlay = attachOverlay( host, ctx );
			const current = () => activeLayer( ctx.getRecipe() ).transform;

			const rotation = createSlider( {
				label: __( 'Rotation' ),
				min: -180,
				max: 180,
				step: 0.1,
				suffix: '°',
				value: current().rotation,
				resetTo: 0,
				onInput: ( value ) =>
					ctx.setLayer( { ...current(), rotation: value }, 'rotation' ),
			} );

			// Linked by default, because scaling a photograph unevenly is almost always
			// a mistake. Unlink to stretch one axis.
			let linked = true;

			const axisSlider = ( label: string, axis: 'scaleX' | 'scaleY' ) =>
				createSlider( {
					label,
					min: Math.round( MIN_SCALE * 100 ),
					max: Math.round( MAX_SCALE * 100 ),
					step: 1,
					suffix: '%',
					value: Math.round( current()[ axis ] * 100 ),
					resetTo: 100,
					onInput: ( value ) => {
						const layer = current();

						ctx.setLayer(
							linked
								? { ...layer, scaleX: value / 100, scaleY: value / 100 }
								: { ...layer, [ axis ]: value / 100 },
							'scale'
						);
					},
				} );

			const scaleX = axisSlider( __( 'Scale X' ), 'scaleX' );
			const scaleY = axisSlider( __( 'Scale Y' ), 'scaleY' );

			const link = createCheckbox( {
				label: __( 'Link scale axes' ),
				checked: true,
				title: __( 'Scale both axes together. Unlink to stretch one.' ),
				onChange: ( checked ) => {
					linked = checked;
				},
			} );

			const rotateFlip = rotateFlipRow( ctx );
			const fitFill = fitFillRow( ctx );

			const reset = createButton( {
				label: __( 'Reset transform' ),
				variant: 'ghost',
				onClick: () => ctx.setLayer( { ...IDENTITY_TRANSFORM } ),
			} );

			const offSliders = ctx.onRecipeChange( () => {
				const layer = current();

				rotation.setValue( Math.round( layer.rotation * 10 ) / 10 );
				scaleX.setValue( Math.round( layer.scaleX * 100 ) );
				scaleY.setValue( Math.round( layer.scaleY * 100 ) );
			} );

			host.append(
				rotateFlip.el,
				rotation.el,
				scaleX.el,
				scaleY.el,
				link.el,
				fitFill.el,
				reset.el
			);

			const controls = [
				rotation,
				scaleX,
				scaleY,
				link,
				reset,
				...rotateFlip.handles,
				...fitFill.handles,
			];

			return () => {
				detachOverlay();
				offSliders();

				for ( const control of controls ) {
					control.destroy();
				}
			};
		},
	} );
}
