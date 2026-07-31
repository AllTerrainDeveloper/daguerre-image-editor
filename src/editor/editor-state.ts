/**
 * The editor's own state, as opposed to the document's.
 *
 * Which tool has the stage, what the brush is set to, whether the rulers are on,
 * whether the marquee is shown as a mask, whether the editor fills the screen. None of
 * it is saved with the image and none of it is undoable -- it describes how someone is
 * working, not what the picture should look like.
 *
 * It is a class rather than five fields on the editor because every one of these has
 * both listeners and side effects, and keeping the pair together is what stops the
 * options bar and the sidebar panel from showing two different brushes.
 */

import type { ActiveTool, ViewPrefs } from '../ui/panels';
import { defaultBrush } from '../ui/stage-tools';
import type { BrushSettings } from '../ui/stage-tools';
import { readViewPrefs, writeViewPrefs } from './prefs';
import { Subscribers } from './subscribers';

/** The side effects a state change has outside this object. */
export interface StateEffects {
	/** Called when the active tool changes, before the listeners. */
	onToolChange: ( tool: ActiveTool ) => void;
	/** Called when the rulers or snapping preference changes. */
	onViewChange: ( view: ViewPrefs ) => void;
	/** Called when the quick mask is turned on or off. */
	onQuickMaskChange: ( on: boolean ) => void;
	/** Called when the editor is expanded or restored. */
	onFullScreenChange: ( on: boolean ) => void;
}

/**
 * Everything about the editor that is not the document.
 */
export class EditorUiState {
	/** Fired when the active tool changes. */
	readonly tools = new Subscribers< [ ActiveTool ] >();

	/** Fired when any brush setting changes, from the panel or the options bar. */
	readonly brushes = new Subscribers< [ BrushSettings ] >();

	/**
	 * Which tool owns the stage.
	 *
	 * Transform by default: an image you have just opened should be draggable
	 * immediately, without hunting for a panel to expand first.
	 */
	private tool: ActiveTool = 'transform';

	/**
	 * Shared by every drawing tool.
	 *
	 * One object rather than one per tool, because the settings overlap almost
	 * completely -- size, opacity and colour belong to nearly all of them -- and
	 * because the options bar and the sidebar panel are then two views of one model.
	 */
	private brush: BrushSettings = defaultBrush();

	/** Rulers and snapping. Presentation, so persisted locally rather than saved. */
	private view: ViewPrefs = readViewPrefs();

	/**
	 * Whether the selection is shown as a translucent red overlay.
	 *
	 * Marching ants tell you where an edge is; a quick mask tells you how soft it is,
	 * which an outline cannot show at all.
	 */
	private mask = false;

	/** Whether the editor has been expanded to fill the screen. */
	private expanded = false;

	private effects: StateEffects;

	/**
	 * @param effects What each change has to do outside this object.
	 */
	constructor( effects: StateEffects ) {
		this.effects = effects;
	}

	/** Which tool owns the stage. */
	getTool(): ActiveTool {
		return this.tool;
	}

	/**
	 * Hands the stage to a tool.
	 *
	 * @param tool Tool to activate.
	 */
	setTool( tool: ActiveTool ): void {
		if ( this.tool === tool ) {
			return;
		}

		const previous = this.tool;

		this.tool = tool;
		this.effects.onToolChange( previous );
		this.tools.emit( tool );
	}

	/** The shared brush settings. */
	getBrush(): BrushSettings {
		return this.brush;
	}

	/**
	 * Changes the shared brush settings.
	 *
	 * @param patch Fields to change.
	 */
	setBrush( patch: Partial< BrushSettings > ): void {
		this.brush = { ...this.brush, ...patch };
		this.brushes.emit( this.brush );
	}

	/** Rulers and snapping. */
	getView(): ViewPrefs {
		return this.view;
	}

	/**
	 * Changes a view preference.
	 *
	 * @param patch Fields to change.
	 */
	setView( patch: Partial< ViewPrefs > ): void {
		this.view = { ...this.view, ...patch };

		writeViewPrefs( this.view );
		this.effects.onViewChange( this.view );
	}

	/** Whether the selection is shown as a red overlay. */
	getQuickMask(): boolean {
		return this.mask;
	}

	/**
	 * Shows or hides the selection as a red overlay.
	 *
	 * @param on Whether to show it.
	 */
	setQuickMask( on: boolean ): void {
		this.mask = on;
		this.effects.onQuickMaskChange( on );
	}

	/** Whether the editor fills the screen. */
	getFullScreen(): boolean {
		return this.expanded;
	}

	/**
	 * Expands the editor to fill the screen, or gives the space back.
	 *
	 * @param on Whether to fill the screen.
	 */
	setFullScreen( on: boolean ): void {
		this.expanded = on;
		this.effects.onFullScreenChange( on );
	}

	/** Drops every listener. */
	clear(): void {
		this.tools.clear();
		this.brushes.clear();
	}
}
