import { describe, expect, it } from 'vitest';
import {
	applyPixelDab,
	boxBlur,
	dabFalloff,
	dabRect,
	ringAverage,
	sampleAt,
} from '../../src/engine/pixel-tools';
import type { PixelBuffer } from '../../src/engine/pixel-tools';

/**
 * Builds a solid buffer.
 *
 * @param width  Pixels.
 * @param height Pixels.
 * @param rgba   Fill colour.
 */
function solid(
	width: number,
	height: number,
	rgba: [ number, number, number, number ] = [ 128, 128, 128, 255 ]
): PixelBuffer {
	const data = new Uint8ClampedArray( width * height * 4 );

	for ( let i = 0; i < width * height; i++ ) {
		data.set( rgba, i * 4 );
	}

	return { data, width, height };
}

/**
 * Reads one pixel as a tuple.
 *
 * @param buffer Buffer.
 * @param x      Coordinate.
 * @param y      Coordinate.
 */
function at( buffer: PixelBuffer, x: number, y: number ): number[] {
	const index = ( y * buffer.width + x ) * 4;

	return [ ...buffer.data.slice( index, index + 4 ) ];
}

describe( 'dabRect', () => {
	it( 'clips a dab to the buffer', () => {
		const rect = dabRect( solid( 20, 20 ), 2, 2, 10 );

		expect( rect ).toEqual( { x: 0, y: 0, width: 13, height: 13 } );
	} );

	it( 'returns nothing for a dab entirely outside', () => {
		expect( dabRect( solid( 20, 20 ), -50, -50, 4 ) ).toBeNull();
		expect( dabRect( solid( 20, 20 ), 500, 5, 4 ) ).toBeNull();
	} );
} );

describe( 'dabFalloff', () => {
	it( 'is full at the centre and nothing outside', () => {
		expect( dabFalloff( 10, 10, 10.5, 10.5, 8, 0.5 ) ).toBe( 1 );
		expect( dabFalloff( 30, 10, 10.5, 10.5, 8, 0.5 ) ).toBe( 0 );
	} );

	it( 'falls off smoothly between the hard core and the edge', () => {
		const near = dabFalloff( 15, 10, 10.5, 10.5, 8, 0.2 );
		const far = dabFalloff( 17, 10, 10.5, 10.5, 8, 0.2 );

		expect( near ).toBeGreaterThan( far );
		expect( far ).toBeGreaterThan( 0 );
		expect( near ).toBeLessThan( 1 );
	} );

	it( 'a hardness of one has no gradient at all', () => {
		// Every pixel inside the radius is fully affected, which is what "hard" means.
		expect( dabFalloff( 17, 10, 10.5, 10.5, 8, 1 ) ).toBe( 1 );
	} );
} );

describe( 'boxBlur', () => {
	it( 'averages a neighbourhood', () => {
		const buffer = solid( 4, 1, [ 0, 0, 0, 255 ] );

		buffer.data.set( [ 200, 200, 200, 255 ], 0 );

		// One row, so the vertical pass clamps onto it: the 3x3 window over pixel 1
		// reads 200, 0, 0.
		const blurred = boxBlur( buffer, 1 );

		expect( at( blurred, 1, 0 )[ 0 ] ).toBe( Math.round( 200 / 3 ) );
	} );

	it( 'leaves a flat field flat, so it cannot darken against the edges', () => {
		const blurred = boxBlur( solid( 8, 8, [ 90, 120, 200, 255 ] ), 3 );

		expect( at( blurred, 0, 0 ) ).toEqual( [ 90, 120, 200, 255 ] );
		expect( at( blurred, 7, 7 ) ).toEqual( [ 90, 120, 200, 255 ] );
	} );

	it( 'does not modify the buffer it was given', () => {
		const buffer = solid( 8, 8, [ 0, 0, 0, 255 ] );

		buffer.data.set( [ 255, 255, 255, 255 ], 0 );
		boxBlur( buffer, 2 );

		expect( at( buffer, 0, 0 ) ).toEqual( [ 255, 255, 255, 255 ] );
		expect( at( buffer, 1, 0 ) ).toEqual( [ 0, 0, 0, 255 ] );
	} );

	it( 'spreads a single bright pixel over the kernel', () => {
		const buffer = solid( 11, 11, [ 0, 0, 0, 255 ] );

		buffer.data.set( [ 255, 255, 255, 255 ], ( 5 * 11 + 5 ) * 4 );

		const blurred = boxBlur( buffer, 2 );

		expect( at( blurred, 5, 5 )[ 0 ] ).toBeGreaterThan( 0 );
		expect( at( blurred, 5, 5 )[ 0 ] ).toBeLessThan( 255 );
		expect( at( blurred, 7, 5 )[ 0 ] ).toBeGreaterThan( 0 );
		expect( at( blurred, 8, 5 )[ 0 ] ).toBe( 0 );
	} );
} );

describe( 'sampleAt', () => {
	it( 'clamps rather than wrapping or reading out of bounds', () => {
		const buffer = solid( 3, 3, [ 10, 20, 30, 255 ] );

		expect( sampleAt( buffer, -8, -8 ) ).toEqual( [ 10, 20, 30, 255 ] );
		expect( sampleAt( buffer, 99, 99 ) ).toEqual( [ 10, 20, 30, 255 ] );
	} );
} );

describe( 'ringAverage', () => {
	it( 'reads outside the dab, not inside it', () => {
		// A white field with a black blob in the middle: the ring must come back white,
		// which is exactly what makes heal fill a spot with its surroundings.
		const buffer = solid( 41, 41, [ 255, 255, 255, 255 ] );

		for ( let y = 15; y < 26; y++ ) {
			for ( let x = 15; x < 26; x++ ) {
				buffer.data.set( [ 0, 0, 0, 255 ], ( y * 41 + x ) * 4 );
			}
		}

		const ring = ringAverage( buffer, 20, 20, 6 );

		expect( ring ).not.toBeNull();
		expect( ring?.[ 0 ] ).toBeGreaterThan( 250 );
	} );

	it( 'returns nothing when the ring falls off the buffer', () => {
		expect( ringAverage( solid( 4, 4 ), 400, 400, 20 ) ).toBeNull();
	} );
} );

describe( 'applyPixelDab', () => {
	it( 'reports nothing for a dab that missed', () => {
		expect(
			applyPixelDab( {
				op: 'blur',
				target: solid( 10, 10 ),
				x: -100,
				y: -100,
				radius: 4,
				strength: 1,
			} )
		).toBeNull();
	} );

	it( 'blurs an edge toward its neighbours', () => {
		const buffer = solid( 21, 21, [ 0, 0, 0, 255 ] );

		for ( let y = 0; y < 21; y++ ) {
			for ( let x = 10; x < 21; x++ ) {
				buffer.data.set( [ 255, 255, 255, 255 ], ( y * 21 + x ) * 4 );
			}
		}

		applyPixelDab( {
			op: 'blur',
			target: buffer,
			x: 10,
			y: 10,
			radius: 16,
			strength: 1,
			hardness: 1,
		} );

		// The pixel that was pure black now has some white in it.
		expect( at( buffer, 9, 10 )[ 0 ] ).toBeGreaterThan( 0 );
		expect( at( buffer, 10, 10 )[ 0 ] ).toBeLessThan( 255 );
	} );

	it( 'never changes alpha, so a retouch cannot punch a hole', () => {
		const buffer = solid( 21, 21, [ 40, 40, 40, 200 ] );

		for ( const op of [ 'blur', 'sharpen', 'dodge', 'burn', 'sponge' ] as const ) {
			applyPixelDab( {
				op,
				target: buffer,
				x: 10,
				y: 10,
				radius: 12,
				strength: 1,
			} );

			expect( at( buffer, 10, 10 )[ 3 ] ).toBe( 200 );
		}
	} );

	it( 'dodge lightens and burn darkens', () => {
		const lighter = solid( 21, 21, [ 100, 100, 100, 255 ] );
		const darker = solid( 21, 21, [ 100, 100, 100, 255 ] );

		applyPixelDab( {
			op: 'dodge',
			target: lighter,
			x: 10,
			y: 10,
			radius: 8,
			strength: 0.5,
		} );
		applyPixelDab( {
			op: 'burn',
			target: darker,
			x: 10,
			y: 10,
			radius: 8,
			strength: 0.5,
		} );

		expect( at( lighter, 10, 10 )[ 0 ] ).toBeGreaterThan( 100 );
		expect( at( darker, 10, 10 )[ 0 ] ).toBeLessThan( 100 );
	} );

	it( 'sponge moves colour toward grey and saturate away from it', () => {
		const grey = solid( 21, 21, [ 200, 40, 40, 255 ] );
		const vivid = solid( 21, 21, [ 200, 40, 40, 255 ] );

		applyPixelDab( {
			op: 'sponge',
			target: grey,
			x: 10,
			y: 10,
			radius: 8,
			strength: 0.8,
		} );
		applyPixelDab( {
			op: 'saturate',
			target: vivid,
			x: 10,
			y: 10,
			radius: 8,
			strength: 0.8,
		} );

		const spread = ( pixel: number[] ) =>
			Math.max( ...pixel.slice( 0, 3 ) ) - Math.min( ...pixel.slice( 0, 3 ) );

		expect( spread( at( grey, 10, 10 ) ) ).toBeLessThan( 160 );
		expect( spread( at( vivid, 10, 10 ) ) ).toBeGreaterThan( 160 );
	} );

	it( 'clone copies from the offset sample point', () => {
		// Left half red, right half blue. Cloning with an offset that points left must
		// bring red into the blue side.
		const buffer = solid( 41, 21, [ 0, 0, 255, 255 ] );

		for ( let y = 0; y < 21; y++ ) {
			for ( let x = 0; x < 20; x++ ) {
				buffer.data.set( [ 255, 0, 0, 255 ], ( y * 41 + x ) * 4 );
			}
		}

		applyPixelDab( {
			op: 'clone',
			target: buffer,
			x: 30,
			y: 10,
			radius: 8,
			strength: 1,
			hardness: 1,
			offsetX: 20,
			offsetY: 0,
		} );

		expect( at( buffer, 30, 10 )[ 0 ] ).toBeGreaterThan( 200 );
		expect( at( buffer, 30, 10 )[ 2 ] ).toBeLessThan( 55 );
	} );

	it( 'heal replaces a blemish with the colour around it', () => {
		const buffer = solid( 41, 41, [ 240, 240, 240, 255 ] );

		for ( let y = 18; y < 23; y++ ) {
			for ( let x = 18; x < 23; x++ ) {
				buffer.data.set( [ 10, 10, 10, 255 ], ( y * 41 + x ) * 4 );
			}
		}

		applyPixelDab( {
			op: 'heal',
			target: buffer,
			x: 20,
			y: 20,
			radius: 10,
			strength: 1,
			hardness: 1,
		} );

		expect( at( buffer, 20, 20 )[ 0 ] ).toBeGreaterThan( 200 );
	} );

	it( 'smudge carries a colour along and hands it back', () => {
		const buffer = solid( 41, 21, [ 255, 255, 255, 255 ] );

		for ( let y = 0; y < 21; y++ ) {
			for ( let x = 0; x < 8; x++ ) {
				buffer.data.set( [ 0, 0, 0, 255 ], ( y * 41 + x ) * 4 );
			}
		}

		let carry = null as null | [ number, number, number, number ];

		// Drag from the black side into the white side.
		for ( let x = 4; x < 20; x += 2 ) {
			const result = applyPixelDab( {
				op: 'smudge',
				target: buffer,
				x,
				y: 10,
				radius: 6,
				strength: 0.9,
				hardness: 1,
				carry,
			} );

			carry = result?.carry ?? carry;
		}

		expect( carry ).not.toBeNull();
		// Black has been dragged past where the black region ended.
		expect( at( buffer, 12, 10 )[ 0 ] ).toBeLessThan( 250 );
	} );

	it( 'leaves the source buffer alone when one is given', () => {
		const target = solid( 21, 21, [ 0, 0, 0, 255 ] );
		const source = solid( 21, 21, [ 255, 255, 255, 255 ] );

		applyPixelDab( {
			op: 'clone',
			target,
			source,
			x: 10,
			y: 10,
			radius: 8,
			strength: 1,
			hardness: 1,
		} );

		expect( at( source, 10, 10 ) ).toEqual( [ 255, 255, 255, 255 ] );
		expect( at( target, 10, 10 )[ 0 ] ).toBeGreaterThan( 200 );
	} );

	it( 'restore paints the same pixel back from a pristine copy', () => {
		// What the history brush does: the source is the image before anything was
		// painted, and the offset is zero -- clone with nowhere to go.
		const target = solid( 21, 21, [ 255, 0, 0, 255 ] );
		const pristine = solid( 21, 21, [ 0, 128, 255, 255 ] );

		applyPixelDab( {
			op: 'restore',
			target,
			source: pristine,
			x: 10,
			y: 10,
			radius: 10,
			strength: 1,
			hardness: 1,
		} );

		expect( at( target, 10, 10 ) ).toEqual( [ 0, 128, 255, 255 ] );
		// Outside the dab, the painted-over colour survives.
		expect( at( target, 0, 0 ) ).toEqual( [ 255, 0, 0, 255 ] );
		// And the pristine copy is never written to.
		expect( at( pristine, 10, 10 ) ).toEqual( [ 0, 128, 255, 255 ] );
	} );

	it( 'restore fades at the edge of the dab like every other brush', () => {
		const target = solid( 41, 41, [ 0, 0, 0, 255 ] );
		const pristine = solid( 41, 41, [ 255, 255, 255, 255 ] );

		applyPixelDab( {
			op: 'restore',
			target,
			source: pristine,
			x: 20,
			y: 20,
			radius: 30,
			strength: 1,
			hardness: 0,
		} );

		const centre = at( target, 20, 20 )[ 0 ];
		const edge = at( target, 33, 20 )[ 0 ];

		expect( centre ).toBeGreaterThan( edge );
		expect( edge ).toBeGreaterThan( 0 );
	} );

	it( 'a strength of zero changes nothing', () => {
		const buffer = solid( 21, 21, [ 90, 90, 90, 255 ] );

		applyPixelDab( {
			op: 'dodge',
			target: buffer,
			x: 10,
			y: 10,
			radius: 8,
			strength: 0,
		} );

		expect( at( buffer, 10, 10 ) ).toEqual( [ 90, 90, 90, 255 ] );
	} );
} );
