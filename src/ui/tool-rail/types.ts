/**
 * What the tool rail is wired to.
 */

import type { SwatchesOptions } from '../swatches';
import type { ActiveTool } from '../panels';

export interface ToolRailOptions extends SwatchesOptions {
	/** Called when a tool is chosen. */
	onSelect: ( tool: ActiveTool ) => void;
	/** The tool currently active. */
	getActive: () => ActiveTool;
	/** Whether the selection is shown as a red overlay rather than as an outline. */
	getQuickMask: () => boolean;
	/** Turns the quick mask on or off. */
	setQuickMask: ( on: boolean ) => void;
	/** Whether the editor fills the screen. */
	getFullScreen: () => boolean;
	/** Fills the screen, or gives it back. */
	setFullScreen: ( on: boolean ) => void;
}
