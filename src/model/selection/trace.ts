/**
 * Pixels back to an outline.
 *
 * The other direction from `buildSelectionMask()`, and what the magic wand needs: it
 * finds a region by colour and has to hand back something the marquee can draw. The
 * contour is thinned to a vertex budget, so a wand over a noisy photograph produces a
 * path the rasteriser can still handle.
 */

import { thinPath } from './path';
import type { Point } from './types';

/**
 * Traces the outline of a mask into a closed path.
 *
 * This is what lets the magic wand share everything the other selection tools use.
 * The wand naturally produces a *region* -- a flood fill -- and the rest of the editor
 * speaks in paths, so rather than teaching the outline renderer, the mask rasteriser
 * and the clipper about a second representation, the region is converted once, here.
 *
 * Moore-neighbour boundary tracing: start at the first filled pixel found scanning
 * row by row, then keep turning around the outside of the region until arriving back.
 * Only the outer contour is traced, so a region with holes selects through them --
 * a real limitation, and the right trade for not carrying two selection models.
 *
 * @param mask      Alpha mask, filled where the region is.
 * @param maxPoints Vertices to keep; the path is thinned evenly to fit.
 * @return Normalised vertices, or an empty array when there is no region.
 */
export function traceMask(
	mask: { data: Uint8ClampedArray; width: number; height: number },
	maxPoints = 400
): Point[] {
	const { width, height, data } = mask;
	const filled = ( x: number, y: number ): boolean =>
		x >= 0 &&
		y >= 0 &&
		x < width &&
		y < height &&
		data[ ( y * width + x ) * 4 + 3 ] > 127;

	let start: Point | null = null;

	for ( let y = 0; y < height && ! start; y++ ) {
		for ( let x = 0; x < width; x++ ) {
			if ( filled( x, y ) ) {
				start = { x, y };
				break;
			}
		}
	}

	if ( ! start ) {
		return [];
	}

	// Clockwise from due west. Scanning row-major guarantees the pixel to the west of
	// the start is outside the region, which is the entry direction tracing needs.
	const ring = [
		[ -1, 0 ],
		[ -1, -1 ],
		[ 0, -1 ],
		[ 1, -1 ],
		[ 1, 0 ],
		[ 1, 1 ],
		[ 0, 1 ],
		[ -1, 1 ],
	];

	const contour: Point[] = [ start ];
	let current = start;
	let entry = 0;
	// A boundary cannot be longer than the perimeter of every pixel in the mask.
	const limit = width * height * 4 + 8;

	for ( let step = 0; step < limit; step++ ) {
		let moved = false;

		for ( let i = 1; i <= 8; i++ ) {
			const direction = ( entry + i ) % 8;
			const next = {
				x: current.x + ring[ direction ][ 0 ],
				y: current.y + ring[ direction ][ 1 ],
			};

			if ( ! filled( next.x, next.y ) ) {
				continue;
			}

			// Re-enter from the far side of where we came from, so the walk keeps
			// hugging the same edge instead of doubling back.
			entry = ( direction + 5 ) % 8;
			current = next;
			moved = true;
			break;
		}

		if ( ! moved ) {
			// A single isolated pixel has no boundary to walk.
			break;
		}

		if ( current.x === start.x && current.y === start.y ) {
			break;
		}

		contour.push( current );
	}

	return thinPath( contour, maxPoints, width, height );
}
