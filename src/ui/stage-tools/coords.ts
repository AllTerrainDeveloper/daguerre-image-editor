/**
 * Screen pixels to canvas pixels.
 *
 * Every tool goes through here, which is the point: a brush stroke, a selection
 * rectangle and a gradient ramp cannot disagree about where the pointer is if there is
 * only one conversion.
 */

import type { CanvasSize } from '../../model/document';
import type { Point } from '../../model/selection';
import type { StageToolsOptions } from './types';

/** The least a conversion needs to know. */
export type CoordSource = Pick<
	StageToolsOptions,
	'stage' | 'getViewport' | 'getCanvas'
>;

/**
 * Converts a pointer position into canvas pixels.
 *
 * @param source Where the canvas currently is.
 * @param event  Pointer event.
 * @return Canvas coordinates, or null when nothing is loaded.
 */
export function toCanvas( source: CoordSource, event: PointerEvent ): Point | null {
	const viewport = source.getViewport();
	const canvas = source.getCanvas();

	if ( ! viewport || 0 === viewport.width || 0 === canvas.width ) {
		return null;
	}

	const stageRect = source.stage.getBoundingClientRect();
	const x = event.clientX - stageRect.left - viewport.x;
	const y = event.clientY - stageRect.top - viewport.y;

	return {
		x: ( x / viewport.width ) * canvas.width,
		y: ( y / viewport.height ) * canvas.height,
	};
}

/**
 * Converts canvas pixels into normalised canvas coordinates.
 *
 * @param canvas Canvas size.
 * @param point  Canvas pixels.
 */
export function normalise( canvas: CanvasSize, point: Point ): Point {
	return { x: point.x / canvas.width, y: point.y / canvas.height };
}

/**
 * A pointer position relative to the stage's top-left corner.
 *
 * @param stage The canvas area.
 * @param event Pointer event.
 */
export function toStage( stage: HTMLElement, event: PointerEvent ): Point {
	const rect = stage.getBoundingClientRect();

	return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
