import { describe, expect, it } from 'vitest';
import {
	computeHistogram,
	emptyHistogram,
	histogramPeak,
} from '../../src/engine/histogram';

/**
 * Builds tightly packed RGBA bytes from a list of colours.
 */
function pixels( colours: Array< [ number, number, number, number ] > ): Uint8ClampedArray {
	const out = new Uint8ClampedArray( colours.length * 4 );

	colours.forEach( ( [ r, g, b, a ], i ) => {
		out[ i * 4 ] = r;
		out[ i * 4 + 1 ] = g;
		out[ i * 4 + 2 ] = b;
		out[ i * 4 + 3 ] = a;
	} );

	return out;
}

describe( 'computeHistogram', () => {
	it( 'puts every pixel of a black image in bucket 0', () => {
		const h = computeHistogram( pixels( new Array( 16 ).fill( [ 0, 0, 0, 255 ] ) ) );

		expect( h.total ).toBe( 16 );
		expect( h.r[ 0 ] ).toBe( 16 );
		expect( h.g[ 0 ] ).toBe( 16 );
		expect( h.b[ 0 ] ).toBe( 16 );
		expect( h.luma[ 0 ] ).toBe( 16 );
	} );

	it( 'puts every pixel of a white image in bucket 255', () => {
		const h = computeHistogram(
			pixels( new Array( 8 ).fill( [ 255, 255, 255, 255 ] ) )
		);

		expect( h.r[ 255 ] ).toBe( 8 );
		expect( h.luma[ 255 ] ).toBe( 8 );
	} );

	it( 'produces a flat distribution for a full-range grey ramp', () => {
		const ramp: Array< [ number, number, number, number ] > = [];

		for ( let i = 0; i < 256; i++ ) {
			ramp.push( [ i, i, i, 255 ] );
		}

		const h = computeHistogram( pixels( ramp ) );

		expect( h.total ).toBe( 256 );

		for ( let i = 0; i < 256; i++ ) {
			expect( h.r[ i ] ).toBe( 1 );
			// Rounding rather than truncating is what keeps luma flat too.
			expect( h.luma[ i ] ).toBe( 1 );
		}
	} );

	it( 'separates the channels of a pure red image', () => {
		const h = computeHistogram( pixels( [ [ 255, 0, 0, 255 ] ] ) );

		expect( h.r[ 255 ] ).toBe( 1 );
		expect( h.g[ 0 ] ).toBe( 1 );
		expect( h.b[ 0 ] ).toBe( 1 );
		// Rec.709 puts pure red at 0.2126 -> 54.
		expect( h.luma[ 54 ] ).toBe( 1 );
	} );

	it( 'skips fully transparent pixels', () => {
		// A render target clears to transparent black; counting that padding would
		// dump a huge spike into bucket 0 and make the plot meaningless.
		const h = computeHistogram(
			pixels( [
				[ 0, 0, 0, 0 ],
				[ 0, 0, 0, 0 ],
				[ 128, 128, 128, 255 ],
			] )
		);

		expect( h.total ).toBe( 1 );
		expect( h.r[ 0 ] ).toBe( 0 );
		expect( h.r[ 128 ] ).toBe( 1 );
	} );

	it( 'counts partially transparent pixels', () => {
		const h = computeHistogram( pixels( [ [ 200, 200, 200, 1 ] ] ) );

		expect( h.total ).toBe( 1 );
		expect( h.r[ 200 ] ).toBe( 1 );
	} );

	it( 'tolerates a truncated final pixel rather than reading past the end', () => {
		const truncated = new Uint8ClampedArray( [ 10, 20, 30, 255, 40, 50 ] );
		const h = computeHistogram( truncated );

		expect( h.total ).toBe( 1 );
	} );

	it( 'returns an all-zero histogram for empty input', () => {
		const h = computeHistogram( new Uint8ClampedArray( 0 ) );

		expect( h.total ).toBe( 0 );
		expect( h.peak ).toBe( 0 );
	} );

	it( 'integer luminance stays within ~1.5 buckets of true Rec. 709', () => {
		// The hot loop uses (55r + 183g + 18b) >> 8 instead of float weights so the
		// histogram fits in an animation frame. This pins the accuracy cost of that
		// trade — about half a percent of the plot's width — so that retuning the
		// weights cannot quietly make it worse.
		const colours: Array< [ number, number, number ] > = [];

		for ( let i = 0; i < 256; i += 17 ) {
			for ( let j = 0; j < 256; j += 37 ) {
				colours.push( [ i, j, ( i + j ) & 255 ] );
			}
		}

		let worst = 0;

		for ( const [ r, g, b ] of colours ) {
			const exact = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			const h = computeHistogram(
				new Uint8ClampedArray( [ r, g, b, 255 ] )
			);
			const bucket = h.luma.findIndex( ( count ) => count > 0 );

			worst = Math.max( worst, Math.abs( bucket - exact ) );
		}

		expect( worst ).toBeLessThan( 1.5 );
	} );
} );

describe( 'histogramPeak', () => {
	it( 'ignores clipping spikes at the extremes', () => {
		// A photo with blown highlights: a huge bucket 255 next to a modest interior.
		const bins = new Uint32Array( 256 );
		bins[ 0 ] = 50_000;
		bins[ 255 ] = 90_000;
		bins[ 100 ] = 300;
		bins[ 180 ] = 450;

		expect( histogramPeak( [ bins ] ) ).toBe( 450 );
	} );

	it( 'falls back to the extremes when there is nothing in between', () => {
		const bins = new Uint32Array( 256 );
		bins[ 0 ] = 1000;

		expect( histogramPeak( [ bins ] ) ).toBe( 1000 );
	} );

	it( 'takes the largest across all supplied channels', () => {
		const a = new Uint32Array( 256 );
		const b = new Uint32Array( 256 );
		a[ 40 ] = 12;
		b[ 90 ] = 77;

		expect( histogramPeak( [ a, b ] ) ).toBe( 77 );
	} );

	it( 'is zero for empty channels', () => {
		expect( histogramPeak( [ new Uint32Array( 256 ) ] ) ).toBe( 0 );
	} );
} );

describe( 'emptyHistogram', () => {
	it( 'is a usable zeroed histogram for the first paint', () => {
		const h = emptyHistogram();

		expect( h.r ).toHaveLength( 256 );
		expect( h.total ).toBe( 0 );
		expect( h.peak ).toBe( 0 );
	} );
} );
