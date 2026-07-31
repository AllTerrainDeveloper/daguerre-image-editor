/**
 * The Canvas & crop panel.
 */

import { __ } from '../../../i18n';
import { applyCrop, centredCrop } from '../../../model/document';
import { activeLayer } from '../../../model/recipe';
import { createButton, createSelect } from '../../controls';
import { CropOverlay } from '../../crop-overlay';
import { registerPanel } from '../registry';
import type { PanelContext } from '../types';
import { createCanvasSizeFields } from './canvas-size';
import { hintText, toggleCollapsed } from './shared';

/** Aspect presets offered in the crop panel. Zero means an unconstrained crop. */
const ASPECTS: Array< { value: string; label: string; ratio: number } > = [
	{ value: '0', label: __( 'Free' ), ratio: 0 },
	{ value: '1', label: __( 'Square' ), ratio: 1 },
	{ value: '1.7778', label: __( '16:9' ), ratio: 16 / 9 },
	{ value: '1.5', label: __( '3:2' ), ratio: 3 / 2 },
	{ value: '1.3333', label: __( '4:3' ), ratio: 4 / 3 },
	{ value: '0.8', label: __( '4:5 portrait' ), ratio: 4 / 5 },
];

/** The whole canvas, as a crop rectangle. */
const WHOLE_CANVAS = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Puts the crop overlay on the stage.
 *
 * Opening this panel claims the stage; closing it hands it back, so the crop and
 * transform overlays never compete for the same pointer events.
 *
 * @param host Panel body.
 * @param ctx  Panel context.
 * @return The overlay and its teardown.
 */
function attachOverlay(
	host: HTMLElement,
	ctx: PanelContext
): { overlay: CropOverlay; detach: () => void } {
	const overlay = new CropOverlay( {
		stage: ctx.stage,
		getViewport: ctx.getViewport,
	} );

	const offViewport = ctx.onViewportChange( overlay.sync );

	overlay.setVisible( 'crop' === ctx.getActiveTool() );

	const offTool = ctx.onActiveToolChange( ( tool ) =>
		overlay.setVisible( 'crop' === tool )
	);

	const onToggle = ( event: Event ) => {
		if ( toggleCollapsed( event ) ) {
			ctx.setActiveTool( 'transform' );

			return;
		}

		// Start from the whole canvas rather than whatever rectangle was left behind
		// last time.
		overlay.setRect( { ...WHOLE_CANVAS } );
		ctx.setActiveTool( 'crop' );
	};

	host.addEventListener( 'lz-panel-toggle', onToggle );

	return {
		overlay,
		detach: () => {
			host.removeEventListener( 'lz-panel-toggle', onToggle );
			offViewport();
			offTool();
			overlay.destroy();
		},
	};
}

/** Registers the Canvas & crop panel. */
export function registerCanvasPanel(): void {
	registerPanel( {
		id: 'canvas',
		title: __( 'Canvas & crop' ),
		order: 35,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const { overlay, detach } = attachOverlay( host, ctx );
			const size = createCanvasSizeFields( ctx );

			const aspectSelect = createSelect( {
				label: __( 'Crop ratio' ),
				value: '0',
				options: ASPECTS.map( ( { value, label } ) => ( { value, label } ) ),
				onChange: ( value ) => {
					const aspect = Number( value );

					overlay.setAspect( aspect );

					if ( aspect > 0 ) {
						const { canvas } = ctx.getRecipe();

						overlay.setRect( centredCrop( aspect, canvas.width / canvas.height ) );
					}
				},
			} );

			const applyCropButton = createButton( {
				label: __( 'Apply crop' ),
				variant: 'primary',
				onClick: () => {
					const recipe = ctx.getRecipe();
					const next = applyCrop(
						recipe.canvas,
						activeLayer( recipe ).transform,
						overlay.getRect()
					);

					ctx.setDocument( next.canvas, next.transform, 'crop' );
					overlay.setRect( { ...WHOLE_CANVAS } );
				},
			} );

			const trim = createButton( {
				label: __( 'Fit canvas to image' ),
				variant: 'secondary',
				onClick: () => {
					const recipe = ctx.getRecipe();
					const image = ctx.getImageSize();
					const transform = activeLayer( recipe ).transform;

					ctx.setDocument(
						{
							width: Math.round( image.width * transform.scaleX ),
							height: Math.round( image.height * transform.scaleY ),
						},
						{ ...transform, x: 0.5, y: 0.5 }
					);
				},
			} );

			const offRecipe = ctx.onRecipeChange( size.sync );

			size.sync();
			host.append(
				size.el,
				aspectSelect.el,
				applyCropButton.el,
				trim.el,
				hintText(
					__(
						'Cropping resizes the canvas. The image itself is untouched — move or scale it with the Transform tool.'
					)
				)
			);

			const controls = [ ...size.handles, aspectSelect, applyCropButton, trim ];

			return () => {
				detach();
				offRecipe();

				for ( const control of controls ) {
					control.destroy();
				}
			};
		},
	} );
}
