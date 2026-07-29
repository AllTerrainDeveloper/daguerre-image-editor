/**
 * Histogram binning.
 *
 * This module is the pure half: bytes in, buckets out, no Pixi and no canvas, so it
 * is unit-tested in jsdom without a GPU.
 *
 * It runs once per animation frame during a slider drag, so the inner loop is on
 * the hot path. Measured on a 256px readback (~44k pixels) it costs around 2.5ms
 * with floating-point luminance, which is most of the histogram's total budget --
 * the GPU readback itself is only ~1.4ms. Hence the integer luminance below.
 */

/** Bucket counts for one frame. */
export interface Histogram {
	r: Uint32Array;
	g: Uint32Array;
	b: Uint32Array;
	luma: Uint32Array;
	/** Total pixels counted, after transparent pixels were skipped. */
	total: number;
	/** Scale reference for drawing. See `histogramPeak()`. */
	peak: number;
}

/**
 * Rec. 709 luminance weights scaled to 1/256, for integer luminance.
 *
 * `(55*r + 183*g + 18*b) >> 8` replaces three float multiplies and a `Math.round()`
 * per pixel with three integer multiplies and a shift. On a 44k-pixel readback that
 * is the difference between the histogram fitting comfortably in a frame and not.
 *
 * The weights are chosen to sum to exactly 256, which makes the approximation
 * *better* than the float version in the one case that is easy to see: a neutral
 * grey of value `i` maps to `(256 * i) >> 8`, which is exactly `i`. A flat grey
 * ramp therefore produces a perfectly flat luminance histogram with no rounding
 * artefacts — and a grey ramp that looked bumpy is exactly the sort of thing
 * someone would file a bug about.
 *
 * Against true Rec. 709 the largest error is about 1.35 buckets, pinned by a test.
 * Most of that is the truncating shift rather than the weights; adding a `+ 128`
 * round would halve it, but it would also push pure red from bucket 54 to 55, and
 * 54 is the correct answer. Either way the error is half a percent of the plot's
 * width — a sub-pixel shift in a 256-bucket bar chart, which is not a meaningful
 * quantity for a visualisation whose job is to show shape.
 */
const LUMA_R_256 = 55;
const LUMA_G_256 = 183;
const LUMA_B_256 = 18;

/**
 * Returns the count to scale a histogram plot against.
 *
 * The extreme buckets are excluded from the search. A photograph with any clipped
 * highlights or a large flat black region piles tens of thousands of pixels into
 * bucket 0 or 255, and scaling to that spike flattens the entire rest of the curve
 * into an unreadable line along the bottom. Ignoring the two ends gives a plot that
 * shows the distribution people actually want to see, while the clipping itself
 * stays visible as a bar that runs off the top.
 *
 * @param channels Bucket arrays to consider.
 * @return The largest interior count, or the largest overall when the interior is empty.
 */
export function histogramPeak( channels: Uint32Array[] ): number {
	let interior = 0;
	let overall = 0;

	for ( const bins of channels ) {
		for ( let i = 0; i < 256; i++ ) {
			const count = bins[ i ];

			if ( count > overall ) {
				overall = count;
			}

			if ( i > 0 && i < 255 && count > interior ) {
				interior = count;
			}
		}
	}

	return interior > 0 ? interior : overall;
}

/**
 * Bins RGBA bytes into per-channel and luminance histograms.
 *
 * Fully transparent pixels are skipped. A render target is cleared to transparent
 * black, so any letterboxing around a non-square image would otherwise dump a huge
 * spike into bucket 0 of every channel and make the plot meaningless.
 *
 * @param pixels Tightly packed RGBA bytes, four per pixel.
 * @return Bucket counts.
 */
export function computeHistogram(
	pixels: Uint8ClampedArray | Uint8Array
): Histogram {
	const r = new Uint32Array( 256 );
	const g = new Uint32Array( 256 );
	const b = new Uint32Array( 256 );
	const luma = new Uint32Array( 256 );

	let total = 0;

	for ( let i = 0; i + 3 < pixels.length; i += 4 ) {
		if ( pixels[ i + 3 ] === 0 ) {
			continue;
		}

		const red = pixels[ i ];
		const green = pixels[ i + 1 ];
		const blue = pixels[ i + 2 ];

		r[ red ]++;
		g[ green ]++;
		b[ blue ]++;
		luma[
			( LUMA_R_256 * red + LUMA_G_256 * green + LUMA_B_256 * blue ) >> 8
		]++;

		total++;
	}

	return { r, g, b, luma, total, peak: histogramPeak( [ r, g, b, luma ] ) };
}

/** An empty histogram, for the first paint before any pixels have been read. */
export function emptyHistogram(): Histogram {
	return {
		r: new Uint32Array( 256 ),
		g: new Uint32Array( 256 ),
		b: new Uint32Array( 256 ),
		luma: new Uint32Array( 256 ),
		total: 0,
		peak: 0,
	};
}
