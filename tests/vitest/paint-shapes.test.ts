import { describe, expect, it } from 'vitest';
import {
	cssFont,
	hexToRgb,
	rectFromDrag,
	rgbToHex,
	squareDrag,
	starPoints,
	withAlpha,
} from '../../src/engine/paint-shapes';

describe( 'rectFromDrag', () => {
	it( 'normalises whichever way the drag went', () => {
		const forward = rectFromDrag( { x: 10, y: 20 }, { x: 40, y: 60 } );
		const backward = rectFromDrag( { x: 40, y: 60 }, { x: 10, y: 20 } );

		expect( forward ).toEqual( { x: 10, y: 20, width: 30, height: 40 } );
		expect( backward ).toEqual( forward );
	} );
} );

describe( 'squareDrag', () => {
	it( 'takes the longer axis', () => {
		expect( squareDrag( { x: 0, y: 0 }, { x: 30, y: 8 } ) ).toEqual( {
			x: 30,
			y: 30,
		} );
	} );

	it( 'keeps the direction the drag went', () => {
		expect( squareDrag( { x: 100, y: 100 }, { x: 70, y: 95 } ) ).toEqual( {
			x: 70,
			y: 70,
		} );
	} );

	it( 'does not collapse a drag that has not moved', () => {
		// Math.sign( 0 ) is 0, which would place the corner on the anchor and draw
		// nothing; the fallback keeps it pointing somewhere.
		expect( squareDrag( { x: 5, y: 5 }, { x: 5, y: 5 } ) ).toEqual( { x: 5, y: 5 } );
	} );
} );

describe( 'starPoints', () => {
	it( 'alternates outer and inner vertices', () => {
		const points = starPoints( { x: 0, y: 0, width: 100, height: 100 }, 5, 0.5 );

		expect( points ).toHaveLength( 10 );

		const distance = ( index: number ) =>
			Math.hypot( points[ index ].x - 50, points[ index ].y - 50 );

		expect( distance( 0 ) ).toBeCloseTo( 50, 5 );
		expect( distance( 1 ) ).toBeCloseTo( 25, 5 );
	} );

	it( 'starts at the top, so a star looks like a star', () => {
		const points = starPoints( { x: 0, y: 0, width: 100, height: 100 } );

		expect( points[ 0 ].x ).toBeCloseTo( 50, 5 );
		expect( points[ 0 ].y ).toBeCloseTo( 0, 5 );
	} );

	it( 'stays inside its bounding box', () => {
		const points = starPoints( { x: 10, y: 20, width: 60, height: 40 }, 7, 0.4 );

		for ( const point of points ) {
			expect( point.x ).toBeGreaterThanOrEqual( 10 - 1e-6 );
			expect( point.x ).toBeLessThanOrEqual( 70 + 1e-6 );
			expect( point.y ).toBeGreaterThanOrEqual( 20 - 1e-6 );
			expect( point.y ).toBeLessThanOrEqual( 60 + 1e-6 );
		}
	} );
} );

describe( 'cssFont', () => {
	it( 'builds a shorthand the canvas will accept', () => {
		expect(
			cssFont( {
				text: 'x',
				size: 48,
				family: 'Georgia, serif',
				colour: '#000',
				bold: true,
			} )
		).toBe( '700 48px Georgia, serif' );
	} );

	it( 'includes italic only when asked', () => {
		const italic = cssFont( {
			text: 'x',
			size: 12,
			family: 'serif',
			colour: '#000',
			italic: true,
		} );

		expect( italic.startsWith( 'italic ' ) ).toBe( true );
	} );

	it( 'never emits a zero or fractional pixel size', () => {
		expect(
			cssFont( { text: 'x', size: 0.2, family: 'serif', colour: '#000' } )
		).toContain( '1px' );
	} );

	it( 'falls back to a family the browser certainly has', () => {
		expect(
			cssFont( { text: 'x', size: 20, family: '', colour: '#000' } )
		).toContain( 'sans-serif' );
	} );
} );

describe( 'hexToRgb', () => {
	it( 'reads both short and long form', () => {
		expect( hexToRgb( '#fff' ) ).toEqual( [ 255, 255, 255 ] );
		expect( hexToRgb( '2271b1' ) ).toEqual( [ 34, 113, 177 ] );
	} );

	it( 'rejects anything that is not hex', () => {
		expect( hexToRgb( 'rebeccapurple' ) ).toBeNull();
		expect( hexToRgb( '#12345' ) ).toBeNull();
	} );
} );

describe( 'rgbToHex', () => {
	it( 'round-trips through hexToRgb', () => {
		expect( hexToRgb( rgbToHex( 34, 113, 177 ) ) ).toEqual( [ 34, 113, 177 ] );
	} );

	it( 'clamps and rounds', () => {
		expect( rgbToHex( -20, 300, 127.6 ) ).toBe( '#00ff80' );
	} );
} );

describe( 'withAlpha', () => {
	it( 'converts a hex colour to rgba', () => {
		expect( withAlpha( '#ff0000', 0 ) ).toBe( 'rgba( 255, 0, 0, 0 )' );
	} );

	it( 'leaves a colour it cannot parse alone rather than corrupting it', () => {
		expect( withAlpha( 'currentColor', 0.5 ) ).toBe( 'currentColor' );
	} );
} );
