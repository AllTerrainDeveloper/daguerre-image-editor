/**
 * Finding the contiguous region that matches a colour.
 *
 * A scanline fill rather than a per-pixel stack: a four-way stack fill on a
 * twenty-megapixel photograph overflows and is an order of magnitude slower.
 */

/**
 * Builds a mask of the contiguous region matching the colour at a point.
 *
 * A scanline flood fill: it walks whole runs of matching pixels at a time rather
 * than pushing every neighbour onto a stack, which is what makes it usable on a
 * multi-megapixel image instead of taking seconds and a vast queue.
 *
 * @param pixels    Source RGBA bytes.
 * @param width     Source width.
 * @param height    Source height.
 * @param startX    Seed point.
 * @param startY    Seed point.
 * @param tolerance 0..255 per-channel distance treated as the same colour.
 * @return A mask canvas, white where the fill applies, or null for an empty fill.
 */
export function floodFillMask(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	startX: number,
	startY: number,
	tolerance: number
): HTMLCanvasElement | null {
	const x0 = Math.round( startX );
	const y0 = Math.round( startY );

	if ( x0 < 0 || y0 < 0 || x0 >= width || y0 >= height ) {
		return null;
	}

	const at = ( x: number, y: number ) => ( y * width + x ) * 4;
	const seed = at( x0, y0 );
	const target = [
		pixels[ seed ],
		pixels[ seed + 1 ],
		pixels[ seed + 2 ],
		pixels[ seed + 3 ],
	];

	const matches = ( index: number ) =>
		Math.abs( pixels[ index ] - target[ 0 ] ) <= tolerance &&
		Math.abs( pixels[ index + 1 ] - target[ 1 ] ) <= tolerance &&
		Math.abs( pixels[ index + 2 ] - target[ 2 ] ) <= tolerance &&
		Math.abs( pixels[ index + 3 ] - target[ 3 ] ) <= tolerance;

	return scanlineFill( width, height, x0, y0, matches, at );
}

/**
 * The actual scanline fill.
 *
 * Split out so the public entry point stays readable.
 *
 * @param width   Source width.
 * @param height  Source height.
 * @param x0      Seed point.
 * @param y0      Seed point.
 * @param matches Predicate testing one pixel index.
 * @param at      Index helper.
 */
function scanlineFill(
	width: number,
	height: number,
	x0: number,
	y0: number,
	matches: ( index: number ) => boolean,
	at: ( x: number, y: number ) => number
): HTMLCanvasElement | null {
	const filled = new Uint8Array( width * height );
	const stack: number[] = [ x0, y0 ];
	let count = 0;

	while ( stack.length > 0 ) {
		const y = stack.pop()!;
		const seedX = stack.pop()!;

		if ( y < 0 || y >= height || filled[ y * width + seedX ] ) {
			continue;
		}

		let left = seedX;
		let right = seedX;

		while ( left > 0 && matches( at( left - 1, y ) ) && ! filled[ y * width + left - 1 ] ) {
			left--;
		}

		while (
			right < width - 1 &&
			matches( at( right + 1, y ) ) &&
			! filled[ y * width + right + 1 ]
		) {
			right++;
		}

		for ( let x = left; x <= right; x++ ) {
			filled[ y * width + x ] = 1;
			count++;

			// Seed the rows above and below once per run of matching pixels.
			for ( const ny of [ y - 1, y + 1 ] ) {
				if ( ny < 0 || ny >= height ) {
					continue;
				}

				if ( matches( at( x, ny ) ) && ! filled[ ny * width + x ] ) {
					stack.push( x, ny );
				}
			}
		}
	}

	if ( count === 0 ) {
		return null;
	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext( '2d' );

	if ( ! ctx ) {
		return null;
	}

	const mask = ctx.createImageData( width, height );

	for ( let i = 0; i < filled.length; i++ ) {
		if ( ! filled[ i ] ) {
			continue;
		}

		mask.data[ i * 4 ] = 255;
		mask.data[ i * 4 + 1 ] = 255;
		mask.data[ i * 4 + 2 ] = 255;
		mask.data[ i * 4 + 3 ] = 255;
	}

	ctx.putImageData( mask, 0, 0 );

	return canvas;
}
