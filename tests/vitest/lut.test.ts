import { describe, expect, it } from 'vitest';
import {
	IDENTITY_LEVELS,
	LINEAR_CURVE,
	buildLut,
	isIdentityCurves,
	isIdentityLevels,
	isLinear,
	normaliseCurve,
	sampleCurve,
	sampleLevels,
} from '../../src/engine/lut';
import type { CurvePoint } from '../../src/engine/lut';

describe( 'normaliseCurve', () => {
	it( 'falls back to linear for anything unusable', () => {
		expect( normaliseCurve( undefined ) ).toEqual( LINEAR_CURVE );
		expect( normaliseCurve( [] ) ).toEqual( LINEAR_CURVE );
		expect( normaliseCurve( [ [ 0, 0 ] ] ) ).toEqual( LINEAR_CURVE );
	} );

	it( 'sorts points dragged past each other', () => {
		const sorted = normaliseCurve( [
			[ 200, 200 ],
			[ 0, 0 ],
			[ 100, 140 ],
		] );

		expect( sorted.map( ( p ) => p[ 0 ] ) ).toEqual( [ 0, 100, 200 ] );
	} );

	it( 'collapses points sharing an x, so the interpolator cannot divide by zero', () => {
		const curve = normaliseCurve( [
			[ 0, 0 ],
			[ 128, 100 ],
			[ 128, 200 ],
			[ 255, 255 ],
		] );

		expect( curve ).toHaveLength( 3 );
		// Later wins, which is what dragging one point onto another looks like.
		expect( curve[ 1 ] ).toEqual( [ 128, 200 ] );
	} );

	it( 'clamps points outside the graph', () => {
		const curve = normaliseCurve( [
			[ -50, -50 ],
			[ 400, 400 ],
		] );

		expect( curve[ 0 ] ).toEqual( [ 0, 0 ] );
		expect( curve[ 1 ] ).toEqual( [ 255, 255 ] );
	} );
} );

describe( 'sampleCurve', () => {
	it( 'maps a linear curve to the identity', () => {
		const out = sampleCurve( LINEAR_CURVE );

		for ( let i = 0; i < 256; i++ ) {
			expect( out[ i ] ).toBe( i );
		}
	} );

	it( 'passes through its control points', () => {
		const points: CurvePoint[] = [
			[ 0, 0 ],
			[ 128, 180 ],
			[ 255, 255 ],
		];
		const out = sampleCurve( points );

		expect( out[ 0 ] ).toBe( 0 );
		expect( out[ 128 ] ).toBe( 180 );
		expect( out[ 255 ] ).toBe( 255 );
	} );

	it( 'never runs backwards between ascending control points', () => {
		// This is the whole reason for monotone interpolation. A plain cubic spline
		// overshoots here, and an overshoot on a tone curve is a visible inverted
		// patch in a smooth gradient.
		const out = sampleCurve( [
			[ 0, 0 ],
			[ 60, 10 ],
			[ 70, 200 ],
			[ 255, 255 ],
		] );

		for ( let i = 1; i < 256; i++ ) {
			expect( out[ i ] ).toBeGreaterThanOrEqual( out[ i - 1 ] );
		}
	} );

	it( 'stays inside 0..255 for an aggressive curve', () => {
		const out = sampleCurve( [
			[ 0, 255 ],
			[ 40, 0 ],
			[ 200, 255 ],
			[ 255, 0 ],
		] );

		for ( let i = 0; i < 256; i++ ) {
			expect( out[ i ] ).toBeGreaterThanOrEqual( 0 );
			expect( out[ i ] ).toBeLessThanOrEqual( 255 );
		}
	} );

	it( 'holds flat outside the outermost control points', () => {
		const out = sampleCurve( [
			[ 50, 20 ],
			[ 200, 240 ],
		] );

		expect( out[ 0 ] ).toBe( 20 );
		expect( out[ 49 ] ).toBe( 20 );
		expect( out[ 255 ] ).toBe( 240 );
	} );

	it( 'handles a flat segment without producing a spike', () => {
		const out = sampleCurve( [
			[ 0, 128 ],
			[ 128, 128 ],
			[ 255, 255 ],
		] );

		for ( let i = 0; i <= 128; i++ ) {
			expect( out[ i ] ).toBe( 128 );
		}
	} );
} );

describe( 'sampleLevels', () => {
	it( 'is the identity at default settings', () => {
		const out = sampleLevels( IDENTITY_LEVELS );

		for ( let i = 0; i < 256; i++ ) {
			expect( out[ i ] ).toBe( i );
		}
	} );

	it( 'clips below the black point and above the white point', () => {
		const out = sampleLevels( { black: 64, white: 192, gamma: 1 } );

		expect( out[ 0 ] ).toBe( 0 );
		expect( out[ 64 ] ).toBe( 0 );
		expect( out[ 192 ] ).toBe( 255 );
		expect( out[ 255 ] ).toBe( 255 );
		expect( out[ 128 ] ).toBeGreaterThan( 100 );
		expect( out[ 128 ] ).toBeLessThan( 160 );
	} );

	it( 'lifts midtones for gamma above one', () => {
		const brighter = sampleLevels( { black: 0, white: 255, gamma: 2 } );

		expect( brighter[ 128 ] ).toBeGreaterThan( 128 );
		expect( brighter[ 0 ] ).toBe( 0 );
		expect( brighter[ 255 ] ).toBe( 255 );
	} );

	it( 'survives a white point at or below the black point', () => {
		const out = sampleLevels( { black: 200, white: 100, gamma: 1 } );

		expect( out ).toHaveLength( 256 );
		expect( Number.isNaN( out[ 128 ] ) ).toBe( false );
	} );
} );

describe( 'buildLut', () => {
	it( 'is the identity ramp with nothing applied', () => {
		const lut = buildLut();

		for ( let i = 0; i < 256; i++ ) {
			expect( lut[ i * 4 ] ).toBe( i );
			expect( lut[ i * 4 + 1 ] ).toBe( i );
			expect( lut[ i * 4 + 2 ] ).toBe( i );
		}
	} );

	it( 'is 256 RGBA texels', () => {
		expect( buildLut() ).toHaveLength( 1024 );
	} );

	it( 'applies the master curve to every channel', () => {
		const lut = buildLut( {
			rgb: [
				[ 0, 0 ],
				[ 128, 200 ],
				[ 255, 255 ],
			],
		} );

		expect( lut[ 128 * 4 ] ).toBe( 200 );
		expect( lut[ 128 * 4 + 1 ] ).toBe( 200 );
		expect( lut[ 128 * 4 + 2 ] ).toBe( 200 );
	} );

	it( 'applies a per-channel curve to only that channel', () => {
		const lut = buildLut( {
			r: [
				[ 0, 0 ],
				[ 128, 60 ],
				[ 255, 255 ],
			],
		} );

		expect( lut[ 128 * 4 ] ).toBe( 60 );
		expect( lut[ 128 * 4 + 1 ] ).toBe( 128 );
		expect( lut[ 128 * 4 + 2 ] ).toBe( 128 );
	} );

	it( 'composes levels, then master, then channel', () => {
		// One texture fetch per channel regardless of how many curves are stacked.
		const lut = buildLut(
			{
				rgb: [
					[ 0, 0 ],
					[ 255, 255 ],
				],
				g: [
					[ 0, 255 ],
					[ 255, 0 ],
				],
			},
			{ black: 0, white: 255, gamma: 1 }
		);

		// The green curve inverts, so input 0 leaves as 255.
		expect( lut[ 1 ] ).toBe( 255 );
		expect( lut[ 255 * 4 + 1 ] ).toBe( 0 );
	} );

	it( 'fills alpha with the identity ramp for debuggability', () => {
		const lut = buildLut();

		expect( lut[ 3 ] ).toBe( 0 );
		expect( lut[ 128 * 4 + 3 ] ).toBe( 128 );
	} );
} );

describe( 'identity helpers', () => {
	it( 'recognises linear curves', () => {
		expect( isLinear( undefined ) ).toBe( true );
		expect( isLinear( LINEAR_CURVE ) ).toBe( true );
		expect(
			isLinear( [
				[ 0, 0 ],
				[ 128, 200 ],
			] )
		).toBe( false );
	} );

	it( 'recognises an untouched curve set', () => {
		expect( isIdentityCurves( undefined ) ).toBe( true );
		expect( isIdentityCurves( {} ) ).toBe( true );
		expect( isIdentityCurves( { rgb: LINEAR_CURVE } ) ).toBe( true );
		expect(
			isIdentityCurves( {
				b: [
					[ 0, 20 ],
					[ 255, 255 ],
				],
			} )
		).toBe( false );
	} );

	it( 'recognises untouched levels', () => {
		expect( isIdentityLevels( undefined ) ).toBe( true );
		expect( isIdentityLevels( IDENTITY_LEVELS ) ).toBe( true );
		expect( isIdentityLevels( { black: 10, white: 255, gamma: 1 } ) ).toBe( false );
		expect( isIdentityLevels( { black: 0, white: 255, gamma: 1.2 } ) ).toBe( false );
	} );
} );
