import { describe, expect, it } from 'vitest';
import {
	IDENTITY,
	LUMA_B,
	LUMA_G,
	LUMA_R,
	applyMatrix,
	composeAdjustments,
	contrastMatrix,
	exposureMatrix,
	hueMatrix,
	matrixForOp,
	multiply,
	saturationMatrix,
	temperatureMatrix,
} from '../../src/engine/color-matrix';
import type { ColorMatrix } from '../../src/engine/color-matrix';
import type { Op } from '../../src/model/recipe';
import type { OpSchema } from '../../src/types';

const SCHEMA: OpSchema = {
	exposure: { min: -1, max: 1, default: 0 },
	contrast: { min: -1, max: 1, default: 0 },
	saturation: { min: -1, max: 1, default: 0 },
	vibrance: { min: -1, max: 1, default: 0 },
	temperature: { min: -1, max: 1, default: 0 },
	tint: { min: -1, max: 1, default: 0 },
	hue: { min: -180, max: 180, default: 0 },
	sharpen: { min: 0, max: 1, default: 0 },
	blur: { min: 0, max: 1, default: 0 },
	vignette: { min: -1, max: 1, default: 0 },
	grain: { min: 0, max: 1, default: 0 },
};

function expectMatrixClose( actual: ColorMatrix, expected: ColorMatrix ): void {
	expect( actual ).toHaveLength( 20 );

	for ( let i = 0; i < 20; i++ ) {
		expect( actual[ i ] ).toBeCloseTo( expected[ i ], 6 );
	}
}

describe( 'multiply', () => {
	it( 'leaves a matrix untouched when combined with the identity', () => {
		const m = contrastMatrix( 0.3 );

		expectMatrixClose( multiply( IDENTITY, m ), m );
		expectMatrixClose( multiply( m, IDENTITY ), m );
	} );

	it( 'composes in apply-a-then-b order', () => {
		// Two matrices that do not commute: scale then offset differs from the reverse.
		const scale = exposureMatrix( 0.5 );
		const shift = contrastMatrix( 0.4 );

		const composed = multiply( shift, scale );
		const colour: [ number, number, number, number ] = [ 0.3, 0.45, 0.6, 1 ];

		const sequential = applyMatrix( shift, applyMatrix( scale, colour ) );
		const combined = applyMatrix( composed, colour );

		for ( let i = 0; i < 4; i++ ) {
			expect( combined[ i ] ).toBeCloseTo( sequential[ i ], 10 );
		}
	} );

	it( 'carries the translation column through composition', () => {
		// contrast is the only op with a non-zero offset, so squaring it exercises it.
		const c = contrastMatrix( 0.5 );
		const twice = multiply( c, c );
		const colour: [ number, number, number, number ] = [ 0.2, 0.2, 0.2, 1 ];

		const sequential = applyMatrix( c, applyMatrix( c, colour ) );
		const combined = applyMatrix( twice, colour );

		expect( combined[ 0 ] ).toBeCloseTo( sequential[ 0 ], 10 );
		expect( combined[ 0 ] ).not.toBeCloseTo( colour[ 0 ], 3 );
	} );
} );

describe( 'individual adjustments at rest', () => {
	it( 'every op at its default is the identity', () => {
		for ( const type of Object.keys( SCHEMA ) ) {
			expectMatrixClose(
				matrixForOp( type as Op[ 'type' ], SCHEMA[ type ].default ),
				IDENTITY
			);
		}
	} );
} );

describe( 'exposure', () => {
	it( 'doubles brightness at +0.5 (one stop)', () => {
		const [ r ] = applyMatrix( exposureMatrix( 0.5 ), [ 0.25, 0.25, 0.25, 1 ] );
		expect( r ).toBeCloseTo( 0.5, 10 );
	} );

	it( 'halves brightness at -0.5', () => {
		const [ r ] = applyMatrix( exposureMatrix( -0.5 ), [ 0.5, 0.5, 0.5, 1 ] );
		expect( r ).toBeCloseTo( 0.25, 10 );
	} );

	it( 'leaves alpha alone', () => {
		const [ , , , a ] = applyMatrix( exposureMatrix( 1 ), [ 0.5, 0.5, 0.5, 0.4 ] );
		expect( a ).toBeCloseTo( 0.4, 10 );
	} );
} );

describe( 'contrast', () => {
	it( 'pivots around mid grey', () => {
		const [ r ] = applyMatrix( contrastMatrix( 0.8 ), [ 0.5, 0.5, 0.5, 1 ] );
		expect( r ).toBeCloseTo( 0.5, 10 );
	} );

	it( 'pushes darks down and lights up', () => {
		const m = contrastMatrix( 0.5 );
		expect( applyMatrix( m, [ 0.25, 0, 0, 1 ] )[ 0 ] ).toBeLessThan( 0.25 );
		expect( applyMatrix( m, [ 0.75, 0, 0, 1 ] )[ 0 ] ).toBeGreaterThan( 0.75 );
	} );

	it( 'collapses to flat grey at -1', () => {
		const m = contrastMatrix( -1 );
		expect( applyMatrix( m, [ 0.1, 0, 0, 1 ] )[ 0 ] ).toBeCloseTo( 0.5, 10 );
		expect( applyMatrix( m, [ 0.9, 0, 0, 1 ] )[ 0 ] ).toBeCloseTo( 0.5, 10 );
	} );
} );

describe( 'saturation', () => {
	it( 'collapses colour to its luminance at -1', () => {
		const m = saturationMatrix( -1 );
		const [ r, g, b ] = applyMatrix( m, [ 1, 0, 0, 1 ] );

		expect( r ).toBeCloseTo( 0.2126, 6 );
		expect( g ).toBeCloseTo( 0.2126, 6 );
		expect( b ).toBeCloseTo( 0.2126, 6 );
	} );

	it( 'leaves neutral grey neutral at any value', () => {
		for ( const v of [ -1, -0.5, 0.5, 1 ] ) {
			const [ r, g, b ] = applyMatrix( saturationMatrix( v ), [ 0.4, 0.4, 0.4, 1 ] );
			expect( r ).toBeCloseTo( 0.4, 6 );
			expect( g ).toBeCloseTo( 0.4, 6 );
			expect( b ).toBeCloseTo( 0.4, 6 );
		}
	} );
} );

describe( 'hue', () => {
	it( 'is the identity at 0 degrees', () => {
		expectMatrixClose( hueMatrix( 0 ), IDENTITY );
	} );

	it( 'is the identity at 360 degrees', () => {
		expectMatrixClose( hueMatrix( 360 ), IDENTITY );
	} );

	it( 'round-trips exactly: +120 then -120 returns the original colour', () => {
		// The SVG spec's rounded hueRotate constants drift ~1e-5 per channel here.
		// The exact construction is good to floating-point noise.
		const there = hueMatrix( 120 );
		const back = hueMatrix( -120 );
		const colour: [ number, number, number, number ] = [ 0.8, 0.3, 0.1, 1 ];

		const result = applyMatrix( back, applyMatrix( there, colour ) );

		expect( result[ 0 ] ).toBeCloseTo( colour[ 0 ], 12 );
		expect( result[ 1 ] ).toBeCloseTo( colour[ 1 ], 12 );
		expect( result[ 2 ] ).toBeCloseTo( colour[ 2 ], 12 );
	} );

	it( 'preserves luminance at every angle', () => {
		const colour: [ number, number, number, number ] = [ 0.9, 0.2, 0.4, 1 ];
		const luma = ( c: number[] ) =>
			LUMA_R * c[ 0 ] + LUMA_G * c[ 1 ] + LUMA_B * c[ 2 ];

		for ( const angle of [ -180, -90, -37, 45, 90, 120, 180 ] ) {
			expect( luma( applyMatrix( hueMatrix( angle ), colour ) ) ).toBeCloseTo(
				luma( colour ),
				12
			);
		}
	} );

	it( 'leaves neutral grey neutral, so greys cannot pick up a cast', () => {
		for ( const angle of [ 30, 75, 150, -60 ] ) {
			const [ r, g, b ] = applyMatrix( hueMatrix( angle ), [ 0.5, 0.5, 0.5, 1 ] );
			expect( r ).toBeCloseTo( 0.5, 12 );
			expect( g ).toBeCloseTo( 0.5, 12 );
			expect( b ).toBeCloseTo( 0.5, 12 );
		}
	} );
} );

describe( 'temperature', () => {
	it( 'warms by raising red and lowering blue', () => {
		const [ r, g, b ] = applyMatrix( temperatureMatrix( 1 ), [ 0.5, 0.5, 0.5, 1 ] );

		expect( r ).toBeGreaterThan( 0.5 );
		expect( g ).toBeCloseTo( 0.5, 10 );
		expect( b ).toBeLessThan( 0.5 );
	} );

	it( 'cools in the opposite direction', () => {
		const [ r, , b ] = applyMatrix( temperatureMatrix( -1 ), [ 0.5, 0.5, 0.5, 1 ] );

		expect( r ).toBeLessThan( 0.5 );
		expect( b ).toBeGreaterThan( 0.5 );
	} );
} );

describe( 'composeAdjustments', () => {
	it( 'returns the identity for an empty recipe', () => {
		const { matrix, vibrance } = composeAdjustments( [], SCHEMA );

		expectMatrixClose( matrix, IDENTITY );
		expect( vibrance ).toBe( 0 );
	} );

	it( 'ignores ops sitting at their rest position', () => {
		const ops: Op[] = [
			{ type: 'exposure', v: 0 },
			{ type: 'hue', v: 0 },
		];

		expectMatrixClose( composeAdjustments( ops, SCHEMA ).matrix, IDENTITY );
	} );

	it( 'matches applying the same ops one at a time, in the fixed order', () => {
		const ops: Op[] = [
			{ type: 'hue', v: 40 },
			{ type: 'exposure', v: 0.3 },
			{ type: 'saturation', v: 0.5 },
			{ type: 'contrast', v: -0.2 },
		];

		// MATRIX_OP_ORDER: exposure, contrast, temperature, tint, saturation, hue.
		const sequential = [
			exposureMatrix( 0.3 ),
			contrastMatrix( -0.2 ),
			saturationMatrix( 0.5 ),
			hueMatrix( 40 ),
		].reduce( ( acc, m ) => multiply( m, acc ), IDENTITY );

		expectMatrixClose( composeAdjustments( ops, SCHEMA ).matrix, sequential );
	} );

	it( 'produces the same matrix whatever order the ops arrive in', () => {
		const a: Op[] = [
			{ type: 'contrast', v: 0.4 },
			{ type: 'exposure', v: -0.25 },
		];
		const b: Op[] = [
			{ type: 'exposure', v: -0.25 },
			{ type: 'contrast', v: 0.4 },
		];

		expectMatrixClose(
			composeAdjustments( a, SCHEMA ).matrix,
			composeAdjustments( b, SCHEMA ).matrix
		);
	} );

	it( 'carries vibrance out of band because it is not linear', () => {
		const { matrix, vibrance } = composeAdjustments(
			[ { type: 'vibrance', v: 0.6 } ],
			SCHEMA
		);

		expectMatrixClose( matrix, IDENTITY );
		expect( vibrance ).toBeCloseTo( 0.6, 10 );
	} );

	it( 'carries the spatial effects out of band too', () => {
		// Sharpen, vignette and grain all depend on where a pixel is, so none of
		// them can be a colour matrix. Blur is further out still -- it needs its own
		// separable pass.
		const u = composeAdjustments(
			[
				{ type: 'sharpen', v: 0.4 },
				{ type: 'vignette', v: -0.3 },
				{ type: 'grain', v: 0.2 },
				{ type: 'blur', v: 0.5 },
			],
			SCHEMA
		);

		expectMatrixClose( u.matrix, IDENTITY );
		expect( u.sharpen ).toBeCloseTo( 0.4, 10 );
		expect( u.vignette ).toBeCloseTo( -0.3, 10 );
		expect( u.grain ).toBeCloseTo( 0.2, 10 );
		expect( u.blur ).toBeCloseTo( 0.5, 10 );
	} );
} );
