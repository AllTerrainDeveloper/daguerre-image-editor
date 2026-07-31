/**
 * The brush stamp: white, with the shape in its alpha.
 *
 * One cached stamp serves every colour, because the renderer tints it on the way in.
 * Caching matters more than it looks: a stroke places dozens of dabs a second and each
 * one would otherwise rasterise a fresh radial gradient.
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
