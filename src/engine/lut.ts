/**
 * Tone curves and levels, baked into a lookup table.
 *
 * A curve is an arbitrary mapping from input level to output level, which no colour
 * matrix can express. The shader therefore samples a 256-wide texture: one texel
 * per input level, carrying the mapped value for each channel.
 *
 * Master and per-channel curves compose into the *same* table -- `lut[i].r` is the
 * red curve applied to the master curve applied to `i` -- so the shader still does
 * one texture fetch per channel no matter how many curves are in play.
 *
 * Pure maths and a typed array, so it is unit-tested without a GPU.
 */

/** A control point, both coordinates in 0..255. */
export type CurvePoint = [ number, number ];

/** The curves attached to an edit. Any channel may be absent, meaning "linear". */
export interface Curves {
	rgb?: CurvePoint[];
	r?: CurvePoint[];
	g?: CurvePoint[];
	b?: CurvePoint[];
}

/** Black point, white point and midtone gamma. */
export interface Levels {
	black: number;
	white: number;
	gamma: number;
}

/** Levels that change nothing. */
export const IDENTITY_LEVELS: Levels = { black: 0, white: 255, gamma: 1 };

/** The straight line every unset curve falls back to. */
export const LINEAR_CURVE: CurvePoint[] = [
	[ 0, 0 ],
	[ 255, 255 ],
];

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

/**
 * Evaluates levels across all 256 input levels.
 *
 * @param levels Black point, white point and gamma.
 * @return 256 output levels.
 */
export function sampleLevels( levels: Levels ): Uint8ClampedArray {
	const out = new Uint8ClampedArray( 256 );

	const black = Math.min( 254, Math.max( 0, levels.black ) );
	const white = Math.max( black + 1, Math.min( 255, levels.white ) );
	const gamma = Math.min( 10, Math.max( 0.1, levels.gamma ) );
	const span = white - black;

	for ( let x = 0; x < 256; x++ ) {
		const normalised = Math.min( 1, Math.max( 0, ( x - black ) / span ) );

		out[ x ] = Math.pow( normalised, 1 / gamma ) * 255;
	}

	return out;
}

/**
 * Bakes levels and every curve into one RGBA lookup table.
 *
 * Order is levels, then the master curve, then the per-channel curve -- the same
 * order the controls are stacked in the panel, so the result matches the mental
 * model of applying them top to bottom.
 *
 * The alpha channel is filled with the identity ramp. It is never sampled, but a
 * texture with a zeroed alpha channel is easy to mistake for a broken one when
 * inspecting it in a debugger.
 *
 * @param curves Curve set. Omitted channels are linear.
 * @param levels Levels. Omitted means no change.
 * @return 256x1 RGBA bytes, ready to upload as a texture.
 */
export function buildLut( curves?: Curves, levels?: Levels ): Uint8Array {
	const base = levels && ! isIdentityLevels( levels )
		? sampleLevels( levels )
		: identityRamp();

	const master = isLinear( curves?.rgb ) ? null : sampleCurve( curves!.rgb! );

	const channels = ( [ 'r', 'g', 'b' ] as const ).map( ( channel ) =>
		isLinear( curves?.[ channel ] ) ? null : sampleCurve( curves![ channel ]! )
	);

	const lut = new Uint8Array( 256 * 4 );

	for ( let i = 0; i < 256; i++ ) {
		const afterLevels = base[ i ];
		const afterMaster = master ? master[ afterLevels ] : afterLevels;

		for ( let c = 0; c < 3; c++ ) {
			const channel = channels[ c ];

			lut[ i * 4 + c ] = channel ? channel[ afterMaster ] : afterMaster;
		}

		lut[ i * 4 + 3 ] = i;
	}

	return lut;
}

/** The 0..255 identity ramp. */
function identityRamp(): Uint8ClampedArray {
	const ramp = new Uint8ClampedArray( 256 );

	for ( let i = 0; i < 256; i++ ) {
		ramp[ i ] = i;
	}

	return ramp;
}
