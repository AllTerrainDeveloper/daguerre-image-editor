/**
 * Reading and writing CSS colours.
 */

/**
 * Rewrites a colour with a new alpha.
 *
 * Only `#rgb` and `#rrggbb` are understood, which is all the colour inputs produce.
 *
 * @param colour CSS colour.
 * @param alpha  0..1.
 */
export function withAlpha( colour: string, alpha: number ): string {
	const rgb = hexToRgb( colour );

	if ( ! rgb ) {
		return colour;
	}

	return `rgba( ${ rgb[ 0 ] }, ${ rgb[ 1 ] }, ${ rgb[ 2 ] }, ${ alpha } )`;
}

/**
 * Parses a hex colour.
 *
 * @param colour CSS hex colour, three or six digits.
 * @return Channels 0..255, or null when it is not hex.
 */
export function hexToRgb( colour: string ): [ number, number, number ] | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec( colour.trim() );

	if ( ! match ) {
		return null;
	}

	const hex = match[ 1 ];
	const full =
		hex.length === 3
			? hex
					.split( '' )
					.map( ( c ) => c + c )
					.join( '' )
			: hex;

	return [
		parseInt( full.slice( 0, 2 ), 16 ),
		parseInt( full.slice( 2, 4 ), 16 ),
		parseInt( full.slice( 4, 6 ), 16 ),
	];
}

/**
 * Formats channels as a hex colour.
 *
 * @param r Red 0..255.
 * @param g Green 0..255.
 * @param b Blue 0..255.
 */
export function rgbToHex( r: number, g: number, b: number ): string {
	const byte = ( value: number ) =>
		Math.min( 255, Math.max( 0, Math.round( value ) ) )
			.toString( 16 )
			.padStart( 2, '0' );

	return `#${ byte( r ) }${ byte( g ) }${ byte( b ) }`;
}
