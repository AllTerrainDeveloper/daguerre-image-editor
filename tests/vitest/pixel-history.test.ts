import { describe, expect, it } from 'vitest';
import {
	MAX_TILES,
	TILE_SIZE,
	TileCollector,
	dabRegion,
	tileKey,
	tilesCovering,
} from '../../src/model/pixel-history';

describe( 'tilesCovering', () => {
	it( 'returns the one tile a small region sits in', () => {
		const tiles = tilesCovering( { x: 10, y: 10, width: 20, height: 20 }, 1024, 1024 );

		expect( tiles ).toEqual( [
			{ x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE },
		] );
	} );

	it( 'covers every tile a region straddles', () => {
		// Spanning the boundary at 256 in both axes touches four tiles.
		const tiles = tilesCovering(
			{ x: TILE_SIZE - 5, y: TILE_SIZE - 5, width: 10, height: 10 },
			1024,
			1024
		);

		expect( tiles ).toHaveLength( 4 );
	} );

	it( 'clips the last row and column to the canvas', () => {
		const tiles = tilesCovering( { x: 0, y: 0, width: 400, height: 400 }, 300, 300 );
		const last = tiles[ tiles.length - 1 ];

		expect( last.x + last.width ).toBe( 300 );
		expect( last.y + last.height ).toBe( 300 );
	} );

	it( 'ignores the part of a region that falls off the canvas', () => {
		const tiles = tilesCovering(
			{ x: -500, y: -500, width: 520, height: 520 },
			512,
			512
		);

		for ( const tile of tiles ) {
			expect( tile.x ).toBeGreaterThanOrEqual( 0 );
			expect( tile.y ).toBeGreaterThanOrEqual( 0 );
		}
	} );

	it( 'returns nothing for a degenerate region or canvas', () => {
		expect( tilesCovering( { x: 0, y: 0, width: 0, height: 10 }, 100, 100 ) ).toEqual(
			[]
		);
		expect( tilesCovering( { x: 0, y: 0, width: 10, height: 10 }, 0, 0 ) ).toEqual(
			[]
		);
	} );
} );

describe( 'tileKey', () => {
	it( 'gives every pixel in a tile the same key', () => {
		expect( tileKey( { x: 0, y: 0, width: 1, height: 1 } ) ).toBe(
			tileKey( { x: TILE_SIZE - 1, y: TILE_SIZE - 1, width: 1, height: 1 } )
		);
	} );

	it( 'distinguishes neighbouring tiles', () => {
		expect( tileKey( { x: 0, y: 0, width: 1, height: 1 } ) ).not.toBe(
			tileKey( { x: TILE_SIZE, y: 0, width: 1, height: 1 } )
		);
	} );
} );

describe( 'dabRegion', () => {
	it( 'is centred on the dab and covers its diameter', () => {
		const rect = dabRegion( 100, 100, 40 );

		expect( rect.x ).toBeLessThanOrEqual( 80 );
		expect( rect.y ).toBeLessThanOrEqual( 80 );
		expect( rect.x + rect.width ).toBeGreaterThanOrEqual( 120 );
		expect( rect.y + rect.height ).toBeGreaterThanOrEqual( 120 );
	} );

	it( 'never collapses to nothing for a tiny brush', () => {
		const rect = dabRegion( 5, 5, 0 );

		expect( rect.width ).toBeGreaterThan( 0 );
		expect( rect.height ).toBeGreaterThan( 0 );
	} );
} );

describe( 'TileCollector', () => {
	/** Stands in for reading pixels off a layer. */
	const capture = () => document.createElement( 'canvas' );

	it( 'captures a tile once however many dabs touch it', () => {
		const collector = new TileCollector( 1024, 1024 );
		let reads = 0;

		for ( let i = 0; i < 20; i++ ) {
			collector.add( { x: 10 + i, y: 10, width: 4, height: 4 }, () => {
				reads++;

				return capture();
			} );
		}

		expect( collector.size ).toBe( 1 );
		expect( reads ).toBe( 1 );
	} );

	it( 'grows as a stroke moves across tiles', () => {
		const collector = new TileCollector( 1024, 1024 );

		collector.add( { x: 10, y: 10, width: 4, height: 4 }, capture );
		collector.add( { x: 600, y: 10, width: 4, height: 4 }, capture );

		expect( collector.size ).toBe( 2 );
	} );

	it( 'records an empty tile as null rather than skipping it', () => {
		// A tile that was empty still has to be restored to empty, or undoing a stroke
		// on a fresh layer would leave the paint behind.
		const collector = new TileCollector( 512, 512 );

		collector.add( { x: 10, y: 10, width: 4, height: 4 }, () => null );

		const patch = collector.toPatch( 'layer-1' );

		expect( patch.tiles ).toHaveLength( 1 );
		expect( patch.tiles[ 0 ].pixels ).toBeNull();
		expect( patch.complete ).toBe( true );
	} );

	it( 'gives up rather than capturing an unbounded region', () => {
		// A flood fill can touch the whole document. Capturing a hundred megabytes to
		// make one click undoable is worse than the click not being undoable.
		const collector = new TileCollector( 8192, 8192 );

		collector.add( { x: 0, y: 0, width: 8192, height: 8192 }, capture );

		const patch = collector.toPatch( 'layer-1' );

		expect( patch.complete ).toBe( false );
		expect( patch.tiles ).toHaveLength( 0 );
	} );

	it( 'stays under the cap for a region that only just fits', () => {
		const edge = Math.floor( Math.sqrt( MAX_TILES ) ) * TILE_SIZE;
		const collector = new TileCollector( edge, edge );

		collector.add( { x: 0, y: 0, width: edge, height: edge }, capture );

		expect( collector.toPatch( 'layer-1' ).complete ).toBe( true );
	} );

	it( 'names the layer the tiles came from', () => {
		const collector = new TileCollector( 512, 512 );

		collector.add( { x: 0, y: 0, width: 4, height: 4 }, capture );

		expect( collector.toPatch( 'paint-7' ).layerId ).toBe( 'paint-7' );
	} );
} );
