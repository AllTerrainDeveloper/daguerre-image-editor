/**
 * The tools drawn by dragging a rectangle out.
 *
 * Gradients and shapes are only committed on release. The drag itself shows a dashed
 * outline instead, because drawing a canvas-sized bitmap on every pointer move would
 * stall on a large document for no visible benefit.
 */

import {
	gradientCanvas,
	shapeCanvas,
	squareDrag,
} from '../../engine/paint-shapes';
import type { Point } from '../../model/selection';
import { toCanvas } from './coords';
import type { StageToolsOptions } from './types';

/**
 * Commits a gradient or a shape once the drag ends.
 *
 * @param options Tool wiring.
 * @param from    Canvas coordinates the drag began at.
 * @param event   The releasing pointer event.
 */
export function commitRegion(
	options: StageToolsOptions,
	from: Point,
	event: PointerEvent
): void {
	const to = toCanvas( options, event );

	if ( ! to ) {
		return;
	}

	const tool = options.getTool();
	const brush = options.getBrush();
	const canvas = options.getCanvas();

	const end = event.shiftKey && 'shape' === tool ? squareDrag( from, to ) : to;

	const bitmap =
		'gradient' === tool
			? gradientCanvas(
					canvas.width,
					canvas.height,
					brush.gradient,
					from,
					end,
					brush.colour,
					brush.background,
					brush.gradientFade
			  )
			: shapeCanvas( canvas.width, canvas.height, from, end, {
					kind: brush.shapeKind,
					style: brush.shapeStyle,
					colour: brush.colour,
					strokeWidth: brush.strokeWidth,
			  } );

	if ( ! bitmap ) {
		return;
	}

	options.composite( options.getTargetLayerId(), bitmap, 0, 0, brush.opacity );
	options.onStrokeEnd();
}
