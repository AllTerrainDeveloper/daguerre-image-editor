/**
 * How thick a ruler is, and how far apart its marks go.
 *
 * A 1-2-5 progression, which is what every ruler and chart axis uses: the steps stay
 * recognisable as you zoom, because each is a round multiple of the last.
 */

/** Thickness of each ruler, in CSS pixels. */
export const RULER_SIZE = 20;

/** Smallest gap between labelled ticks, in CSS pixels. */
export const MIN_LABEL_GAP = 56;

/**
 * Chooses a tick interval in canvas pixels.
 *
 * Steps through a 1-2-5 sequence per decade, which is what keeps the numbers round
 * at every zoom instead of landing on values like 37.
 *
 * @param scale CSS pixels per canvas pixel.
 */
export function tickStep( scale: number ): number {
	const wanted = MIN_LABEL_GAP / Math.max( scale, 1e-6 ) / 5;
	const magnitude = Math.pow( 10, Math.floor( Math.log10( Math.max( wanted, 1e-6 ) ) ) );

	for ( const multiple of [ 1, 2, 5, 10 ] ) {
		if ( magnitude * multiple >= wanted ) {
			return magnitude * multiple;
		}
	}

	return magnitude * 10;
}
