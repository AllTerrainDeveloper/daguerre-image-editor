/**
 * Continuing a gesture that is already under way.
 *
 * The press decided what kind of gesture this is; these are the three things that
 * happen on every pointer move afterwards.
 */

import { STAMP_SPACING, interpolateStroke } from '../../engine/brush';
import type { Point } from '../../model/selection';
import type { ActiveTool } from '../panels';
import { stampDab } from './brush-stroke';
import type { Gesture } from './gesture';
import { isPixelTool } from './pixel-stroke';
import { RETOUCH_SPACING } from './types';
import type { StageToolsOptions } from './types';

/**
 * Places one dab, whichever kind the tool wants.
 *
 * @param options Tool wiring.
 * @param gesture Gesture state.
 * @param point   Canvas coordinates.
 * @param tool    Active tool.
 */
export function strokeDab(
	options: StageToolsOptions,
	gesture: Gesture,
	point: Point,
	tool: ActiveTool
): void {
	if ( isPixelTool( tool ) ) {
		gesture.stroke.dab( point, tool );

		return;
	}

	stampDab( options, point, 'eraser' === tool );
}

/**
 * Lays down the dabs between the last sample and this one.
 *
 * @param options Tool wiring.
 * @param gesture Gesture state, mutated in place.
 * @param point   Canvas coordinates.
 * @param tool    Active tool.
 */
export function continueStroke(
	options: StageToolsOptions,
	gesture: Gesture,
	point: Point,
	tool: ActiveTool
): void {
	const last = gesture.last;

	if ( ! gesture.drawing || ! last ) {
		return;
	}

	const spacing = isPixelTool( tool ) ? RETOUCH_SPACING : STAMP_SPACING;
	const step = options.getBrush().size * spacing;

	// Fill the gap between pointer samples, or a fast stroke lays down dots.
	for ( const at of interpolateStroke( last, point, step ) ) {
		strokeDab( options, gesture, at, tool );
	}

	gesture.last = point;
}

/**
 * Moves the view under a hand drag.
 *
 * @param options Tool wiring.
 * @param gesture Gesture state, mutated in place.
 * @param event   Pointer event.
 */
export function panBy(
	options: StageToolsOptions,
	gesture: Gesture,
	event: PointerEvent
): void {
	const last = gesture.last;

	if ( ! last ) {
		return;
	}

	options.pan( event.clientX - last.x, event.clientY - last.y );
	gesture.last = { x: event.clientX, y: event.clientY };
}
