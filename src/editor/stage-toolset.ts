/**
 * Everything that lives on the stage.
 *
 * The tool rail, the rulers, the options bar, the painting controller, the text caret
 * and the brush ring. They are built together because they all need the same three
 * things -- the viewport, the canvas size and the active tool -- and wiring each of
 * them to those separately is how two of them end up disagreeing about where the
 * canvas is.
 */

import { BrushCursor } from '../ui/brush-cursor';
import { OptionsBar } from '../ui/options-bar';
import { Rulers } from '../ui/rulers';
import { StageTools } from '../ui/stage-tools';
import { TextEditor } from '../ui/text-editor';
import { ToolRail } from '../ui/tool-rail';
import type { StageToolsOptions } from '../ui/stage-tools';
import type { ToolRailOptions } from '../ui/tool-rail';
import type { OptionsBarOptions } from '../ui/options-bar';
import type { TextEditorOptions } from '../ui/text-editor';
import type { CanvasSize } from '../model/document';
import type { ActiveTool, Viewport } from '../ui/panels';
import type { BrushSettings } from '../ui/stage-tools';

/** The shared reads every stage widget needs. */
export interface StageFrame {
	stage: HTMLElement;
	/** Null before the renderer has measured anything. */
	getViewport: () => Viewport | null;
	getCanvas: () => CanvasSize;
	getTool: () => ActiveTool;
	getBrush: () => BrushSettings;
}

export interface StageToolsetOptions {
	frame: StageFrame;
	/** Where the tool rail is prepended. */
	body: HTMLElement;
	/** The element the options bar is inserted after. */
	topbar: HTMLElement;
	rail: ToolRailOptions;
	optionsBar: Omit< OptionsBarOptions, 'getTool' >;
	tools: Omit<
		StageToolsOptions,
		'stage' | 'getViewport' | 'getCanvas' | 'getTool' | 'getBrush'
	>;
	text: Omit< TextEditorOptions, 'stage' | 'getViewport' | 'getCanvas' >;
}

/**
 * The stage widgets, built and wired.
 */
export class StageToolset {
	readonly rail: ToolRail;

	readonly rulers: Rulers;

	readonly optionsBar: OptionsBar;

	readonly tools: StageTools;

	readonly text: TextEditor;

	readonly cursor: BrushCursor;

	/**
	 * @param options Toolset configuration.
	 */
	constructor( options: StageToolsetOptions ) {
		const { frame } = options;

		this.rail = new ToolRail( options.rail );
		options.body.prepend( this.rail.el );
		frame.stage.dataset.tool = frame.getTool();

		this.rulers = new Rulers( {
			stage: frame.stage,
			getViewport: frame.getViewport,
			getCanvas: frame.getCanvas,
		} );

		this.optionsBar = new OptionsBar( {
			...options.optionsBar,
			getTool: frame.getTool,
		} );
		options.topbar.after( this.optionsBar.el );

		this.tools = new StageTools( {
			...options.tools,
			stage: frame.stage,
			getViewport: frame.getViewport,
			getCanvas: frame.getCanvas,
			getTool: frame.getTool,
			getBrush: frame.getBrush,
		} );

		this.text = new TextEditor( {
			...options.text,
			stage: frame.stage,
			getViewport: frame.getViewport,
			getCanvas: frame.getCanvas,
		} );

		this.cursor = new BrushCursor( {
			stage: frame.stage,
			getViewport: frame.getViewport,
			getCanvas: frame.getCanvas,
			getTool: frame.getTool,
			getBrush: frame.getBrush,
		} );
	}

	/**
	 * Shows or hides the rulers.
	 *
	 * @param visible Whether the rulers are on.
	 */
	setRulersVisible( visible: boolean ): void {
		this.rulers.setVisible( visible );
	}

	/** Redraws whatever tracks the viewport. */
	readonly redraw = (): void => {
		this.rulers.draw();
		this.cursor.draw();
		this.text.restyle();
	};

	/** Releases every widget. */
	destroy(): void {
		this.tools.destroy();
		this.rail.destroy();
		this.optionsBar.destroy();
		this.rulers.destroy();
		this.cursor.destroy();
		this.text.destroy();
	}
}
