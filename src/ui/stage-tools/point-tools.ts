/**
 * The tools that act on a single click rather than a drag.
 *
 * Eyedropper, paint bucket, magic wand and zoom. All four read the *composed*
 * document rather than the target layer, because that is what the user can see --
 * matching against an invisible layer's contents would look arbitrary.
 */

import { floodFillMask } from '../../engine/brush';
import { rgbToHex } from '../../engine/paint-shapes';
import { traceMask } from '../../model/selection';
import type { Point } from '../../model/selection';
import { toStage } from './coords';
import type { StageToolsOptions } from './types';

/**
 * Samples the colour under the pointer into the foreground.
 *
 * @param options Tool wiring.
 * @param point   Canvas coordinates.
 */
export function pickColour( options: StageToolsOptions, point: Point ): void {
	const source = options.readDocument();

	if ( ! source ) {
		return;
	}

	const x = Math.round( point.x );
	const y = Math.round( point.y );

	if ( x < 0 || y < 0 || x >= source.width || y >= source.height ) {
		return;
	}

	const index = ( y * source.width + x ) * 4;

	options.setBrush( {
		colour: rgbToHex(
			source.pixels[ index ],
			source.pixels[ index + 1 ],
			source.pixels[ index + 2 ]
		),
	} );
}

/**
 * Zooms in, or out with Alt held.
 *
 * @param options Tool wiring.
 * @param event   Pointer event, positioned within the stage.
 */
export function zoomAtPointer(
	options: StageToolsOptions,
	event: PointerEvent
): void {
	const at = toStage( options.stage, event );

	// Alt inverts, as it does in every editor that has this tool.
	options.zoomAt( event.altKey ? 1 / 1.4 : 1.4, at.x, at.y );
}

/**
 * The contiguous region matching the colour under the pointer.
 *
 * @param options Tool wiring.
 * @param point   Canvas coordinates.
 * @return The matched region as a mask, or null when nothing matched.
 */
function matchRegion(
	options: StageToolsOptions,
	point: Point
): HTMLCanvasElement | null {
	const source = options.readDocument();

	if ( ! source ) {
		return null;
	}

	return floodFillMask(
		source.pixels,
		source.width,
		source.height,
		point.x,
		point.y,
		options.getBrush().tolerance
	);
}

/**
 * Floods the region matching the colour under the pointer.
 *
 * @param options Tool wiring.
 * @param point   Canvas coordinates.
 */
export function floodFill( options: StageToolsOptions, point: Point ): void {
	const mask = matchRegion( options, point );

	if ( ! mask ) {
		return;
	}

	const brush = options.getBrush();

	options.fillMask( options.getTargetLayerId(), mask, brush.colour, brush.opacity );
	options.onStrokeEnd();
}

/**
 * Selects the contiguous region matching the colour under the pointer.
 *
 * The same flood fill the paint bucket uses, traced into a path -- which is the whole
 * reason the wand was cheap to add.
 *
 * @param options Tool wiring.
 * @param point   Canvas coordinates.
 */
export function magicWand( options: StageToolsOptions, point: Point ): void {
	const mask = matchRegion( options, point );

	if ( ! mask ) {
		return;
	}

	const ctx = mask.getContext( '2d' );
	const pixels = ctx?.getImageData( 0, 0, mask.width, mask.height );

	if ( ! pixels ) {
		return;
	}

	const points = traceMask( pixels );

	options.setSelection( points.length > 2 ? { shape: 'lasso', points } : null );
}
