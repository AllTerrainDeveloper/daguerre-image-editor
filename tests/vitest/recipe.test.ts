import { describe, expect, it } from 'vitest';
import {
	RECIPE_VERSION,
	defaultRecipe,
	getOp,
	isIdentity,
	resetOps,
	setOp,
	validateRecipe,
} from '../../src/model/recipe';
import type { Recipe } from '../../src/model/recipe';
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

function recipe( ops: Recipe[ 'ops' ] = [] ): Recipe {
	return {
		...defaultRecipe( 42 ),
		ops,
		output: { format: 'image/jpeg', quality: 0.9 },
	};
}

describe( 'defaultRecipe', () => {
	it( 'starts empty and therefore renders the source untouched', () => {
		const r = defaultRecipe( 7 );

		expect( r.source ).toBe( 7 );
		expect( r.ops ).toEqual( [] );
		expect( isIdentity( r ) ).toBe( true );
	} );
} );

describe( 'getOp', () => {
	it( 'returns the stored value', () => {
		expect( getOp( recipe( [ { type: 'hue', v: 90 } ] ), 'hue', SCHEMA ) ).toBe( 90 );
	} );

	it( 'falls back to the rest position when the op is absent', () => {
		expect( getOp( recipe(), 'exposure', SCHEMA ) ).toBe( 0 );
	} );
} );

describe( 'setOp', () => {
	it( 'does not mutate the recipe it was given', () => {
		// The undo stack holds references to previous recipes; mutating in place
		// would silently rewrite history.
		const before = recipe();
		const after = setOp( before, 'contrast', 0.4, SCHEMA );

		expect( before.ops ).toEqual( [] );
		expect( after.ops ).toHaveLength( 1 );
		expect( after ).not.toBe( before );
	} );

	it( 'replaces rather than appends when the op is already set', () => {
		let r = setOp( recipe(), 'contrast', 0.2, SCHEMA );
		r = setOp( r, 'contrast', 0.7, SCHEMA );

		expect( r.ops ).toHaveLength( 1 );
		expect( r.ops[ 0 ].v ).toBeCloseTo( 0.7, 10 );
	} );

	it( 'removes an op moved back to its rest position', () => {
		let r = setOp( recipe(), 'contrast', 0.5, SCHEMA );
		expect( r.ops ).toHaveLength( 1 );

		r = setOp( r, 'contrast', 0, SCHEMA );
		expect( r.ops ).toEqual( [] );
		expect( isIdentity( r ) ).toBe( true );
	} );

	it( 'clamps to the op bounds', () => {
		expect( setOp( recipe(), 'exposure', 9, SCHEMA ).ops[ 0 ].v ).toBe( 1 );
		expect( setOp( recipe(), 'exposure', -9, SCHEMA ).ops[ 0 ].v ).toBe( -1 );
		expect( setOp( recipe(), 'hue', 900, SCHEMA ).ops[ 0 ].v ).toBe( 180 );
	} );

	it( 'stores ops in a canonical order so equal edits serialise identically', () => {
		const a = setOp( setOp( recipe(), 'hue', 30, SCHEMA ), 'exposure', 0.2, SCHEMA );
		const b = setOp( setOp( recipe(), 'exposure', 0.2, SCHEMA ), 'hue', 30, SCHEMA );

		expect( JSON.stringify( a.ops ) ).toBe( JSON.stringify( b.ops ) );
		expect( a.ops[ 0 ].type ).toBe( 'exposure' );
	} );
} );

describe( 'resetOps', () => {
	it( 'clears every adjustment but keeps the source and output settings', () => {
		const r = resetOps( setOp( recipe(), 'hue', 45, SCHEMA ) );

		expect( r.ops ).toEqual( [] );
		expect( r.source ).toBe( 42 );
		expect( r.output.format ).toBe( 'image/jpeg' );
	} );
} );

describe( 'validateRecipe', () => {
	it( 'accepts a well-formed recipe', () => {
		const r = validateRecipe( recipe( [ { type: 'exposure', v: 0.25 } ] ), SCHEMA );

		expect( r.source ).toBe( 42 );
		expect( r.ops ).toHaveLength( 1 );
	} );

	it( 'accepts a JSON string', () => {
		expect( validateRecipe( JSON.stringify( recipe() ), SCHEMA ).source ).toBe( 42 );
	} );

	it( 'rejects malformed JSON', () => {
		expect( () => validateRecipe( '{ nope', SCHEMA ) ).toThrow( /valid JSON/ );
	} );

	it( 'rejects a version this build does not understand', () => {
		expect( () =>
			validateRecipe( { ...recipe(), version: RECIPE_VERSION + 1 }, SCHEMA )
		).toThrow( /Unsupported recipe version/ );
	} );

	it( 'rejects an unknown op instead of dropping it', () => {
		expect( () =>
			validateRecipe( recipe( [ { type: 'teleport', v: 1 } as never ] ), SCHEMA )
		).toThrow( /Unknown recipe operation/ );
	} );

	it( 'rejects a value outside the op bounds', () => {
		expect( () =>
			validateRecipe( recipe( [ { type: 'exposure', v: 4 } ] ), SCHEMA )
		).toThrow( /must be between/ );
	} );

	it( 'lets hue use its own wider range', () => {
		expect(
			validateRecipe( recipe( [ { type: 'hue', v: 175 } ] ), SCHEMA ).ops[ 0 ].v
		).toBe( 175 );
	} );

	it( 'rejects a duplicated op', () => {
		expect( () =>
			validateRecipe(
				recipe( [
					{ type: 'contrast', v: 0.1 },
					{ type: 'contrast', v: 0.2 },
				] ),
				SCHEMA
			)
		).toThrow( /more than once/ );
	} );

	it( 'drops ops sitting at their rest position', () => {
		const r = validateRecipe(
			recipe( [
				{ type: 'exposure', v: 0 },
				{ type: 'contrast', v: 0.3 },
			] ),
			SCHEMA
		);

		expect( r.ops ).toHaveLength( 1 );
		expect( r.ops[ 0 ].type ).toBe( 'contrast' );
	} );

	it( 'rejects a non-numeric value rather than coercing it to zero', () => {
		expect( () =>
			validateRecipe( recipe( [ { type: 'exposure', v: 'bright' as never } ] ), SCHEMA )
		).toThrow( /numeric value/ );
	} );

	it( 'rejects a missing source attachment', () => {
		expect( () => validateRecipe( { ...recipe(), source: 0 }, SCHEMA ) ).toThrow(
			/attachment its pixels came from/
		);
	} );

	it( 'rejects out-of-range output quality', () => {
		expect( () =>
			validateRecipe( { ...recipe(), output: { format: 'image/jpeg', quality: 3 } }, SCHEMA )
		).toThrow( /quality/ );
	} );

	it( 'migrates a v2 recipe, keeping its rotation and flips', () => {
		// v2 cropped the source directly. v3 splits that into an independent canvas
		// and a layer transform. The canvas cannot be sized without the source
		// dimensions, so it comes back zeroed for the editor to fill -- but the parts
		// a user would notice losing survive exactly.
		const v2 = {
			version: 2,
			source: 42,
			ops: [ { type: 'contrast', v: 0.3 } ],
			geometry: {
				crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
				straighten: 4,
				rotate: 90,
				flipH: true,
				flipV: false,
			},
			curves: {},
			levels: { black: 0, white: 255, gamma: 1 },
			output: { format: 'image/jpeg', quality: 0.9 },
		};

		const r = validateRecipe( v2, SCHEMA );

		expect( r.version ).toBe( RECIPE_VERSION );
		expect( r.ops ).toHaveLength( 1 );
		expect( r.layers ).toHaveLength( 1 );
		expect( r.layers[ 0 ].transform.rotation ).toBeCloseTo( 94, 6 );
		expect( r.layers[ 0 ].transform.flipH ).toBe( true );
		expect( r.canvas ).toEqual( { width: 0, height: 0 } );
		expect( r ).not.toHaveProperty( 'geometry' );
	} );

	it( 'migrates a v1 recipe by adding the newer sections at rest', () => {
		const v1 = {
			version: 1,
			source: 9,
			ops: [],
			output: { format: 'image/png', quality: 0.9 },
		};

		const r = validateRecipe( v1, SCHEMA );

		expect( r.version ).toBe( RECIPE_VERSION );
		expect( r.curves ).toEqual( {} );
		expect( isIdentity( r ) ).toBe( true );
	} );

	it( 'rejects a non-object', () => {
		expect( () => validateRecipe( 42, SCHEMA ) ).toThrow( /must be an object/ );
		expect( () => validateRecipe( [], SCHEMA ) ).toThrow( /must be an object/ );
		expect( () => validateRecipe( null, SCHEMA ) ).toThrow( /must be an object/ );
	} );
} );
