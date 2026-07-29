import { describe, expect, it } from 'vitest';
import {
	appendPathPoint,
	buildSelectionMask,
	isEmptySelection,
	selectionBounds,
	selectionFromDrag,
	selectionToPath,
	traceMask,
} from '../../src/model/selection';
import type { Selection } from '../../src/model/selection';

describe( 'isEmptySelection', () => {
	it( 'treats null and degenerate selections as empty', () => {
		expect( isEmptySelection( null ) ).toBe( true );
		expect( isEmptySelection( { shape: 'rect', points: [] } ) ).toBe( true );
		expect(
			isEmptySelection( { shape: 'rect', points: [ { x: 0.5, y: 0.5 } ] } )
		).toBe( true );
	} );

	it( 'treats a sliver as empty, so a stray click does not select', () => {
		expect(
			isEmptySelection(
				selectionFromDrag( 'rect', { x: 0.5, y: 0.5 }, { x: 0.5005, y: 0.5005 } )
			)
		).toBe( true );
	} );

	it( 'accepts a real region', () => {
		expect(
			isEmptySelection(
				selectionFromDrag( 'rect', { x: 0.1, y: 0.1 }, { x: 0.6, y: 0.6 } )
			)
		).toBe( false );
	} );
} );

describe( 'selectionFromDrag', () => {
	it( 'normalises corners whichever way the drag went', () => {
		const forward = selectionFromDrag( 'rect', { x: 0.2, y: 0.3 }, { x: 0.7, y: 0.8 } );
		const backward = selectionFromDrag( 'rect', { x: 0.7, y: 0.8 }, { x: 0.2, y: 0.3 } );

		expect( forward.points ).toEqual( backward.points );
	} );

	it( 'clamps a drag that left the canvas', () => {
		const s = selectionFromDrag( 'rect', { x: -1, y: -1 }, { x: 2, y: 2 } );

		expect( s.points[ 0 ] ).toEqual( { x: 0, y: 0 } );
		expect( s.points[ 1 ] ).toEqual( { x: 1, y: 1 } );
	} );
} );

describe( 'selectionBounds', () => {
	it( 'measures a rectangle', () => {
		const b = selectionBounds(
			selectionFromDrag( 'rect', { x: 0.25, y: 0.1 }, { x: 0.75, y: 0.6 } )
		);

		expect( b.x ).toBeCloseTo( 0.25, 6 );
		expect( b.w ).toBeCloseTo( 0.5, 6 );
		expect( b.h ).toBeCloseTo( 0.5, 6 );
	} );

	it( 'measures a freeform path by its extremes', () => {
		const lasso: Selection = {
			shape: 'lasso',
			points: [
				{ x: 0.2, y: 0.4 },
				{ x: 0.9, y: 0.1 },
				{ x: 0.5, y: 0.8 },
			],
		};
		const b = selectionBounds( lasso );

		expect( b.x ).toBeCloseTo( 0.2, 6 );
		expect( b.y ).toBeCloseTo( 0.1, 6 );
		expect( b.w ).toBeCloseTo( 0.7, 6 );
		expect( b.h ).toBeCloseTo( 0.7, 6 );
	} );

	it( 'returns zeros for an empty path rather than infinities', () => {
		expect( selectionBounds( { shape: 'lasso', points: [] } ) ).toEqual( {
			x: 0,
			y: 0,
			w: 0,
			h: 0,
		} );
	} );
} );

describe( 'selectionToPath', () => {
	it( 'closes a rectangle', () => {
		const d = selectionToPath(
			selectionFromDrag( 'rect', { x: 0, y: 0 }, { x: 0.5, y: 0.5 } ),
			200,
			100
		);

		expect( d.startsWith( 'M' ) ).toBe( true );
		expect( d.endsWith( 'Z' ) ).toBe( true );
	} );

	it( 'draws an ellipse as two arcs', () => {
		// One arc command cannot close a full ellipse; it needs a pair.
		const d = selectionToPath(
			{ shape: 'ellipse', points: [ { x: 0, y: 0 }, { x: 1, y: 1 } ] },
			100,
			100
		);

		expect( d.match( /a /g ) ).toHaveLength( 2 );
		expect( d.endsWith( 'Z' ) ).toBe( true );
	} );

	it( 'traces every vertex of a freeform path', () => {
		const d = selectionToPath(
			{
				shape: 'lasso',
				points: [
					{ x: 0, y: 0 },
					{ x: 1, y: 0 },
					{ x: 1, y: 1 },
				],
			},
			100,
			100
		);

		expect( d.match( /L /g ) ).toHaveLength( 2 );
		expect( d.endsWith( 'Z' ) ).toBe( true );
	} );

	it( 'returns nothing for a path too short to close', () => {
		expect(
			selectionToPath( { shape: 'lasso', points: [ { x: 0, y: 0 } ] }, 100, 100 )
		).toBe( '' );
	} );

	it( 'scales with the viewport', () => {
		const small = selectionToPath(
			selectionFromDrag( 'rect', { x: 0, y: 0 }, { x: 1, y: 1 } ),
			100,
			100
		);
		const large = selectionToPath(
			selectionFromDrag( 'rect', { x: 0, y: 0 }, { x: 1, y: 1 } ),
			200,
			200
		);

		expect( small ).not.toBe( large );
		expect( large ).toContain( '200' );
	} );
} );

describe( 'appendPathPoint', () => {
	it( 'drops points that barely moved', () => {
		// A pointer emits far more samples than an outline needs.
		const points = appendPathPoint( [ { x: 0.5, y: 0.5 } ], { x: 0.5005, y: 0.5005 } );

		expect( points ).toHaveLength( 1 );
	} );

	it( 'keeps points that moved enough', () => {
		const points = appendPathPoint( [ { x: 0.5, y: 0.5 } ], { x: 0.6, y: 0.6 } );

		expect( points ).toHaveLength( 2 );
	} );

	it( 'records every point when thinning is switched off', () => {
		// Polygon vertices are placed deliberately and must never be dropped.
		const points = appendPathPoint( [ { x: 0.5, y: 0.5 } ], { x: 0.5001, y: 0.5 }, 0 );

		expect( points ).toHaveLength( 2 );
	} );

	it( 'clamps points to the canvas', () => {
		const points = appendPathPoint( [], { x: -3, y: 9 }, 0 );

		expect( points[ 0 ] ).toEqual( { x: 0, y: 1 } );
	} );

	it( 'bounds the path so a long drag cannot grow without limit', () => {
		let points: Array< { x: number; y: number } > = [];

		for ( let i = 0; i < 2000; i++ ) {
			points = appendPathPoint( points, { x: ( i % 100 ) / 100, y: i / 2000 }, 0 );
		}

		expect( points.length ).toBeLessThanOrEqual( 600 );
	} );
} );

describe( 'buildSelectionMask', () => {
	it( 'returns nothing when there is nothing to mask', () => {
		expect( buildSelectionMask( null, 10, 10 ) ).toBeNull();
		expect(
			buildSelectionMask( { shape: 'rect', points: [] }, 10, 10 )
		).toBeNull();
	} );

	it( 'returns nothing for a zero-sized canvas', () => {
		expect(
			buildSelectionMask(
				selectionFromDrag( 'rect', { x: 0, y: 0 }, { x: 1, y: 1 } ),
				0,
				0
			)
		).toBeNull();
	} );

	it( 'degrades to null when there is no 2D context', () => {
		// jsdom ships no canvas backend, which is exactly the shape of a browser that
		// refuses a context. It must return null rather than throw.
		expect( () =>
			buildSelectionMask(
				selectionFromDrag( 'rect', { x: 0, y: 0 }, { x: 1, y: 1 } ),
				10,
				10
			)
		).not.toThrow();
	} );

	it( 'produces a canvas the size of the document', () => {
		// The mask has to line up pixel for pixel with what it clips, so the size is
		// worth pinning even though the drawing itself needs a real canvas.
		const calls: string[] = [];
		const original = HTMLCanvasElement.prototype.getContext;

		HTMLCanvasElement.prototype.getContext = function () {
			return {
				fillStyle: '',
				beginPath: () => calls.push( 'beginPath' ),
				rect: () => calls.push( 'rect' ),
				ellipse: () => calls.push( 'ellipse' ),
				moveTo: () => {},
				lineTo: () => {},
				closePath: () => {},
				fill: () => calls.push( 'fill' ),
			} as unknown as CanvasRenderingContext2D;
		} as unknown as typeof original;

		try {
			const mask = buildSelectionMask(
				selectionFromDrag( 'rect', { x: 0, y: 0 }, { x: 0.5, y: 0.5 } ),
				64,
				32
			);

			expect( mask?.width ).toBe( 64 );
			expect( mask?.height ).toBe( 32 );
			expect( calls ).toContain( 'rect' );
			expect( calls ).toContain( 'fill' );
		} finally {
			HTMLCanvasElement.prototype.getContext = original;
		}
	} );

	it( 'rasterises an ellipse as an ellipse, not its bounding box', () => {
		const calls: string[] = [];
		const original = HTMLCanvasElement.prototype.getContext;

		HTMLCanvasElement.prototype.getContext = function () {
			return {
				fillStyle: '',
				beginPath: () => {},
				rect: () => calls.push( 'rect' ),
				ellipse: () => calls.push( 'ellipse' ),
				moveTo: () => {},
				lineTo: () => {},
				closePath: () => {},
				fill: () => {},
			} as unknown as CanvasRenderingContext2D;
		} as unknown as typeof original;

		try {
			buildSelectionMask(
				{ shape: 'ellipse', points: [ { x: 0, y: 0 }, { x: 1, y: 1 } ] },
				32,
				32
			);

			expect( calls ).toContain( 'ellipse' );
			expect( calls ).not.toContain( 'rect' );
		} finally {
			HTMLCanvasElement.prototype.getContext = original;
		}
	} );
} );

describe( 'traceMask', () => {
	/**
	 * Builds a mask with one filled rectangle.
	 *
	 * @param width  Mask width.
	 * @param height Mask height.
	 * @param rect   Region to fill.
	 */
	function maskWith(
		width: number,
		height: number,
		rect: { x: number; y: number; w: number; h: number }
	) {
		const data = new Uint8ClampedArray( width * height * 4 );

		for ( let y = rect.y; y < rect.y + rect.h; y++ ) {
			for ( let x = rect.x; x < rect.x + rect.w; x++ ) {
				data[ ( y * width + x ) * 4 + 3 ] = 255;
			}
		}

		return { data, width, height };
	}

	it( 'returns nothing for an empty mask', () => {
		expect(
			traceMask( { data: new Uint8ClampedArray( 400 ), width: 10, height: 10 } )
		).toEqual( [] );
	} );

	it( 'traces a rectangle back to its own corners', () => {
		const points = traceMask( maskWith( 40, 40, { x: 10, y: 10, w: 20, h: 20 } ) );

		expect( points.length ).toBeGreaterThan( 3 );

		const xs = points.map( ( p ) => p.x );
		const ys = points.map( ( p ) => p.y );

		// 10/40 and 29/40 -- the last filled pixel, not one past it.
		expect( Math.min( ...xs ) ).toBeCloseTo( 0.25, 5 );
		expect( Math.max( ...xs ) ).toBeCloseTo( 29 / 40, 5 );
		expect( Math.min( ...ys ) ).toBeCloseTo( 0.25, 5 );
		expect( Math.max( ...ys ) ).toBeCloseTo( 29 / 40, 5 );
	} );

	it( 'produces coordinates that are normalised, not pixels', () => {
		for ( const point of traceMask(
			maskWith( 64, 32, { x: 4, y: 4, w: 40, h: 20 } )
		) ) {
			expect( point.x ).toBeGreaterThanOrEqual( 0 );
			expect( point.x ).toBeLessThanOrEqual( 1 );
			expect( point.y ).toBeGreaterThanOrEqual( 0 );
			expect( point.y ).toBeLessThanOrEqual( 1 );
		}
	} );

	it( 'thins a long boundary to the requested ceiling', () => {
		const points = traceMask( maskWith( 200, 200, { x: 2, y: 2, w: 196, h: 196 } ), 40 );

		expect( points.length ).toBeLessThanOrEqual( 41 );
		expect( points.length ).toBeGreaterThan( 3 );
	} );

	it( 'survives a single isolated pixel without looping forever', () => {
		const points = traceMask( maskWith( 10, 10, { x: 5, y: 5, w: 1, h: 1 } ) );

		expect( points ).toEqual( [ { x: 0.5, y: 0.5 } ] );
	} );

	it( 'traces a region that touches the mask edge', () => {
		const points = traceMask( maskWith( 20, 20, { x: 0, y: 0, w: 20, h: 20 } ) );

		expect( points.length ).toBeGreaterThan( 3 );
	} );

	it( 'round-trips into a selection the rest of the editor understands', () => {
		const points = traceMask( maskWith( 40, 40, { x: 8, y: 8, w: 24, h: 24 } ) );
		const selection: Selection = { shape: 'lasso', points };

		expect( isEmptySelection( selection ) ).toBe( false );
		expect( selectionToPath( selection, 100, 100 ).endsWith( 'Z' ) ).toBe( true );
	} );
} );
