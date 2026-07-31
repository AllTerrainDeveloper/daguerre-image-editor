/**
 * What a transform drag grabbed, and what it captured when it started.
 */

import type { CanvasSize, LayerTransform } from '../../model/document';

/** Which handle a drag grabbed. */
export type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'rotate';

/** Rotation snaps to multiples of this while shift is held, in degrees. */
export const SNAP_DEGREES = 15;

/** How close, in screen pixels, a position must be to snap. */
export const SNAP_PX = 7;

export interface TransformOverlayOptions {
	/** Element the overlay is positioned within -- the stage. */
	stage: HTMLElement;
	/** Where the canvas sits inside the stage, in CSS pixels. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Canvas size in its own pixels. */
	getCanvas: () => CanvasSize;
	/** Native size of the image on the layer. */
	getImageSize: () => CanvasSize;
	/** The layer transform as it currently stands. */
	getTransform: () => LayerTransform;
	/** Fires continuously while dragging. */
	onChange: ( transform: LayerTransform ) => void;
	/** Fires once a drag finishes. */
	onCommit: () => void;
	/** Whether snapping is on. Alt bypasses it regardless. */
	getSnapping: () => boolean;
}

/** State captured at the moment a drag begins. */
export interface DragStart {
	handle: Handle;
	pointerX: number;
	pointerY: number;
	transform: LayerTransform;
	/** CSS pixels per canvas pixel, fixed for the gesture. */
	pixelRatio: number;
	/** Layer centre in stage CSS pixels. */
	centreX: number;
	centreY: number;
	/** Pointer angle from the centre, for rotation. */
	angle: number;
	/** Pointer distance from the centre, for uniform scaling. */
	distance: number;
	/** Pointer offset from the centre projected onto the layer's own axes. */
	localX: number;
	localY: number;
}
