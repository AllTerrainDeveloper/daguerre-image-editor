/**
 * Retouching brushes that work on pixels rather than paint.
 *
 * Blur, sharpen, smudge, heal, dodge, burn, sponge and clone all do the same three
 * things: read the pixels under a round dab, compute new ones, and blend the result
 * back with a soft falloff so a stroke has no hard edge. Only the middle step differs.
 * So there is one dab routine here and eight small kernels, rather than eight tools.
 *
 * It runs on the CPU deliberately. A dab is a few thousand pixels; a 30px brush is
 * 2,800 of them, which is nothing. Eight GLSL programs, on the other hand, would be
 * eight more shaders to compile, and the whole point of the single-pass adjustment
 * shader is that we compile as few as possible.
 *
 * Pure functions over plain buffers -- no canvas, no Pixi, no DOM -- so every kernel
 * is unit-testable.
 */

/** What a retouching dab does to the pixels it covers. */
export type PixelOp =
	| 'blur'
	| 'sharpen'
	| 'smudge'
	| 'heal'
	| 'dodge'
	| 'burn'
	| 'sponge'
	| 'saturate'
	| 'clone';

/**
 * A block of RGBA pixels.
 *
 * Structurally an `ImageData`, but declared here so the kernels can be tested
 * without a canvas implementation.
 */
export interface PixelBuffer {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

/** Colour carried between smudge dabs, as premultiplied-free RGBA 0..255. */
export type Carry = [ number, number, number, number ];

export interface DabRequest {
	op: PixelOp;
	/** Modified in place. */
	target: PixelBuffer;
	/** Where sampling reads from. Defaults to `target`. Clone needs its own. */
	source?: PixelBuffer;
	/** Dab centre, in buffer pixels. */
	x: number;
	y: number;
	/** Dab radius, in buffer pixels. */
	radius: number;
	/** How hard the dab bites, 0..1. */
	strength: number;
	/** Edge softness, 0..1. 1 is a hard edge. */
	hardness?: number;
	/** Clone offset: how far the sample point sits from the dab, in pixels. */
	offsetX?: number;
	offsetY?: number;
	/** Colour the smudge is dragging along. */
	carry?: Carry | null;
}

export interface DabResult {
	/** The region actually touched, so a caller can upload only that. */
	rect: { x: number; y: number; width: number; height: number };
	/** Updated smudge colour, when the op carries one. */
	carry?: Carry;
}

/**
 * Largest blur kernel radius, in pixels.
 *
 * Generous, because the blur is a running-sum pass: a 64px kernel costs the same per
 * pixel as a 2px one. It was capped at 8 while the kernel was sampled per pixel, and
 * that cap made a wide brush do nothing visible on a 5000px photo -- the blur was
 * real, but two pixels of it on a twenty-megapixel image is not something anyone can
 * see. The cap exists now only to bound the sub-buffer a single dab has to copy.
 */
const MAX_KERNEL = 64;

/**
 * Applies one retouching dab, in place.
 *
 * @param request What to do, where.
 * @return The dirty rectangle and any carried state, or null when the dab missed the
 *         buffer entirely.
 */
export function applyPixelDab( request: DabRequest ): DabResult | null {
	const { target, op } = request;
	const source = request.source ?? target;
	const radius = Math.max( 0.5, request.radius / 2 );
	const strength = clamp01( request.strength );

	const rect = dabRect( target, request.x, request.y, radius );

	if ( ! rect ) {
		return null;
	}

	const kernel = Math.max(
		1,
		Math.min( MAX_KERNEL, Math.round( radius * 0.35 ) )
	);
	const hardness = clamp01( request.hardness ?? 0.5 );
	const offsetX = Math.round( request.offsetX ?? 0 );
	const offsetY = Math.round( request.offsetY ?? 0 );

	// Neighbourhood ops must not read pixels this same dab has already written, or the
	// blur smears along the scan direction instead of spreading evenly. The snapshot is
	// of the dab's own neighbourhood, never of the whole image: copying a 5504x3072
	// document per dab is 67MB of allocation twenty-five times over in one stroke,
	// which is what made a single blur stroke take ten seconds.
	const needsSnapshot =
		op === 'blur' || op === 'sharpen' || op === 'smudge' || op === 'heal';
	// Heal reads a ring outside the dab, so it needs a wider margin than the kernel.
	const margin = op === 'heal' ? Math.ceil( radius * 0.4 ) + 2 : kernel;
	const read = needsSnapshot ? grow( source, rect, margin ) : rect;
	const snapshot = needsSnapshot ? subBuffer( source, read ) : source;

	/**
	 * Reads a pixel in document coordinates, whichever buffer is in play.
	 *
	 * @param x Document coordinate.
	 * @param y Document coordinate.
	 */
	const readAt = ( x: number, y: number ): Carry =>
		needsSnapshot
			? sampleAt( snapshot, x - read.x, y - read.y )
			: sampleAt( snapshot, x, y );

	// Blurred once for the whole neighbourhood rather than per pixel: a separable
	// running-sum pass is O(1) per pixel, where sampling a k-by-k box per pixel is
	// O(k^2) -- 289 reads each at the maximum kernel.
	const blurred =
		op === 'blur' || op === 'sharpen' ? boxBlur( snapshot, kernel ) : null;

	// Heal fills from a ring just outside the dab, which is the trick that makes it
	// replace a dust spot with its surroundings rather than with a blur of the spot.
	const patch =
		op === 'heal'
			? ringAverage(
					snapshot,
					request.x - read.x,
					request.y - read.y,
					radius
			  )
			: null;

	let carry: Carry | undefined;

	if ( op === 'smudge' ) {
		carry = request.carry
			? ( [ ...request.carry ] as Carry )
			: readAt( request.x, request.y );
	}

	for ( let y = rect.y; y < rect.y + rect.height; y++ ) {
		for ( let x = rect.x; x < rect.x + rect.width; x++ ) {
			const falloff = dabFalloff( x, y, request.x, request.y, radius, hardness );

			if ( falloff <= 0 ) {
				continue;
			}

			const weight = falloff * strength;
			const index = ( y * target.width + x ) * 4;

			switch ( op ) {
				case 'blur':
					blend(
						target,
						index,
						sampleAt( blurred as PixelBuffer, x - read.x, y - read.y ),
						weight
					);
					break;

				case 'sharpen': {
					const soft = sampleAt(
						blurred as PixelBuffer,
						x - read.x,
						y - read.y
					);
					const here = readAt( x, y );

					// Unsharp mask: push each channel away from its blurred self.
					blend(
						target,
						index,
						[
							here[ 0 ] + ( here[ 0 ] - soft[ 0 ] ) * 1.5,
							here[ 1 ] + ( here[ 1 ] - soft[ 1 ] ) * 1.5,
							here[ 2 ] + ( here[ 2 ] - soft[ 2 ] ) * 1.5,
							here[ 3 ],
						],
						weight
					);
					break;
				}

				case 'smudge': {
					const here = readAt( x, y );

					blend( target, index, carry as Carry, weight );

					// The carried colour drifts toward what it is passing over, which is
					// why a smudge fades out instead of dragging one colour forever.
					for ( let c = 0; c < 4; c++ ) {
						( carry as Carry )[ c ] +=
							( here[ c ] - ( carry as Carry )[ c ] ) * ( 1 - strength ) * 0.5;
					}
					break;
				}

				case 'heal':
					if ( patch ) {
						blend( target, index, patch, weight );
					}
					break;

				case 'dodge': {
					const here = sampleIndex( target, index );

					blend(
						target,
						index,
						[
							here[ 0 ] + ( 255 - here[ 0 ] ) * weight,
							here[ 1 ] + ( 255 - here[ 1 ] ) * weight,
							here[ 2 ] + ( 255 - here[ 2 ] ) * weight,
							here[ 3 ],
						],
						1
					);
					break;
				}

				case 'burn': {
					const here = sampleIndex( target, index );

					blend(
						target,
						index,
						[
							here[ 0 ] * ( 1 - weight ),
							here[ 1 ] * ( 1 - weight ),
							here[ 2 ] * ( 1 - weight ),
							here[ 3 ],
						],
						1
					);
					break;
				}

				case 'sponge':
				case 'saturate': {
					const here = sampleIndex( target, index );
					const luma =
						0.2126 * here[ 0 ] + 0.7152 * here[ 1 ] + 0.0722 * here[ 2 ];
					// Toward grey, or away from it.
					const amount = op === 'sponge' ? -weight : weight;

					blend(
						target,
						index,
						[
							luma + ( here[ 0 ] - luma ) * ( 1 + amount ),
							luma + ( here[ 1 ] - luma ) * ( 1 + amount ),
							luma + ( here[ 2 ] - luma ) * ( 1 + amount ),
							here[ 3 ],
						],
						1
					);
					break;
				}

				case 'clone':
					// Sampled from the document rather than from a neighbourhood
					// snapshot, because the point being copied from is somewhere else
					// entirely -- that is the whole tool.
					blend(
						target,
						index,
						sampleAt( source, x - offsetX, y - offsetY ),
						weight
					);
					break;
			}
		}
	}

	return carry ? { rect, carry } : { rect };
}

/**
 * The pixels a dab covers, clipped to the buffer.
 *
 * @param buffer Target.
 * @param cx     Dab centre.
 * @param cy     Dab centre.
 * @param radius Dab radius.
 * @return Integer rectangle, or null when the dab is entirely off-buffer.
 */
export function dabRect(
	buffer: PixelBuffer,
	cx: number,
	cy: number,
	radius: number
): { x: number; y: number; width: number; height: number } | null {
	const x0 = Math.max( 0, Math.floor( cx - radius ) );
	const y0 = Math.max( 0, Math.floor( cy - radius ) );
	const x1 = Math.min( buffer.width, Math.ceil( cx + radius ) + 1 );
	const y1 = Math.min( buffer.height, Math.ceil( cy + radius ) + 1 );

	if ( x1 <= x0 || y1 <= y0 ) {
		return null;
	}

	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * How much of a dab lands on one pixel.
 *
 * Smoothstepped rather than linear, so overlapping dabs along a stroke add up to an
 * even band instead of a row of visible ridges.
 *
 * @param x        Pixel.
 * @param y        Pixel.
 * @param cx       Dab centre.
 * @param cy       Dab centre.
 * @param radius   Dab radius.
 * @param hardness 0 is a full gradient, 1 is a hard edge.
 */
export function dabFalloff(
	x: number,
	y: number,
	cx: number,
	cy: number,
	radius: number,
	hardness: number
): number {
	const distance = Math.hypot( x + 0.5 - cx, y + 0.5 - cy );

	if ( distance >= radius ) {
		return 0;
	}

	const inner = radius * clamp01( hardness );

	if ( distance <= inner ) {
		return 1;
	}

	const t = 1 - ( distance - inner ) / Math.max( radius - inner, 1e-6 );

	return t * t * ( 3 - 2 * t );
}

/**
 * The mean colour of a ring just outside a dab.
 *
 * @param buffer Pixels to read.
 * @param cx     Dab centre.
 * @param cy     Dab centre.
 * @param radius Dab radius.
 * @return Mean RGBA, or null when the ring fell entirely outside the buffer.
 */
export function ringAverage(
	buffer: PixelBuffer,
	cx: number,
	cy: number,
	radius: number
): Carry | null {
	const total: Carry = [ 0, 0, 0, 0 ];
	let count = 0;

	// 32 samples is enough to average out noise without being worth optimising.
	for ( let i = 0; i < 32; i++ ) {
		const angle = ( i / 32 ) * Math.PI * 2;
		const x = Math.round( cx + Math.cos( angle ) * radius * 1.35 );
		const y = Math.round( cy + Math.sin( angle ) * radius * 1.35 );

		if ( x < 0 || y < 0 || x >= buffer.width || y >= buffer.height ) {
			continue;
		}

		const sample = sampleAt( buffer, x, y );

		for ( let c = 0; c < 4; c++ ) {
			total[ c ] += sample[ c ];
		}

		count++;
	}

	if ( count === 0 ) {
		return null;
	}

	return [
		total[ 0 ] / count,
		total[ 1 ] / count,
		total[ 2 ] / count,
		total[ 3 ] / count,
	];
}

/**
 * Box-blurs a whole buffer.
 *
 * Separable, and each pass keeps a running sum rather than re-reading the window, so
 * the cost is a handful of operations per pixel whatever the radius. Sampling a k-by-k
 * box per pixel instead would be 289 reads each at the largest kernel, which is what
 * made a wide blur brush unusable.
 *
 * Edges clamp, so the blur does not darken against the borders.
 *
 * @param buffer Pixels to blur. Not modified.
 * @param radius Kernel radius in pixels.
 * @return A blurred copy.
 */
export function boxBlur( buffer: PixelBuffer, radius: number ): PixelBuffer {
	const { width, height } = buffer;
	const span = Math.max( 1, Math.round( radius ) );
	const window = span * 2 + 1;
	const horizontal = new Uint8ClampedArray( buffer.data.length );
	const out = new Uint8ClampedArray( buffer.data.length );

	for ( let y = 0; y < height; y++ ) {
		const row = y * width;
		const sums = [ 0, 0, 0, 0 ];

		// Prime the window with the clamped left edge.
		for ( let i = -span; i <= span; i++ ) {
			const index = ( row + clampInt( i, 0, width - 1 ) ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				sums[ c ] += buffer.data[ index + c ];
			}
		}

		for ( let x = 0; x < width; x++ ) {
			const index = ( row + x ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				horizontal[ index + c ] = sums[ c ] / window;
			}

			const leaving = ( row + clampInt( x - span, 0, width - 1 ) ) * 4;
			const entering = ( row + clampInt( x + span + 1, 0, width - 1 ) ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				sums[ c ] += buffer.data[ entering + c ] - buffer.data[ leaving + c ];
			}
		}
	}

	for ( let x = 0; x < width; x++ ) {
		const sums = [ 0, 0, 0, 0 ];

		for ( let i = -span; i <= span; i++ ) {
			const index = ( clampInt( i, 0, height - 1 ) * width + x ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				sums[ c ] += horizontal[ index + c ];
			}
		}

		for ( let y = 0; y < height; y++ ) {
			const index = ( y * width + x ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				out[ index + c ] = sums[ c ] / window;
			}

			const leaving = ( clampInt( y - span, 0, height - 1 ) * width + x ) * 4;
			const entering =
				( clampInt( y + span + 1, 0, height - 1 ) * width + x ) * 4;

			for ( let c = 0; c < 4; c++ ) {
				sums[ c ] += horizontal[ entering + c ] - horizontal[ leaving + c ];
			}
		}
	}

	return { data: out, width, height };
}

/**
 * Grows a rectangle by a margin, clipped to the buffer.
 *
 * @param buffer Bounds to stay inside.
 * @param rect   Rectangle to grow.
 * @param margin Pixels to add on every side.
 */
function grow(
	buffer: PixelBuffer,
	rect: { x: number; y: number; width: number; height: number },
	margin: number
): { x: number; y: number; width: number; height: number } {
	const x0 = Math.max( 0, rect.x - margin );
	const y0 = Math.max( 0, rect.y - margin );
	const x1 = Math.min( buffer.width, rect.x + rect.width + margin );
	const y1 = Math.min( buffer.height, rect.y + rect.height + margin );

	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Copies a rectangle out of a buffer.
 *
 * @param buffer Source.
 * @param rect   Region to lift. Must already be inside the buffer.
 */
function subBuffer(
	buffer: PixelBuffer,
	rect: { x: number; y: number; width: number; height: number }
): PixelBuffer {
	const data = new Uint8ClampedArray( rect.width * rect.height * 4 );

	for ( let row = 0; row < rect.height; row++ ) {
		const from = ( ( rect.y + row ) * buffer.width + rect.x ) * 4;

		data.set(
			buffer.data.subarray( from, from + rect.width * 4 ),
			row * rect.width * 4
		);
	}

	return { data, width: rect.width, height: rect.height };
}

/**
 * Reads one pixel, clamped to the edges.
 *
 * @param buffer Pixels to read.
 * @param x      Coordinate.
 * @param y      Coordinate.
 */
export function sampleAt( buffer: PixelBuffer, x: number, y: number ): Carry {
	const index =
		( clampInt( Math.round( y ), 0, buffer.height - 1 ) * buffer.width +
			clampInt( Math.round( x ), 0, buffer.width - 1 ) ) *
		4;

	return sampleIndex( buffer, index );
}

/**
 * Reads one pixel by byte index.
 *
 * @param buffer Pixels to read.
 * @param index  Byte offset of the red channel.
 */
function sampleIndex( buffer: PixelBuffer, index: number ): Carry {
	return [
		buffer.data[ index ],
		buffer.data[ index + 1 ],
		buffer.data[ index + 2 ],
		buffer.data[ index + 3 ],
	];
}

/**
 * Mixes a colour into a pixel.
 *
 * Alpha is left alone: a retouching brush changes what a pixel looks like, never
 * whether it is there. Blurring a transparent hole into existence is the one thing
 * none of these tools should ever do.
 *
 * @param buffer Modified in place.
 * @param index  Byte offset of the red channel.
 * @param colour Colour to mix in.
 * @param weight How much of it, 0..1.
 */
function blend(
	buffer: PixelBuffer,
	index: number,
	colour: Carry,
	weight: number
): void {
	const w = clamp01( weight );

	for ( let c = 0; c < 3; c++ ) {
		buffer.data[ index + c ] +=
			( colour[ c ] - buffer.data[ index + c ] ) * w;
	}
}

/**
 * Copies a buffer.
 *
 * @param buffer Source.
 */
export function copyBuffer( buffer: PixelBuffer ): PixelBuffer {
	return {
		data: new Uint8ClampedArray( buffer.data ),
		width: buffer.width,
		height: buffer.height,
	};
}

/**
 * Clamps into 0..1.
 *
 * @param value Value.
 */
function clamp01( value: number ): number {
	return Number.isFinite( value ) ? Math.min( 1, Math.max( 0, value ) ) : 0;
}

/**
 * Clamps an integer into a range.
 *
 * @param value Value.
 * @param min   Lowest.
 * @param max   Highest.
 */
function clampInt( value: number, min: number, max: number ): number {
	return Math.min( max, Math.max( min, value ) );
}

/** The retouching modes offered by the retouch tool, in picker order. */
export const RETOUCH_MODES: Array< { value: PixelOp; label: string } > = [
	{ value: 'blur', label: 'Blur' },
	{ value: 'sharpen', label: 'Sharpen' },
	{ value: 'smudge', label: 'Smudge' },
	{ value: 'heal', label: 'Heal' },
];

/** The modes offered by the dodge/burn tool, in picker order. */
export const TONE_MODES: Array< { value: PixelOp; label: string } > = [
	{ value: 'dodge', label: 'Dodge' },
	{ value: 'burn', label: 'Burn' },
	{ value: 'sponge', label: 'Desaturate' },
	{ value: 'saturate', label: 'Saturate' },
];
