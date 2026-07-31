/**
 * Telling a tone control that does nothing from one that does.
 *
 * Worth being exact about. A curve that happens to be a straight line still costs a
 * texture upload and a shader branch, so recognising it is what keeps an unedited
 * image free.
 */

import type { CurvePoint, Curves, Levels } from './types';

/**
 * Whether a curve set would leave every level where it found it.
 *
 * @param curves Curves to test.
 */
export function isIdentityCurves( curves: Curves | undefined ): boolean {
	if ( ! curves ) {
		return true;
	}

	return ( [ 'rgb', 'r', 'g', 'b' ] as const ).every( ( channel ) =>
		isLinear( curves[ channel ] )
	);
}

/**
 * Whether one curve is the identity line.
 *
 * @param points Control points.
 */
export function isLinear( points: CurvePoint[] | undefined ): boolean {
	if ( ! points || points.length === 0 ) {
		return true;
	}

	return points.every( ( [ x, y ] ) => Math.abs( x - y ) < 0.5 );
}

/**
 * Whether levels would leave every level where it found it.
 *
 * @param levels Levels to test.
 */
export function isIdentityLevels( levels: Levels | undefined ): boolean {
	if ( ! levels ) {
		return true;
	}

	return (
		levels.black <= 0 &&
		levels.white >= 255 &&
		Math.abs( levels.gamma - 1 ) < 1e-6
	);
}
