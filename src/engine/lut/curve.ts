/**
 * Sampling a curve.
 *
 * Monotone cubic interpolation rather than a plain spline: a plain one overshoots
 * between control points, which shows up as a curve that dips below a point the user
 * placed and produces banding they did not ask for.
 */

import { LINEAR_CURVE } from './types';
import type { CurvePoint } from './types';

/**
 * Sorts, de-duplicates and clamps control points into a usable curve.
 *
 * A dragged control point can be moved past its neighbour, and two points sharing
 * an x would make the interpolator divide by zero. Both are handled here rather
 * than being forbidden in the UI, so dragging stays unrestricted and forgiving.
 *
 * @param points Raw control points.
 * @return At least two strictly increasing points.
 */
export function normaliseCurve( points: CurvePoint[] | undefined ): CurvePoint[] {
	if ( ! points || points.length < 2 ) {
		return LINEAR_CURVE.map( ( p ) => [ ...p ] as CurvePoint );
	}

	const clamped = points
		.map(
			( [ x, y ] ) =>
				[
					Math.min( 255, Math.max( 0, Math.round( x ) ) ),
					Math.min( 255, Math.max( 0, Math.round( y ) ) ),
				] as CurvePoint
		)
		.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );

	const unique: CurvePoint[] = [];

	for ( const point of clamped ) {
		const last = unique[ unique.length - 1 ];

		// Later wins on a collision, which matches what dragging a point on top of
		// another one looks like.
		if ( last && last[ 0 ] === point[ 0 ] ) {
			unique[ unique.length - 1 ] = point;
			continue;
		}

		unique.push( point );
	}

	if ( unique.length < 2 ) {
		return LINEAR_CURVE.map( ( p ) => [ ...p ] as CurvePoint );
	}

	return unique;
}

/**
 * Evaluates a curve across all 256 input levels.
 *
 * Uses monotone cubic interpolation (Fritsch-Carlson). A plain cubic spline through
 * the same points overshoots between them, which on a tone curve shows up as
 * banding or an inverted patch in a smooth gradient -- the curve briefly running
 * *backwards* between two control points the user placed going forwards. Monotone
 * interpolation cannot do that: if the control points ascend, so does every value
 * between them.
 *
 * @param points Control points, already normalised.
 * @return 256 output levels.
 */
export function sampleCurve( points: CurvePoint[] ): Uint8ClampedArray {
	const curve = normaliseCurve( points );
	const out = new Uint8ClampedArray( 256 );
	const n = curve.length;

	// Secant slopes between consecutive points.
	const deltas: number[] = [];

	for ( let i = 0; i < n - 1; i++ ) {
		const dx = curve[ i + 1 ][ 0 ] - curve[ i ][ 0 ];
		deltas.push( dx === 0 ? 0 : ( curve[ i + 1 ][ 1 ] - curve[ i ][ 1 ] ) / dx );
	}

	// Tangents, initialised to the average of the neighbouring secants.
	const tangents: number[] = new Array( n );
	tangents[ 0 ] = deltas[ 0 ];
	tangents[ n - 1 ] = deltas[ n - 2 ];

	for ( let i = 1; i < n - 1; i++ ) {
		tangents[ i ] =
			deltas[ i - 1 ] * deltas[ i ] <= 0
				? 0
				: ( deltas[ i - 1 ] + deltas[ i ] ) / 2;
	}

	// Fritsch-Carlson: rein the tangents in so no segment can overshoot.
	for ( let i = 0; i < n - 1; i++ ) {
		if ( deltas[ i ] === 0 ) {
			tangents[ i ] = 0;
			tangents[ i + 1 ] = 0;
			continue;
		}

		const a = tangents[ i ] / deltas[ i ];
		const b = tangents[ i + 1 ] / deltas[ i ];
		const s = a * a + b * b;

		if ( s > 9 ) {
			const t = 3 / Math.sqrt( s );
			tangents[ i ] = t * a * deltas[ i ];
			tangents[ i + 1 ] = t * b * deltas[ i ];
		}
	}

	let segment = 0;

	for ( let x = 0; x < 256; x++ ) {
		if ( x <= curve[ 0 ][ 0 ] ) {
			out[ x ] = curve[ 0 ][ 1 ];
			continue;
		}

		if ( x >= curve[ n - 1 ][ 0 ] ) {
			out[ x ] = curve[ n - 1 ][ 1 ];
			continue;
		}

		while ( segment < n - 2 && x > curve[ segment + 1 ][ 0 ] ) {
			segment++;
		}

		const [ x0, y0 ] = curve[ segment ];
		const [ x1, y1 ] = curve[ segment + 1 ];
		const h = x1 - x0;
		const t = ( x - x0 ) / h;
		const t2 = t * t;
		const t3 = t2 * t;

		out[ x ] =
			( 2 * t3 - 3 * t2 + 1 ) * y0 +
			( t3 - 2 * t2 + t ) * h * tangents[ segment ] +
			( -2 * t3 + 3 * t2 ) * y1 +
			( t3 - t2 ) * h * tangents[ segment + 1 ];
	}

	return out;
}
