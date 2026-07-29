/**
 * Brush stamps and flood fill.
 *
 * A stroke is not drawn as a path. It is a *stamp* -- a small canvas holding one
 * dab of the brush -- repeated along the pointer's route at a fixed spacing. That
 * is how every raster painting program works, and it is what makes a soft or
 * bristled brush possible at all: the shape lives in the stamp's alpha, so the
 * stroke inherits it for free rather than needing a different drawing routine per
 * brush.
 *
 * Stamps are cached, because generating a bristled 200px dab means thousands of
 * canvas operations and a stroke asks for one every few pixels.
 */

/** The brush shapes on offer. */
export type BrushShape = 'hard' | 'soft' | 'hairy' | 'square';

/** Human-readable names, in the order they appear in the picker. */
export const BRUSH_SHAPES: Array< { value: BrushShape; label: string } > = [
	{ value: 'hard', label: 'Hard round' },
	{ value: 'soft', label: 'Soft round' },
	{ value: 'hairy', label: 'Bristle' },
	{ value: 'square', label: 'Square' },
];

/** How far apart dabs are placed, as a fraction of the brush diameter. */
export const STAMP_SPACING = 0.18;

/** Cache key to stamp, so a stroke does not regenerate its own brush. */
const cache = new Map< string, HTMLCanvasElement >();

/** Bounds the cache; a user cycling sizes should not grow it without limit. */
const MAX_CACHED = 24;

/**
 * Builds (or returns a cached) brush stamp.
 *
 * The stamp is always white with shape carried in its alpha, and tinted at paint
 * time. One stamp therefore serves every colour, which is what keeps the cache
 * small enough to be worth having.
 *
 * @param shape    Brush shape.
 * @param size     Diameter in canvas pixels.
 * @param hardness Edge falloff, 0..1. Ignored by shapes with a fixed edge.
 */
export function brushStamp(
	shape: BrushShape,
	size: number,
	hardness: number
): HTMLCanvasElement {
	const diameter = Math.max( 1, Math.round( size ) );
	const key = `${ shape }:${ diameter }:${ Math.round( hardness * 20 ) }`;
	const cached = cache.get( key );

	if ( cached ) {
		return cached;
	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = diameter;
	canvas.height = diameter;

	const ctx = canvas.getContext( '2d' );

	if ( ctx ) {
		paintStamp( ctx, shape, diameter, hardness );
	}

	if ( cache.size >= MAX_CACHED ) {
		const oldest = cache.keys().next().value;

		if ( oldest !== undefined ) {
			cache.delete( oldest );
		}
	}

	cache.set( key, canvas );

	return canvas;
}

/**
 * Draws one dab into a context.
 *
 * @param ctx      Target context.
 * @param shape    Brush shape.
 * @param diameter Stamp size in pixels.
 * @param hardness Edge falloff, 0..1.
 */
function paintStamp(
	ctx: CanvasRenderingContext2D,
	shape: BrushShape,
	diameter: number,
	hardness: number
): void {
	const r = diameter / 2;

	if ( shape === 'square' ) {
		ctx.fillStyle = '#fff';
		ctx.fillRect( 0, 0, diameter, diameter );

		return;
	}

	if ( shape === 'hairy' ) {
		// Scattered bristles: many small, semi-transparent dots weighted towards the
		// centre. Deterministic per stamp because it is cached -- a stroke made of
		// re-randomised dabs would shimmer rather than look like a brush.
		const bristles = Math.max( 24, Math.round( diameter * 3 ) );
		let seed = diameter * 9301;

		const random = () => {
			seed = ( seed * 9301 + 49297 ) % 233280;

			return seed / 233280;
		};

		for ( let i = 0; i < bristles; i++ ) {
			const angle = random() * Math.PI * 2;
			// Square root keeps the distribution even across the disc instead of
			// clumping everything at the centre.
			const distance = Math.sqrt( random() ) * r;
			const x = r + Math.cos( angle ) * distance;
			const y = r + Math.sin( angle ) * distance;
			const dot = Math.max( 0.5, ( diameter / 40 ) * ( 0.4 + random() ) );

			ctx.globalAlpha = 0.12 + random() * 0.35;
			ctx.fillStyle = '#fff';
			ctx.beginPath();
			ctx.arc( x, y, dot, 0, Math.PI * 2 );
			ctx.fill();
		}

		ctx.globalAlpha = 1;

		return;
	}

	// Round: a radial gradient whose solid core is set by hardness. At hardness 1
	// the core fills the whole radius and the edge is a single antialiased pixel.
	const core = shape === 'hard' ? Math.max( 0.75, hardness ) : hardness * 0.85;
	const gradient = ctx.createRadialGradient( r, r, 0, r, r, r );

	gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
	gradient.addColorStop( Math.min( 0.99, core ), 'rgba(255,255,255,1)' );
	gradient.addColorStop( 1, 'rgba(255,255,255,0)' );

	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc( r, r, r, 0, Math.PI * 2 );
	ctx.fill();
}

/** Clears the stamp cache. */
export function clearBrushCache(): void {
	cache.clear();
}

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
