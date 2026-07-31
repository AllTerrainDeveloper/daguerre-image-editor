/**
 * One retouching dab.
 *
 * Every mode -- heal, clone, smudge, sharpen, dodge, burn -- is the same walk over the
 * same rectangle with a different decision per pixel, which is why they are one
 * function rather than six.
 */

import {
	blend,
	clamp01,
	grow,
	sampleAt,
	sampleIndex,
	subBuffer,
} from './buffer';
import { boxBlur } from './blur';
import { dabFalloff, dabRect, ringAverage } from './geometry';
import type { Carry, DabRequest, DabResult, PixelBuffer } from './types';

/**
 * The largest blur or sharpen kernel a single dab will build.
 *
 * A radius beyond this costs more than the result is worth at brush sizes anyone
 * actually paints with.
 */
const MAX_KERNEL = 64;

/**
 * Applies one retouching dab, in place.
 *
 * @param request What to do, where.
 * @return The dirty rectangle and any carried state, or null when the dab missed the
 *         buffer entirely.
 */
export function applyPixelDab( request: DabRequest ): DabResult | null {
	const { target, op } = request;
	const source = request.source ?? target;
	const radius = Math.max( 0.5, request.radius / 2 );
	const strength = clamp01( request.strength );

	const rect = dabRect( target, request.x, request.y, radius );

	if ( ! rect ) {
		return null;
	}

	const kernel = Math.max(
		1,
		Math.min( MAX_KERNEL, Math.round( radius * 0.35 ) )
	);
	const hardness = clamp01( request.hardness ?? 0.5 );
	const offsetX = Math.round( request.offsetX ?? 0 );
	const offsetY = Math.round( request.offsetY ?? 0 );

	// Neighbourhood ops must not read pixels this same dab has already written, or the
	// blur smears along the scan direction instead of spreading evenly. The snapshot is
	// of the dab's own neighbourhood, never of the whole image: copying a 5504x3072
	// document per dab is 67MB of allocation twenty-five times over in one stroke,
	// which is what made a single blur stroke take ten seconds.
	const needsSnapshot =
		op === 'blur' || op === 'sharpen' || op === 'smudge' || op === 'heal';
	// Heal reads a ring outside the dab, so it needs a wider margin than the kernel.
	const margin = op === 'heal' ? Math.ceil( radius * 0.4 ) + 2 : kernel;
	const read = needsSnapshot ? grow( source, rect, margin ) : rect;
	const snapshot = needsSnapshot ? subBuffer( source, read ) : source;

	/**
	 * Reads a pixel in document coordinates, whichever buffer is in play.
	 *
	 * @param x Document coordinate.
	 * @param y Document coordinate.
	 */
	const readAt = ( x: number, y: number ): Carry =>
		needsSnapshot
			? sampleAt( snapshot, x - read.x, y - read.y )
			: sampleAt( snapshot, x, y );

	// Blurred once for the whole neighbourhood rather than per pixel: a separable
	// running-sum pass is O(1) per pixel, where sampling a k-by-k box per pixel is
	// O(k^2) -- 289 reads each at the maximum kernel.
	const blurred =
		op === 'blur' || op === 'sharpen' ? boxBlur( snapshot, kernel ) : null;

	// Heal fills from a ring just outside the dab, which is the trick that makes it
	// replace a dust spot with its surroundings rather than with a blur of the spot.
	const patch =
		op === 'heal'
			? ringAverage(
					snapshot,
					request.x - read.x,
					request.y - read.y,
					radius
			  )
			: null;

	let carry: Carry | undefined;

	if ( op === 'smudge' ) {
		carry = request.carry
			? ( [ ...request.carry ] as Carry )
			: readAt( request.x, request.y );
	}

	for ( let y = rect.y; y < rect.y + rect.height; y++ ) {
		for ( let x = rect.x; x < rect.x + rect.width; x++ ) {
			const falloff = dabFalloff( x, y, request.x, request.y, radius, hardness );

			if ( falloff <= 0 ) {
				continue;
			}

			const weight = falloff * strength;
			const index = ( y * target.width + x ) * 4;

			switch ( op ) {
				case 'blur':
					blend(
						target,
						index,
						sampleAt( blurred as PixelBuffer, x - read.x, y - read.y ),
						weight
					);
					break;

				case 'sharpen': {
					const soft = sampleAt(
						blurred as PixelBuffer,
						x - read.x,
						y - read.y
					);
					const here = readAt( x, y );

					// Unsharp mask: push each channel away from its blurred self.
					blend(
						target,
						index,
						[
							here[ 0 ] + ( here[ 0 ] - soft[ 0 ] ) * 1.5,
							here[ 1 ] + ( here[ 1 ] - soft[ 1 ] ) * 1.5,
							here[ 2 ] + ( here[ 2 ] - soft[ 2 ] ) * 1.5,
							here[ 3 ],
						],
						weight
					);
					break;
				}

				case 'smudge': {
					const here = readAt( x, y );

					blend( target, index, carry as Carry, weight );

					// The carried colour drifts toward what it is passing over, which is
					// why a smudge fades out instead of dragging one colour forever.
					for ( let c = 0; c < 4; c++ ) {
						( carry as Carry )[ c ] +=
							( here[ c ] - ( carry as Carry )[ c ] ) * ( 1 - strength ) * 0.5;
					}
					break;
				}

				case 'heal':
					if ( patch ) {
						blend( target, index, patch, weight );
					}
					break;

				case 'dodge': {
					const here = sampleIndex( target, index );

					blend(
						target,
						index,
						[
							here[ 0 ] + ( 255 - here[ 0 ] ) * weight,
							here[ 1 ] + ( 255 - here[ 1 ] ) * weight,
							here[ 2 ] + ( 255 - here[ 2 ] ) * weight,
							here[ 3 ],
						],
						1
					);
					break;
				}

				case 'burn': {
					const here = sampleIndex( target, index );

					blend(
						target,
						index,
						[
							here[ 0 ] * ( 1 - weight ),
							here[ 1 ] * ( 1 - weight ),
							here[ 2 ] * ( 1 - weight ),
							here[ 3 ],
						],
						1
					);
					break;
				}

				case 'sponge':
				case 'saturate': {
					const here = sampleIndex( target, index );
					const luma =
						0.2126 * here[ 0 ] + 0.7152 * here[ 1 ] + 0.0722 * here[ 2 ];
					// Toward grey, or away from it.
					const amount = op === 'sponge' ? -weight : weight;

					blend(
						target,
						index,
						[
							luma + ( here[ 0 ] - luma ) * ( 1 + amount ),
							luma + ( here[ 1 ] - luma ) * ( 1 + amount ),
							luma + ( here[ 2 ] - luma ) * ( 1 + amount ),
							here[ 3 ],
						],
						1
					);
					break;
				}

				case 'clone':
					// Sampled from the document rather than from a neighbourhood
					// snapshot, because the point being copied from is somewhere else
					// entirely -- that is the whole tool.
					blend(
						target,
						index,
						sampleAt( source, x - offsetX, y - offsetY ),
						weight
					);
					break;

				case 'restore':
					// The history brush: the same pixel, read from a pristine copy of
					// the image. Clone with a zero offset and a different source, which
					// is why it needed no kernel of its own.
					blend( target, index, sampleAt( source, x, y ), weight );
					break;
			}
		}
	}

	return carry ? { rect, carry } : { rect };
}
