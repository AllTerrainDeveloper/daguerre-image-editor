/**
 * What the pointer controller is wired to, and the per-tool constants it reads.
 */

import type { CanvasSize } from '../../model/document';
import type { Selection, SelectionShape } from '../../model/selection';
import type { PixelOp } from '../../engine/pixel-tools';
import type { ActiveTool } from '../panels';
import type { BrushSettings } from './brush-settings';

export interface StageToolsOptions {
	stage: HTMLElement;
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	getCanvas: () => CanvasSize;
	getTool: () => ActiveTool;
	getBrush: () => BrushSettings;
	/** Changes a setting -- the eyedropper picks a colour this way. */
	setBrush: ( patch: Partial< BrushSettings > ) => void;
	/** The layer strokes land on. */
	getTargetLayerId: () => string;
	/** Stamps one dab into a layer. */
	stamp: (
		layerId: string,
		image: HTMLCanvasElement,
		x: number,
		y: number,
		size: number,
		colour: string,
		opacity: number,
		erase: boolean
	) => void;
	/** Draws a full-canvas mask into a layer, for fill. */
	fillMask: (
		layerId: string,
		mask: HTMLCanvasElement,
		colour: string,
		opacity: number
	) => void;
	/** Draws a bitmap into a layer, for gradients, shapes, text and retouching. */
	composite: (
		layerId: string,
		source: HTMLCanvasElement,
		x: number,
		y: number,
		opacity: number
	) => void;
	/** Reads the composed document, for flood fill's colour matching. */
	readDocument: () => { pixels: Uint8ClampedArray; width: number; height: number } | null;
	/** Reads the image without any painted layer, for the history brush. */
	readPristine: () => { pixels: Uint8ClampedArray; width: number; height: number } | null;
	/** Which shape the marquee draws. */
	getSelectionShape: () => SelectionShape;
	/** Replaces the selection. Null clears it. */
	setSelection: ( selection: Selection | null ) => void;
	/** Moves the view, in CSS pixels. */
	pan: ( dx: number, dy: number ) => void;
	/** Zooms about a point given in stage-relative CSS pixels. */
	zoomAt: ( factor: number, x: number, y: number ) => void;
	/** Called once a stroke finishes, for history. */
	onStrokeEnd: () => void;
	/** Called when a tool wants the options bar redrawn -- a clone source, say. */
	onToolStateChange?: () => void;
	/**
	 * Called when the text tool is clicked.
	 *
	 * The caret belongs on the canvas, so placing text is opening an editor at a point
	 * rather than stamping a string held elsewhere.
	 */
	onPlaceText: ( point: { x: number; y: number } ) => void;
}

/** How much of a dab's width a retouching stroke advances before the next one. */
export const RETOUCH_SPACING = 0.25;

/** The tools that work on pixels rather than laying down paint. */
export const PIXEL_TOOLS: ActiveTool[] = [ 'retouch', 'tone', 'clone', 'history' ];

/**
 * Which operation each pixel tool performs.
 *
 * Retouch and tone choose theirs from the options bar, so they are absent here and
 * fall through to the brush setting.
 */
export const PIXEL_OPS: Partial< Record< ActiveTool, PixelOp > > = {
	clone: 'clone',
	history: 'restore',
	tone: undefined,
};
