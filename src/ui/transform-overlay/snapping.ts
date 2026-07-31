/**
 * Snapping, and the projection that makes edge handles behave on a rotated layer.
 */

/**
 * Projects a screen-space offset onto the layer's own axes.
 *
 * Distances are floored away from zero so a ratio taken against them can never
 * divide by nothing when a handle is grabbed exactly on the centre line.
 *
 * @param dx       Horizontal offset from the layer centre, in screen pixels.
 * @param dy       Vertical offset from the layer centre, in screen pixels.
 * @param rotation Layer rotation in degrees.
 */
export function projectLocal(
	dx: number,
	dy: number,
	rotation: number
): { localX: number; localY: number } {
	const radians = ( rotation * Math.PI ) / 180;
	const cos = Math.cos( radians );
	const sin = Math.sin( radians );

	return {
		localX: Math.max( 1, Math.abs( dx * cos + dy * sin ) ),
		localY: Math.max( 1, Math.abs( -dx * sin + dy * cos ) ),
	};
}

/**
 * Snaps a value to the nearest target within a tolerance.
 *
 * @param value     Candidate value.
 * @param targets   Positions worth snapping to.
 * @param tolerance How close counts, in the same units.
 * @return The value, snapped if it was close enough, and whether it snapped.
 */
export function snap(
	value: number,
	targets: number[],
	tolerance: number
): { value: number; hit: boolean } {
	let best = value;
	let bestDistance = tolerance;
	let hit = false;

	for ( const target of targets ) {
		const distance = Math.abs( value - target );

		// Strictly nearer, so an earlier target wins a tie and the result is stable.
		if ( distance < bestDistance ) {
			best = target;
			bestDistance = distance;
			hit = true;
		}
	}

	return { value: best, hit };
}
