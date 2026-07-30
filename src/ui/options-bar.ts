/**
 * The contextual options bar.
 *
 * A horizontal strip under the toolbar whose contents change with the active tool,
 * in the manner of Photoshop's. It exists because the settings that matter while
 * you are using a tool should be within a few pixels of the canvas, not buried in a
 * sidebar panel you have to go and expand.
 *
 * The sidebar panels still hold the same settings and stay in sync -- this is a
 * second view of one model, not a second model. Every control comes from the adaptive
 * kit in `controls.ts`, so the whole bar is built from Desktop Mode components when
 * Desktop Mode is active and from plain inputs when it is not.
 */

import { BRUSH_SHAPES } from '../engine/brush';
import type { BrushShape } from '../engine/brush';
import {
	FONT_STACKS,
	GRADIENT_KINDS,
	SHAPE_KINDS,
} from '../engine/paint-shapes';
import type { GradientKind, ShapeKind, ShapeStyle } from '../engine/paint-shapes';
import { RETOUCH_MODES, TONE_MODES } from '../engine/pixel-tools';
import type { PixelOp } from '../engine/pixel-tools';
import { __ } from '../i18n';
import {
	createButton,
	createCheckbox,
	createColourField,
	createNumberField,
	createSegmented,
	createSelect,
} from './controls';
import { SELECTION_SHAPES } from '../model/selection';
import type { SelectionShape } from '../model/selection';
import type { ActiveTool, PanelContext } from './panels';

export interface OptionsBarOptions {
	ctx: PanelContext;
	getTool: () => ActiveTool;
	getSelectionShape: () => SelectionShape;
	setSelectionShape: ( shape: SelectionShape ) => void;
	hasSelection: () => boolean;
	deselect: () => void;
	selectAll: () => void;
	/** Whether the clone stamp has a sample point yet. */
	hasCloneSource: () => boolean;
	/** Forgets the clone sample point. */
	clearCloneSource: () => void;
	/** Zooms to a ratio of 1 canvas pixel per screen pixel, or fits the window. */
	setZoom: ( mode: 'fit' | 'actual' ) => void;
	/** Whether a caret is open on the canvas. */
	isTypingText: () => boolean;
}

/** A control this bar can tear down. */
interface Field {
	el: HTMLElement;
	destroy: () => void;
}

/**
 * A tool-sensitive strip of controls.
 */
export class OptionsBar {
	public readonly el: HTMLElement;

	private options: OptionsBarOptions;

	private offBrush: () => void;

	/** Live controls, so a rebuild can release their listeners first. */
	private fields: Field[] = [];

	/**
	 * Value updaters for the controls currently on the bar.
	 *
	 * A setting changed elsewhere -- the sidebar brush panel, or the eyedropper
	 * sampling a colour -- updates the control in place through these. Rebuilding the
	 * bar instead would be simpler and wrong: it destroys the element the user is
	 * typing into, so the text tool would lose focus and the caret after every
	 * keystroke. The bar is only rebuilt when the tool changes, or when a setting
	 * changes which controls exist at all -- and those are triggered from in here.
	 */
	private syncers: Array< () => void > = [];

	constructor( options: OptionsBarOptions ) {
		this.options = options;

		this.el = document.createElement( 'div' );
		this.el.className = 'lz-options';
		this.el.setAttribute( 'role', 'toolbar' );
		this.el.setAttribute( 'aria-label', __( 'Tool options' ) );

		// Keep the bar honest when a setting changes from the sidebar instead.
		this.offBrush = options.ctx.onBrushChange( () => this.sync() );

		this.render();
	}

	/** Rebuilds the bar for the current tool. */
	render = (): void => {
		const tool = this.options.getTool();

		for ( const field of this.fields ) {
			field.destroy();
		}

		this.fields = [];
		this.syncers = [];
		this.el.replaceChildren();

		const name = document.createElement( 'span' );
		name.className = 'lz-options__tool';
		name.textContent = TOOL_NAMES[ tool ] ? __( TOOL_NAMES[ tool ] ) : '';
		this.el.appendChild( name );

		switch ( tool ) {
			case 'select':
				this.renderSelectOptions();

				return;

			case 'wand':
				this.renderWandOptions();

				return;

			case 'brush':
			case 'eraser':
				this.renderBrushOptions( tool === 'eraser' );

				return;

			case 'history':
				this.renderHistoryOptions();

				return;

			case 'path':
				this.renderPathOptions();

				return;

			case 'retouch':
			case 'tone':
				this.renderPixelToolOptions( tool );

				return;

			case 'clone':
				this.renderCloneOptions();

				return;

			case 'fill':
				this.renderFillOptions();

				return;

			case 'gradient':
				this.renderGradientOptions();

				return;

			case 'shape':
				this.renderShapeOptions();

				return;

			case 'text':
				this.renderTextOptions();

				return;

			case 'zoom':
				this.renderZoomOptions();

				return;
		}

		this.hint( TOOL_HINTS[ tool ] ? __( TOOL_HINTS[ tool ] ) : '' );
	};

	/** Shape picker, plus select-all and deselect. */
	private renderSelectOptions(): void {
		// Segmented rather than a dropdown: four choices worth seeing at once, and a
		// shape you can identify without opening anything.
		this.add(
			createSegmented( {
				label: __( 'Shape' ),
				value: this.options.getSelectionShape(),
				options: SELECTION_SHAPES.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) => {
					this.options.setSelectionShape( value as SelectionShape );
					this.render();
				},
			} )
		);

		this.divider();
		this.addSelectionButtons();

		this.hint(
			this.options.getSelectionShape() === 'polygon'
				? __( 'Click to add points, Enter to close.' )
				: __( 'Drag on the image. Escape deselects.' )
		);
	}

	/** Tolerance for the wand, plus the same selection buttons. */
	private renderWandOptions(): void {
		this.addToleranceField();
		this.divider();
		this.addSelectionButtons();

		this.hint( __( 'Click a colour to select the region around it.' ) );
	}

	/** Select-all and deselect, shared by every selection tool. */
	private addSelectionButtons(): void {
		this.add(
			createButton( {
				label: __( 'Select all' ),
				variant: 'secondary',
				onClick: () => this.options.selectAll(),
			} )
		);

		const deselect = createButton( {
			label: __( 'Deselect' ),
			variant: 'ghost',
			onClick: () => {
				this.options.deselect();
				this.render();
			},
		} );

		// Disabled rather than hidden, so the control does not move around.
		deselect.setDisabled( ! this.options.hasSelection() );
		this.add( deselect );
	}

	/**
	 * Brush size, shape, hardness, opacity and colour.
	 *
	 * @param erasing Whether the eraser is active, which has no colour.
	 */
	private renderBrushOptions( erasing: boolean ): void {
		const brush = this.options.ctx.getBrush();

		const shape = createSegmented( {
			label: __( 'Shape' ),
			value: brush.shape,
			options: BRUSH_SHAPES.map( ( entry ) => ( {
				value: entry.value,
				label: __( entry.label ),
			} ) ),
			onChange: ( value ) =>
				this.options.ctx.setBrush( { shape: value as BrushShape } ),
		} );

		this.add( shape, () => shape.setValue( this.options.ctx.getBrush().shape ) );

		this.divider();
		this.addSizeField();
		this.addPercentField( 'hardness', __( 'Hardness' ), 0 );
		this.addPercentField( 'opacity', __( 'Opacity' ), 1 );

		if ( ! erasing ) {
			this.divider();
			this.addColourField();
		}
	}

	/**
	 * Mode, size, strength and hardness for the retouching and toning brushes.
	 *
	 * @param tool Which of the two.
	 */
	private renderPixelToolOptions( tool: 'retouch' | 'tone' ): void {
		const brush = this.options.ctx.getBrush();
		const modes = tool === 'retouch' ? RETOUCH_MODES : TONE_MODES;
		const key = tool === 'retouch' ? 'retouch' : 'tone';

		this.add(
			createSegmented( {
				label: __( 'Mode' ),
				value: brush[ key ],
				options: modes.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) =>
					this.options.ctx.setBrush( { [ key ]: value as PixelOp } ),
			} )
		);

		this.divider();
		this.addSizeField();
		this.addPercentField( 'strength', __( 'Strength' ), 0.5 );
		this.addPercentField( 'hardness', __( 'Hardness' ), 0 );

		this.hint(
			tool === 'retouch' && brush.retouch === 'heal'
				? __( 'Dab over a blemish; it fills from the pixels around it.' )
				: ''
		);
	}

	/** The history brush: size, strength, hardness. */
	private renderHistoryOptions(): void {
		this.addSizeField();
		this.addPercentField( 'strength', __( 'Strength' ), 1 );
		this.addPercentField( 'hardness', __( 'Hardness' ), 0 );

		this.hint(
			__( 'Paint the original image back, wherever it has been painted over.' )
		);
	}

	/** The path tool: fill or outline, width, colour. */
	private renderPathOptions(): void {
		const brush = this.options.ctx.getBrush();

		this.add(
			createSegmented( {
				label: __( 'Style' ),
				value: brush.shapeStyle,
				options: [
					{ value: 'fill', label: __( 'Fill' ) },
					{ value: 'stroke', label: __( 'Outline' ) },
				],
				onChange: ( value ) => {
					this.options.ctx.setBrush( { shapeStyle: value as ShapeStyle } );
					this.render();
				},
			} )
		);

		if ( brush.shapeStyle === 'stroke' ) {
			this.add(
				createNumberField( {
					compact: true,
					label: __( 'Width' ),
					value: brush.strokeWidth,
					min: 1,
					max: 200,
					suffix: 'px',
					onChange: ( value ) =>
						this.options.ctx.setBrush( { strokeWidth: value } ),
				} )
			);
		}

		this.divider();
		this.addColourField();
		this.addPercentField( 'opacity', __( 'Opacity' ), 1 );

		this.hint( __( 'Click to place points, Enter to close and draw it.' ) );
	}

	/** Clone stamp: size, strength, and the sample point. */
	private renderCloneOptions(): void {
		this.addSizeField();
		this.addPercentField( 'strength', __( 'Strength' ), 1 );
		this.addPercentField( 'hardness', __( 'Hardness' ), 0 );

		this.divider();

		const clear = createButton( {
			label: __( 'Clear source' ),
			variant: 'ghost',
			onClick: () => {
				this.options.clearCloneSource();
				this.render();
			},
		} );

		clear.setDisabled( ! this.options.hasCloneSource() );
		this.add( clear );

		this.hint(
			this.options.hasCloneSource()
				? __( 'Drag to paint from the sample point. Alt-click to move it.' )
				: __( 'Alt-click to set the point you want to copy from.' )
		);
	}

	/** Fill tolerance and colour. */
	private renderFillOptions(): void {
		this.addToleranceField();
		this.addPercentField( 'opacity', __( 'Opacity' ), 1 );
		this.divider();
		this.addColourField();
	}

	/** Gradient kind, endpoints and opacity. */
	private renderGradientOptions(): void {
		const brush = this.options.ctx.getBrush();

		this.add(
			createSegmented( {
				label: __( 'Ramp' ),
				value: brush.gradient,
				options: GRADIENT_KINDS.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) =>
					this.options.ctx.setBrush( { gradient: value as GradientKind } ),
			} )
		);

		this.divider();
		this.addColourField();

		if ( ! brush.gradientFade ) {
			const to = createColourField( {
				label: __( 'To' ),
				value: brush.background,
				onChange: ( value ) => this.options.ctx.setBrush( { background: value } ),
			} );

			this.add( to, () =>
				to.setValue( this.options.ctx.getBrush().background )
			);
		}

		this.add(
			createCheckbox( {
				label: __( 'Fade out' ),
				checked: brush.gradientFade,
				title: __( 'End transparent instead of at the background colour.' ),
				onChange: ( checked ) => {
					this.options.ctx.setBrush( { gradientFade: checked } );
					this.render();
				},
			} )
		);

		this.addPercentField( 'opacity', __( 'Opacity' ), 1 );
		this.hint( __( 'Drag to set the direction and length of the ramp.' ) );
	}

	/** Shape kind, fill or outline, width and colour. */
	private renderShapeOptions(): void {
		const brush = this.options.ctx.getBrush();

		this.add(
			createSelect( {
				label: __( 'Shape' ),
				value: brush.shapeKind,
				options: SHAPE_KINDS.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) => {
					this.options.ctx.setBrush( { shapeKind: value as ShapeKind } );
					this.render();
				},
			} )
		);

		// A line has no interior, so offering to fill one would be a lie.
		if ( brush.shapeKind !== 'line' ) {
			this.add(
				createSegmented( {
					label: __( 'Style' ),
					value: brush.shapeStyle,
					options: [
						{ value: 'fill', label: __( 'Fill' ) },
						{ value: 'stroke', label: __( 'Outline' ) },
					],
					onChange: ( value ) => {
						this.options.ctx.setBrush( { shapeStyle: value as ShapeStyle } );
						this.render();
					},
				} )
			);
		}

		if ( brush.shapeKind === 'line' || brush.shapeStyle === 'stroke' ) {
			this.add(
				createNumberField( {
					compact: true,
					label: __( 'Width' ),
					value: brush.strokeWidth,
					min: 1,
					max: 200,
					suffix: 'px',
					onChange: ( value ) =>
						this.options.ctx.setBrush( { strokeWidth: value } ),
				} )
			);
		}

		this.divider();
		this.addColourField();
		this.addPercentField( 'opacity', __( 'Opacity' ), 1 );

		this.hint( __( 'Drag on the image. Hold Shift to keep it square.' ) );
	}

	/** The text itself, its size, family and weight. */
	private renderTextOptions(): void {
		const brush = this.options.ctx.getBrush();


		this.add(
			createSelect( {
				label: __( 'Font' ),
				value: brush.fontFamily,
				options: FONT_STACKS.map( ( entry ) => ( {
					value: entry.value,
					label: __( entry.label ),
				} ) ),
				onChange: ( value ) => this.options.ctx.setBrush( { fontFamily: value } ),
			} )
		);

		this.add(
			createNumberField( {
				compact: true,
				label: __( 'Size' ),
				value: brush.fontSize,
				min: 6,
				max: 1200,
				suffix: 'px',
				onChange: ( value ) => this.options.ctx.setBrush( { fontSize: value } ),
			} )
		);

		this.add(
			createCheckbox( {
				label: __( 'Bold' ),
				checked: brush.bold,
				onChange: ( checked ) => this.options.ctx.setBrush( { bold: checked } ),
			} )
		);

		this.add(
			createCheckbox( {
				label: __( 'Italic' ),
				checked: brush.italic,
				onChange: ( checked ) => this.options.ctx.setBrush( { italic: checked } ),
			} )
		);

		this.divider();
		this.addColourField();

		// The font controls restyle the caret live, so the hint is about the gesture
		// rather than about a field that no longer exists.
		this.hint(
			this.options.isTypingText()
				? __( 'Enter for a new line. Cmd/Ctrl+Enter finishes, Escape cancels.' )
				: __( 'Click on the image and type.' )
		);
	}

	/** Fit and actual-size buttons. */
	private renderZoomOptions(): void {
		this.add(
			createButton( {
				label: __( 'Fit' ),
				variant: 'secondary',
				onClick: () => this.options.setZoom( 'fit' ),
			} )
		);

		this.add(
			createButton( {
				label: __( '100%' ),
				variant: 'secondary',
				onClick: () => this.options.setZoom( 'actual' ),
			} )
		);

		this.hint( __( 'Click to zoom in, Alt-click to zoom out.' ) );
	}

	/** The brush diameter, shared by every stroking tool. */
	private addSizeField(): void {
		const field = createNumberField( {
			compact: true,
			label: __( 'Size' ),
			value: this.options.ctx.getBrush().size,
			min: 1,
			max: 400,
			suffix: 'px',
			onChange: ( value ) => this.options.ctx.setBrush( { size: value } ),
		} );

		this.add( field, () => field.setValue( this.options.ctx.getBrush().size ) );
	}

	/** Flood fill and wand match tolerance. */
	private addToleranceField(): void {
		const field = createNumberField( {
			compact: true,
			label: __( 'Tolerance' ),
			value: this.options.ctx.getBrush().tolerance,
			min: 0,
			max: 128,
			onChange: ( value ) => this.options.ctx.setBrush( { tolerance: value } ),
		} );

		this.add( field, () => field.setValue( this.options.ctx.getBrush().tolerance ) );
	}

	/**
	 * A 0..1 setting shown as a percentage.
	 *
	 * @param key      Which setting.
	 * @param label    Field label.
	 * @param floorOne Whether zero is meaningless, so the field starts at 1%.
	 */
	private addPercentField(
		key: 'hardness' | 'opacity' | 'strength',
		label: string,
		floorOne: number
	): void {
		const field = createNumberField( {
			compact: true,
			label,
			value: Math.round( this.options.ctx.getBrush()[ key ] * 100 ),
			min: floorOne === 0 ? 0 : 1,
			max: 100,
			suffix: '%',
			onChange: ( value ) => this.options.ctx.setBrush( { [ key ]: value / 100 } ),
		} );

		this.add( field, () =>
			field.setValue( Math.round( this.options.ctx.getBrush()[ key ] * 100 ) )
		);
	}

	/**
	 * The foreground colour, which most tools paint with.
	 *
	 * @param label Optional. Field label.
	 */
	private addColourField( label = __( 'Colour' ) ): void {
		const field = createColourField( {
			label,
			value: this.options.ctx.getBrush().colour,
			onChange: ( value ) => this.options.ctx.setBrush( { colour: value } ),
		} );

		// Synced, because the eyedropper writes here from outside the bar.
		this.add( field, () => field.setValue( this.options.ctx.getBrush().colour ) );
	}

	/**
	 * Appends a muted hint.
	 *
	 * @param text Guidance text.
	 */
	private hint( text: string ): void {
		if ( ! text ) {
			return;
		}

		const hint = document.createElement( 'span' );

		hint.className = 'lz-options__hint';
		hint.textContent = text;
		this.el.appendChild( hint );
	}

	/** Pushes the current settings into the controls on the bar. */
	sync = (): void => {
		for ( const syncer of this.syncers ) {
			syncer();
		}
	};

	/**
	 * Adds a control and remembers it for teardown.
	 *
	 * @param handle The control.
	 * @param sync   Optional. Pushes the current setting into it.
	 */
	private add( handle: Field, sync?: () => void ): void {
		this.fields.push( handle );

		if ( sync ) {
			this.syncers.push( sync );
		}

		this.el.appendChild( handle.el );
	}

	/**
	 * A separator between groups of controls.
	 */
	private divider(): void {
		const rule = document.createElement( 'span' );
		rule.className = 'lz-options__divider';
		rule.setAttribute( 'aria-hidden', 'true' );
		this.el.appendChild( rule );
	}

	/** Releases listeners. */
	destroy(): void {
		this.offBrush();

		for ( const field of this.fields ) {
			field.destroy();
		}

		this.fields = [];
		this.el.remove();
	}
}

/** Tool names shown at the start of the bar. */
const TOOL_NAMES: Record< string, string > = {
	transform: 'Move & transform',
	select: 'Select',
	wand: 'Magic wand',
	crop: 'Crop',
	eyedropper: 'Eyedropper',
	retouch: 'Retouch',
	brush: 'Brush',
	history: 'History brush',
	clone: 'Clone stamp',
	eraser: 'Eraser',
	fill: 'Fill',
	gradient: 'Gradient',
	tone: 'Dodge & burn',
	text: 'Text',
	shape: 'Shape',
	path: 'Path',
	hand: 'Hand',
	zoom: 'Zoom',
};

/** One-line guidance for tools with no options of their own. */
const TOOL_HINTS: Record< string, string > = {
	transform:
		'Drag to move, corners scale, edges scale one axis, top handle rotates. Alt bypasses snapping.',
	crop: 'Drag a rectangle, then apply it from the Canvas & crop panel.',
	eyedropper: 'Click or drag to sample a colour into the foreground swatch.',
	hand: 'Drag to move the view. Scrolling does the same thing from any tool.',
};
