/**
 * The panels Daguerre ships with.
 *
 * These use exactly the public `registerPanel()` API a third party would use --
 * there is no privileged path for built-ins. If Layers or Curves cannot be built
 * against this surface, the surface is wrong and should be widened rather than
 * bypassed.
 */

import { IDENTITY_LEVELS } from '../engine/lut';
import { BRUSH_SHAPES } from '../engine/brush';
import type { BrushShape } from '../engine/brush';
import { RETOUCH_MODES, TONE_MODES } from '../engine/pixel-tools';
import type { PixelOp } from '../engine/pixel-tools';
import {
	BASE_LAYER_ID,
	IDENTITY_TRANSFORM,
	MAX_SCALE,
	MIN_CANVAS,
	MIN_SCALE,
	applyCrop,
	centredCrop,
	coverScale,
	fitScale,
	normaliseAngle,
	reorderLayer,
	resizeCanvas,
	updateLayer,
} from '../model/document';
import type { CurvePoint, Curves } from '../engine/lut';
import { __, sprintf } from '../i18n';
import { EFFECT_OP_ORDER, OP_LABELS, PANEL_OP_ORDER, activeLayer, getOp } from '../model/recipe';
import type { OpType } from '../model/recipe';
import {
	createButton,
	createCheckbox,
	createColourField,
	createIconButton,
	createNumberField,
	createSection,
	createSelect,
	createSlider,
	createTextField,
} from './controls';
import type { IconButtonHandle, SliderHandle } from './controls';
import { CropOverlay } from './crop-overlay';
import { CurveEditor } from './curve-editor';
import { TransformOverlay } from './transform-overlay';
import { HistogramView } from './histogram-view';
import { registerPanel } from './panels';
import type { PanelContext } from './panels';

/**
 * Writes a value into a select without disturbing it if it already matches.
 *
 * The adaptive kit hides whether the control is a Desktop Mode component or a plain
 * `<select>`, so this looks for the underlying element either way.
 *
 * @param root  The field's root element.
 * @param value Value to select.
 */
function syncSelectValue( root: HTMLElement, value: string ): void {
	const select = root.querySelector( 'select' );

	if ( select ) {
		if ( select.value !== value ) {
			select.value = value;
		}

		return;
	}

	if ( root.getAttribute( 'value' ) !== value ) {
		root.setAttribute( 'value', value );
	}
}

/** Aspect presets offered in the crop panel. Zero means an unconstrained crop. */
const ASPECTS: Array< { value: string; label: string; ratio: number } > = [
	{ value: '0', label: __( 'Free' ), ratio: 0 },
	{ value: '1', label: __( 'Square' ), ratio: 1 },
	{ value: '1.7778', label: __( '16:9' ), ratio: 16 / 9 },
	{ value: '1.5', label: __( '3:2' ), ratio: 3 / 2 },
	{ value: '1.3333', label: __( '4:3' ), ratio: 4 / 3 },
	{ value: '0.8', label: __( '4:5 portrait' ), ratio: 4 / 5 },
];

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
 * Shared by the Adjustments and Effects panels: both are just a list of scalar ops
 * driven from the same schema, which is the whole point of keeping ops uniform.
 *
 * @param type Op type.
 * @param ctx  Panel context.
 * @return The slider, or null when the server does not offer this op.
 */
function adjustmentSlider(
	type: OpType,
	ctx: PanelContext
): SliderHandle | null {
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
function renderAdjustments(
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

/**
 * Registers the built-in panels.
 *
 * Idempotent: `registerPanel()` replaces by id, so calling this twice is harmless.
 */
export function registerBuiltInPanels(): void {
	registerPanel( {
		id: 'histogram',
		title: __( 'Histogram' ),
		order: 10,
		render: ( host, ctx ) => {
			const view = new HistogramView();
			host.appendChild( view.el );

			const off = ctx.onHistogram( ( histogram ) => view.update( histogram ) );

			return () => {
				off();
				view.destroy();
			};
		},
	} );

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

	registerPanel( {
		id: 'layers',
		title: __( 'Layers' ),
		order: 5,
		render: ( host, ctx ) => {
			const list = document.createElement( 'div' );
			list.className = 'dg-layers';

			/** Controls belonging to the rows currently drawn. */
			let rowHandles: IconButtonHandle[] = [];

			const draw = () => {
				list.replaceChildren();

				for ( const handle of rowHandles ) {
					handle.destroy();
				}

				rowHandles = [];

				// Front-most first, which is how every layers palette reads.
				for ( const layer of [ ...ctx.getLayers() ].reverse() ) {
					const row = document.createElement( 'div' );
					row.className = 'dg-layer';
					row.classList.toggle( 'is-active', layer.id === ctx.getActiveLayerId() );

					// The row's controls come from the adaptive kit, so a layers palette
					// inside Desktop Mode is built from its buttons rather than from
					// look-alikes. Each row is rebuilt on every change, so the handles
					// are collected for teardown instead of being held individually.
					const eye = createIconButton( {
						glyph: layer.visible ? '●' : '○',
						label: layer.visible ? __( 'Hide layer' ) : __( 'Show layer' ),
						className: 'dg-layer__eye',
						onClick: () =>
							ctx.setLayers(
								updateLayer( ctx.getLayers(), layer.id, {
									visible: ! layer.visible,
								} )
							),
					} );

					const name = document.createElement( 'button' );
					name.type = 'button';
					name.className = 'dg-layer__name';
					name.textContent = layer.name;
					name.addEventListener( 'click', () =>
						ctx.setLayers( ctx.getLayers(), layer.id )
					);

					const up = createIconButton( {
						glyph: '↑',
						label: __( 'Bring forward' ),
						className: 'dg-layer__move',
						onClick: () =>
							ctx.setLayers(
								reorderLayer( ctx.getLayers(), layer.id, 1 ),
								layer.id
							),
					} );

					const down = createIconButton( {
						glyph: '↓',
						label: __( 'Send backward' ),
						className: 'dg-layer__move',
						onClick: () =>
							ctx.setLayers(
								reorderLayer( ctx.getLayers(), layer.id, -1 ),
								layer.id
							),
					} );

					rowHandles.push( eye, up, down );
					row.append( eye.el, name, up.el, down.el );

					// The base image is the document's reason for existing; removing it
					// would leave an edit of nothing.
					if ( layer.id !== BASE_LAYER_ID ) {
						const remove = createIconButton( {
							glyph: '×',
							label: __( 'Delete layer' ),
							className: 'dg-layer__delete',
							onClick: () =>
								ctx.setLayers(
									ctx.getLayers().filter(
										( entry ) => entry.id !== layer.id
									)
								),
						} );

						rowHandles.push( remove );
						row.appendChild( remove.el );
					}

					list.appendChild( row );
				}
			};

			const add = createButton( {
				label: __( 'Add layer' ),
				variant: 'secondary',
				onClick: () => ctx.addLayer(),
			} );

			const hint = document.createElement( 'p' );
			hint.className = 'dg-hint';
			hint.textContent = __(
				'Painted and pasted layers are pixels, not settings — save a copy to keep them.'
			);

			const off = ctx.onRecipeChange( draw );

			draw();
			host.append( list, add.el, hint );

			return () => {
				for ( const handle of rowHandles ) {
					handle.destroy();
				}

				off();
				add.destroy();
			};
		},
	} );

	registerPanel( {
		id: 'brush',
		title: __( 'Brush' ),
		order: 8,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const shape = createSelect( {
				label: __( 'Shape' ),
				value: ctx.getBrush().shape,
				options: BRUSH_SHAPES.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) => ctx.setBrush( { shape: value as BrushShape } ),
			} );

			const size = createSlider( {
				label: __( 'Size' ),
				min: 1,
				max: 400,
				step: 1,
				suffix: 'px',
				value: ctx.getBrush().size,
				resetTo: 40,
				onInput: ( value ) => ctx.setBrush( { size: value } ),
			} );

			const hardness = createSlider( {
				label: __( 'Hardness' ),
				min: 0,
				max: 100,
				step: 1,
				suffix: '%',
				value: Math.round( ctx.getBrush().hardness * 100 ),
				resetTo: 60,
				onInput: ( value ) => ctx.setBrush( { hardness: value / 100 } ),
			} );

			const opacity = createSlider( {
				label: __( 'Opacity' ),
				min: 1,
				max: 100,
				step: 1,
				suffix: '%',
				value: Math.round( ctx.getBrush().opacity * 100 ),
				resetTo: 100,
				onInput: ( value ) => ctx.setBrush( { opacity: value / 100 } ),
			} );

			const strength = createSlider( {
				label: __( 'Strength' ),
				min: 1,
				max: 100,
				step: 1,
				suffix: '%',
				value: Math.round( ctx.getBrush().strength * 100 ),
				resetTo: 50,
				onInput: ( value ) => ctx.setBrush( { strength: value / 100 } ),
			} );

			const tolerance = createSlider( {
				label: __( 'Fill tolerance' ),
				min: 0,
				max: 128,
				step: 1,
				value: ctx.getBrush().tolerance,
				resetTo: 32,
				onInput: ( value ) => ctx.setBrush( { tolerance: value } ),
			} );

			const retouch = createSelect( {
				label: __( 'Retouch mode' ),
				value: ctx.getBrush().retouch,
				options: RETOUCH_MODES.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) => ctx.setBrush( { retouch: value as PixelOp } ),
			} );

			const tone = createSelect( {
				label: __( 'Dodge & burn mode' ),
				value: ctx.getBrush().tone,
				options: TONE_MODES.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) => ctx.setBrush( { tone: value as PixelOp } ),
			} );

			const colour = createColourField( {
				label: __( 'Colour' ),
				value: ctx.getBrush().colour,
				onChange: ( value ) => ctx.setBrush( { colour: value } ),
			} );

			// The options bar edits the same settings. Without this the two views
			// drift apart and the panel reports a brush nobody is using.
			const off = ctx.onBrushChange( ( brush ) => {
				size.setValue( Math.round( brush.size ) );
				hardness.setValue( Math.round( brush.hardness * 100 ) );
				opacity.setValue( Math.round( brush.opacity * 100 ) );
				strength.setValue( Math.round( brush.strength * 100 ) );
				tolerance.setValue( Math.round( brush.tolerance ) );

				colour.setValue( brush.colour );
				syncSelectValue( shape.el, brush.shape );
				syncSelectValue( retouch.el, brush.retouch );
				syncSelectValue( tone.el, brush.tone );
			} );

			host.append(
				shape.el,
				size.el,
				hardness.el,
				opacity.el,
				colour.el,
				createSection( __( 'Retouching' ) ),
				retouch.el,
				tone.el,
				strength.el,
				createSection( __( 'Fill' ) ),
				tolerance.el
			);

			return () => {
				off();
				shape.destroy();
				size.destroy();
				hardness.destroy();
				opacity.destroy();
				colour.destroy();
				strength.destroy();
				retouch.destroy();
				tone.destroy();
				tolerance.destroy();
			};
		},
	} );

	registerPanel( {
		id: 'transform',
		title: __( 'Transform' ),
		order: 30,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const overlay = new TransformOverlay( {
				stage: ctx.stage,
				getViewport: ctx.getViewport,
				getCanvas: () => ctx.getRecipe().canvas,
				getImageSize: ctx.getImageSize,
				getTransform: () => activeLayer( ctx.getRecipe() ).transform,
				// One label for the whole gesture, so History collapses it into a
				// single undo step rather than one per pointer move.
				onChange: ( layer ) => ctx.setLayer( layer, 'transform-drag' ),
				onCommit: () => {},
				getSnapping: () => ctx.getView().snapping,
			} );

			const offViewport = ctx.onViewportChange( overlay.sync );
			const offRecipe = ctx.onRecipeChange( overlay.sync );

			// Visible whenever transform owns the stage, which it does by default --
			// so an image can be moved the moment it opens, without expanding a panel
			// to unlock it. Only another direct-manipulation tool takes it away.
			overlay.setVisible( ctx.getActiveTool() === 'transform' );

			const offTool = ctx.onActiveToolChange( ( tool ) =>
				overlay.setVisible( tool === 'transform' )
			);

			// Expanding this panel is also a way of asking for the tool back.
			const onToggle = ( event: Event ) => {
				const { collapsed } = ( event as CustomEvent< { collapsed: boolean } > ).detail;

				if ( ! collapsed ) {
					ctx.setActiveTool( 'transform' );
				}
			};

			host.addEventListener( 'dg-panel-toggle', onToggle );

			const quarter = ( direction: 1 | -1 ) => {
				const layer = activeLayer( ctx.getRecipe() ).transform;

				ctx.setLayer( {
					...layer,
					rotation: normaliseAngle( layer.rotation + direction * 90 ),
				} );
			};

			const buttons = document.createElement( 'div' );
			buttons.className = 'dg-buttons';

			const handles = [
				{ label: '⟲', title: __( 'Rotate left' ), run: () => quarter( -1 ) },
				{ label: '⟳', title: __( 'Rotate right' ), run: () => quarter( 1 ) },
				{
					label: '↔',
					title: __( 'Flip horizontally' ),
					run: () => {
						const layer = activeLayer( ctx.getRecipe() ).transform;
						ctx.setLayer( { ...layer, flipH: ! layer.flipH } );
					},
				},
				{
					label: '↕',
					title: __( 'Flip vertically' ),
					run: () => {
						const layer = activeLayer( ctx.getRecipe() ).transform;
						ctx.setLayer( { ...layer, flipV: ! layer.flipV } );
					},
				},
			].map( ( action ) => {
				const button = createButton( {
					label: action.label,
					title: action.title,
					variant: 'secondary',
					onClick: action.run,
				} );

				buttons.appendChild( button.el );

				return button;
			} );

			const rotation = createSlider( {
				label: __( 'Rotation' ),
				min: -180,
				max: 180,
				step: 0.1,
				suffix: '°',
				value: activeLayer( ctx.getRecipe() ).transform.rotation,
				resetTo: 0,
				onInput: ( value ) =>
					ctx.setLayer( { ...activeLayer( ctx.getRecipe() ).transform, rotation: value }, 'rotation' ),
			} );

			const axisSlider = ( label: string, axis: 'scaleX' | 'scaleY' ) =>
				createSlider( {
					label,
					min: Math.round( MIN_SCALE * 100 ),
					max: Math.round( MAX_SCALE * 100 ),
					step: 1,
					suffix: '%',
					value: Math.round( activeLayer( ctx.getRecipe() ).transform[ axis ] * 100 ),
					resetTo: 100,
					onInput: ( value ) => {
						const layer = activeLayer( ctx.getRecipe() ).transform;

						// Linked by default, because scaling a photograph unevenly is
						// almost always a mistake. Unlink to stretch one axis.
						ctx.setLayer(
							linked
								? { ...layer, scaleX: value / 100, scaleY: value / 100 }
								: { ...layer, [ axis ]: value / 100 },
							'scale'
						);
					},
				} );

			let linked = true;

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

			const fitButtons = document.createElement( 'div' );
			fitButtons.className = 'dg-buttons';

			const fits = [
				{
					label: __( 'Fit' ),
					title: __( 'Scale the image to fit inside the canvas' ),
					compute: fitScale,
				},
				{
					label: __( 'Fill' ),
					title: __( 'Scale the image to cover the canvas' ),
					compute: coverScale,
				},
			].map( ( action ) => {
				const button = createButton( {
					label: action.label,
					title: action.title,
					variant: 'secondary',
					onClick: () => {
						const recipe = ctx.getRecipe();

						const value = action.compute( ctx.getImageSize(), recipe.canvas );

						ctx.setLayer( {
							...activeLayer( recipe ).transform,
							scaleX: value,
							scaleY: value,
							x: 0.5,
							y: 0.5,
						} );
					},
				} );

				fitButtons.appendChild( button.el );

				return button;
			} );

			const reset = createButton( {
				label: __( 'Reset transform' ),
				variant: 'ghost',
				onClick: () => ctx.setLayer( { ...IDENTITY_TRANSFORM } ),
			} );

			const offSliders = ctx.onRecipeChange( ( recipe ) => {
				rotation.setValue( Math.round( activeLayer( recipe ).transform.rotation * 10 ) / 10 );
				scaleX.setValue( Math.round( activeLayer( recipe ).transform.scaleX * 100 ) );
				scaleY.setValue( Math.round( activeLayer( recipe ).transform.scaleY * 100 ) );
			} );

			host.append(
				buttons,
				rotation.el,
				scaleX.el,
				scaleY.el,
				link.el,
				fitButtons,
				reset.el
			);

			return () => {
				host.removeEventListener( 'dg-panel-toggle', onToggle );
				offViewport();
				offRecipe();
				offSliders();
				offTool();
				overlay.destroy();
				rotation.destroy();
				scaleX.destroy();
				scaleY.destroy();
				link.destroy();
				reset.destroy();
				handles.forEach( ( handle ) => handle.destroy() );
				fits.forEach( ( fit ) => fit.destroy() );
			};
		},
	} );

	registerPanel( {
		id: 'canvas',
		title: __( 'Canvas & crop' ),
		order: 35,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const overlay = new CropOverlay( {
				stage: ctx.stage,
				getViewport: ctx.getViewport,
			} );

			const offViewport = ctx.onViewportChange( overlay.sync );

			overlay.setVisible( ctx.getActiveTool() === 'crop' );

			const offTool = ctx.onActiveToolChange( ( tool ) =>
				overlay.setVisible( tool === 'crop' )
			);

			// Opening this panel claims the stage; closing it hands it back, so the
			// two overlays never compete for the same pointer events.
			const onToggle = ( event: Event ) => {
				const { collapsed } = ( event as CustomEvent< { collapsed: boolean } > ).detail;

				if ( collapsed ) {
					ctx.setActiveTool( 'transform' );

					return;
				}

				// Start from the whole canvas rather than whatever rectangle was left
				// behind last time.
				overlay.setRect( { x: 0, y: 0, w: 1, h: 1 } );
				ctx.setActiveTool( 'crop' );
			};

			host.addEventListener( 'dg-panel-toggle', onToggle );

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

			const widthField = createNumberField( {
				label: __( 'Width' ),
				value: pendingWidth,
				min: MIN_CANVAS,
				max: 20000,
				suffix: 'px',
				onChange: ( value ) => {
					pendingWidth = value;
					applySize();
				},
			} );

			const heightField = createNumberField( {
				label: __( 'Height' ),
				value: pendingHeight,
				min: MIN_CANVAS,
				max: 20000,
				suffix: 'px',
				onChange: ( value ) => {
					pendingHeight = value;
					applySize();
				},
			} );

			const syncFields = () => {
				const { canvas } = ctx.getRecipe();

				pendingWidth = canvas.width;
				pendingHeight = canvas.height;
				widthField.setValue( canvas.width );
				heightField.setValue( canvas.height );
			};

			const size = document.createElement( 'div' );
			size.className = 'dg-size';
			size.append( widthField.el, heightField.el );

			const aspectSelect = createSelect( {
				label: __( 'Crop ratio' ),
				value: '0',
				options: ASPECTS.map( ( { value, label } ) => ( { value, label } ) ),
				onChange: ( value ) => {
					const aspect = Number( value );

					overlay.setAspect( aspect );

					if ( aspect > 0 ) {
						const { canvas } = ctx.getRecipe();

						overlay.setRect(
							centredCrop( aspect, canvas.width / canvas.height )
						);
					}
				},
			} );

			const applyCropButton = createButton( {
				label: __( 'Apply crop' ),
				variant: 'primary',
				onClick: () => {
					const recipe = ctx.getRecipe();
					const next = applyCrop( recipe.canvas, activeLayer( recipe ).transform, overlay.getRect() );

					ctx.setDocument( next.canvas, next.transform, 'crop' );
					overlay.setRect( { x: 0, y: 0, w: 1, h: 1 } );
				},
			} );

			const trim = createButton( {
				label: __( 'Fit canvas to image' ),
				variant: 'secondary',
				onClick: () => {
					const recipe = ctx.getRecipe();
					const image = ctx.getImageSize();

					ctx.setDocument(
						{
							width: Math.round( image.width * activeLayer( recipe ).transform.scaleX ),
							height: Math.round( image.height * activeLayer( recipe ).transform.scaleY ),
						},
						{ ...activeLayer( recipe ).transform, x: 0.5, y: 0.5 }
					);
				},
			} );

			const hint = document.createElement( 'p' );
			hint.className = 'dg-hint';
			hint.textContent = __(
				'Cropping resizes the canvas. The image itself is untouched — move or scale it with the Transform tool.'
			);

			const offRecipe = ctx.onRecipeChange( syncFields );

			syncFields();
			host.append( size, aspectSelect.el, applyCropButton.el, trim.el, hint );

			return () => {
				host.removeEventListener( 'dg-panel-toggle', onToggle );
				offViewport();
				offRecipe();
				offTool();
				overlay.destroy();
				widthField.destroy();
				heightField.destroy();
				aspectSelect.destroy();
				applyCropButton.destroy();
				trim.destroy();
			};
		},
	} );

	registerPanel( {
		id: 'curves',
		title: __( 'Curves' ),
		order: 40,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			let channel: keyof Curves = 'rgb';

			const pointsFor = ( which: keyof Curves ): CurvePoint[] =>
				ctx.getRecipe().curves[ which ] ?? [
					[ 0, 0 ],
					[ 255, 255 ],
				];

			const editor = new CurveEditor( {
				getPoints: () => pointsFor( channel ),
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

			const hint = document.createElement( 'p' );
			hint.className = 'dg-hint';
			hint.textContent = __(
				'Click to add a point, drag it well outside to remove it, double-click to reset.'
			);

			const offRecipe = ctx.onRecipeChange( editor.sync );

			host.append( picker.el, editor.el, hint );

			return () => {
				offRecipe();
				editor.destroy();
				picker.destroy();
			};
		},
	} );

	registerPanel( {
		id: 'levels',
		title: __( 'Levels' ),
		order: 50,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const make = (
				label: string,
				key: 'black' | 'white' | 'gamma',
				min: number,
				max: number,
				step: number,
				scale: number
			) =>
				createSlider( {
					label,
					min,
					max,
					step,
					value: ctx.getRecipe().levels[ key ] * scale,
					resetTo: IDENTITY_LEVELS[ key ] * scale,
					onInput: ( value ) =>
						ctx.setLevels( {
							...ctx.getRecipe().levels,
							[ key ]: value / scale,
						} ),
				} );

			const black = make( __( 'Black point' ), 'black', 0, 254, 1, 1 );
			const white = make( __( 'White point' ), 'white', 1, 255, 1, 1 );
			// Gamma is stored as a multiplier but shown as a percentage, so the
			// slider can step in units a person can aim at.
			const gamma = make( __( 'Midtones' ), 'gamma', 10, 400, 1, 100 );

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

	registerPanel( {
		id: 'output',
		title: __( 'Output' ),
		order: 80,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const format = createSelect( {
				label: __( 'Format' ),
				value: ctx.getRecipe().output.format,
				options: [
					{ value: 'image/jpeg', label: __( 'JPEG — smallest, no transparency' ) },
					{ value: 'image/png', label: __( 'PNG — lossless, keeps transparency' ) },
					{ value: 'image/webp', label: __( 'WebP — small and lossless-capable' ) },
				],
				onChange: ( value ) => {
					ctx.setOutput( { format: value } );
					syncQuality();
				},
			} );

			const quality = createSlider( {
				label: __( 'Quality' ),
				min: 10,
				max: 100,
				step: 1,
				suffix: '%',
				value: Math.round( ctx.getRecipe().output.quality * 100 ),
				resetTo: 92,
				onInput: ( value ) => ctx.setOutput( { quality: value / 100 } ),
			} );

			// PNG is lossless, so the encoder ignores quality entirely. A live-looking
			// slider that silently does nothing is worse than no slider.
			const syncQuality = () => {
				quality.el.hidden = ctx.getRecipe().output.format === 'image/png';
			};

			host.append( format.el, quality.el );
			syncQuality();

			return () => {
				format.destroy();
				quality.destroy();
			};
		},
	} );

	registerPanel( {
		id: 'presets',
		title: __( 'Presets' ),
		order: 70,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const list = document.createElement( 'div' );
			list.className = 'dg-presets';

			/** Controls belonging to the rows currently drawn. */
			let rowHandles: Array< { destroy: () => void } > = [];

			let presetName = '';

			const status = document.createElement( 'p' );
			status.className = 'dg-hint';

			const refresh = async () => {
				list.replaceChildren();

				for ( const handle of rowHandles ) {
					handle.destroy();
				}

				rowHandles = [];

				let presets;

				try {
					presets = await ctx.listPresets();
				} catch ( error ) {
					status.textContent =
						error instanceof Error ? error.message : __( 'Presets could not be loaded.' );

					return;
				}

				if ( presets.length === 0 ) {
					status.textContent = __(
						'No presets yet. Adjust an image, then save the look to reuse it.'
					);

					return;
				}

				status.textContent = '';

				for ( const preset of presets ) {
					const row = document.createElement( 'div' );
					row.className = 'dg-preset';

					const apply = createButton( {
						label: preset.name,
						variant: 'ghost',
						onClick: () => ctx.applyPreset( preset ),
					} );

					apply.el.classList.add( 'dg-preset__apply' );

					const remove = createIconButton( {
						glyph: '×',
						label: sprintf( __( 'Delete “%s”' ), preset.name ),
						className: 'dg-preset__delete',
						onClick: async () => {
							await ctx.deletePreset( preset.id );
							await refresh();
						},
					} );

					rowHandles.push( apply, remove );
					row.append( apply.el, remove.el );
					list.appendChild( row );
				}
			};

			const name = createTextField( {
				label: __( 'Preset name' ),
				value: '',
				placeholder: __( 'Name this look' ),
				onChange: ( value ) => {
					presetName = value;
				},
			} );

			const save = createButton( {
				label: __( 'Save look' ),
				variant: 'secondary',
				onClick: async () => {
					if ( ! presetName.trim() ) {
						return;
					}

					try {
						await ctx.savePreset( presetName );
						presetName = '';
						name.setValue( '' );
						await refresh();
					} catch ( error ) {
						status.textContent =
							error instanceof Error ? error.message : __( 'The preset could not be saved.' );
					}
				},
			} );

			host.append( list, status, name.el, save.el );
			void refresh();

			return () => {
				for ( const handle of rowHandles ) {
					handle.destroy();
				}

				name.destroy();
				save.destroy();
			};
		},
	} );

	registerPanel( {
		id: 'view',
		title: __( 'View' ),
		order: 85,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const toggle = ( label: string, key: 'rulers' | 'snapping', hint: string ) =>
				createCheckbox( {
					label,
					title: hint,
					checked: ctx.getView()[ key ],
					onChange: ( checked ) => ctx.setView( { [ key ]: checked } ),
				} );

			const rulers = toggle(
				__( 'Rulers' ),
				'rulers',
				__( 'Marked in canvas pixels.' )
			);
			const snapping = toggle(
				__( 'Snapping' ),
				'snapping',
				__( 'Snap a moved layer to the canvas edges and centre. Hold Alt to bypass.' )
			);

			host.append( rulers.el, snapping.el );

			return () => {
				rulers.destroy();
				snapping.destroy();
			};
		},
	} );

	registerPanel( {
		id: 'info',
		title: __( 'Image info' ),
		order: 90,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const { payload } = ctx;

			const rows: Array< [ string, string ] > = [
				[
					__( 'Dimensions' ),
					sprintf( '%1$d × %2$d', payload.width, payload.height ),
				],
				[ __( 'Format' ), payload.mime.replace( 'image/', '' ).toUpperCase() ],
				[
					__( 'Megapixels' ),
					( ( payload.width * payload.height ) / 1_000_000 ).toFixed( 1 ),
				],
			];

			if ( payload.sourceId !== payload.id ) {
				rows.push( [ __( 'Edited from' ), `#${ payload.sourceId }` ] );
			}

			const list = document.createElement( 'dl' );
			list.className = 'dg-info';

			for ( const [ term, value ] of rows ) {
				const dt = document.createElement( 'dt' );
				dt.textContent = term;

				const dd = document.createElement( 'dd' );
				dd.textContent = value;

				list.append( dt, dd );
			}

			host.appendChild( list );
		},
	} );
}
