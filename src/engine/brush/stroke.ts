/**
 * Spacing the dabs along a stroke.
 */


/** How far apart dabs are placed, as a fraction of the brush diameter. */
export const STAMP_SPACING = 0.18;

/**
 * Interpolates dab positions between two pointer samples.
 *
 * A pointer reports maybe 60 positions a second; a fast stroke moves far between
 * two of them. Without filling the gap a brush lays down a dotted line rather than
 * a stroke.
 *
 * @param from    Previous point.
 * @param to      Current point.
 * @param spacing Distance between dabs in canvas pixels.
 * @return Points to stamp, excluding `from`.
 */
export function interpolateStroke(
	from: { x: number; y: number },
	to: { x: number; y: number },
	spacing: number
): Array< { x: number; y: number } > {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const distance = Math.hypot( dx, dy );
	const step = Math.max( 0.5, spacing );

	if ( distance < step ) {
		return [ to ];
	}

	const count = Math.floor( distance / step );
	const points: Array< { x: number; y: number } > = [];

	for ( let i = 1; i <= count; i++ ) {
		const t = ( i * step ) / distance;

		points.push( { x: from.x + dx * t, y: from.y + dy * t } );
	}

	// Always finish on the true position, or the stroke lags behind the pointer.
	points.push( to );

	return points;
}
