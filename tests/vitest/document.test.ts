import { describe, expect, it } from 'vitest';
import {
	IDENTITY_TRANSFORM,
	MAX_SCALE,
	MIN_CANVAS,
	MIN_SCALE,
	applyCrop,
	clampCanvas,
	clampTransform,
	coverScale,
	fitScale,
	isIdentityTransform,
	isNativeCanvas,
	layerBounds,
	normaliseAngle,
	normaliseCanvas,
	normaliseTransform,
	resizeCanvas,
} from '../../src/model/document';
import type { LayerTransform } from '../../src/model/document';

function transform( patch: Partial< LayerTransform > = {} ): LayerTransform {
	return { ...IDENTITY_TRANSFORM, ...patch };
}

describe( 'isIdentityTransform', () => {
	it( 'is true for a centred, unscaled layer', () => {
		expect( isIdentityTransform( transform() ) ).toBe( true );
	} );

	it( 'is false once anything moved', () => {
		expect( isIdentityTransform( transform( { x: 0.4 } ) ) ).toBe( false );
		expect( isIdentityTransform( transform( { scaleX: 1.2 } ) ) ).toBe( false );
		expect( isIdentityTransform( transform( { scaleY: 1.2 } ) ) ).toBe( false );
		expect( isIdentityTransform( transform( { rotation: 5 } ) ) ).toBe( false );
		expect( isIdentityTransform( transform( { flipH: true } ) ) ).toBe( false );
	} );
} );

describe( 'normaliseAngle', () => {
	it( 'wraps into -180..180', () => {
		expect( normaliseAngle( 0 ) ).toBe( 0 );
		expect( normaliseAngle( 90 ) ).toBe( 90 );
		expect( normaliseAngle( 270 ) ).toBe( -90 );
		expect( normaliseAngle( 360 ) ).toBe( 0 );
		expect( normaliseAngle( 450 ) ).toBe( 90 );
		expect( normaliseAngle( -270 ) ).toBe( 90 );
	} );

	it( 'keeps a full turn from drifting after repeated rotation', () => {
		let angle = 0;

		for ( let i = 0; i < 8; i++ ) {
			angle = normaliseAngle( angle + 90 );
		}

		expect( angle ).toBe( 0 );
	} );
} );

describe( 'clampTransform', () => {
	it( 'bounds each scale axis independently', () => {
		expect( clampTransform( transform( { scaleX: 1000 } ) ).scaleX ).toBe( MAX_SCALE );
		expect( clampTransform( transform( { scaleY: 0 } ) ).scaleY ).toBe( MIN_SCALE );
		// One axis being out of range must not drag the other with it.
		expect( clampTransform( transform( { scaleX: 1000 } ) ).scaleY ).toBe( 1 );
	} );

	it( 'does NOT clamp position, so a layer may hang off the canvas', () => {
		// Scaling an image up to fill a frame necessarily pushes its edges outside.
		const t = clampTransform( transform( { x: -3, y: 4 } ) );

		expect( t.x ).toBe( -3 );
		expect( t.y ).toBe( 4 );
	} );

	it( 'repairs non-finite values back to rest, not to the extreme', () => {
		// Infinity is not "very zoomed in", it is a broken value -- so it falls back
		// to 1 rather than clamping to MAX_SCALE.
		const t = clampTransform(
			transform( { x: NaN, scaleX: Infinity, rotation: NaN } )
		);

		expect( t.x ).toBe( 0.5 );
		expect( t.scaleX ).toBe( 1 );
		expect( t.rotation ).toBe( 0 );
	} );
} );

describe( 'clampCanvas', () => {
	it( 'enforces a minimum', () => {
		expect( clampCanvas( { width: 0, height: -5 }, 1e9 ) ).toEqual( {
			width: MIN_CANVAS,
			height: MIN_CANVAS,
		} );
	} );

	it( 'shrinks proportionally rather than truncating one axis', () => {
		const out = clampCanvas( { width: 4000, height: 2000 }, 1_000_000 );

		expect( out.width * out.height ).toBeLessThanOrEqual( 1_000_000 );
		// A 2:1 canvas that asked for too much comes back 2:1.
		expect( out.width / out.height ).toBeCloseTo( 2, 1 );
	} );

	it( 'leaves an acceptable canvas alone', () => {
		expect( clampCanvas( { width: 800, height: 600 }, 1e9 ) ).toEqual( {
			width: 800,
			height: 600,
		} );
	} );
} );

describe( 'fitScale and coverScale', () => {
	const image = { width: 400, height: 200 };

	it( 'fit keeps the whole image inside', () => {
		const scale = fitScale( image, { width: 200, height: 200 } );

		expect( scale ).toBeCloseTo( 0.5, 6 );
		expect( image.width * scale ).toBeLessThanOrEqual( 200 );
		expect( image.height * scale ).toBeLessThanOrEqual( 200 );
	} );

	it( 'cover fills the canvas, overflowing the other axis', () => {
		const scale = coverScale( image, { width: 200, height: 200 } );

		expect( scale ).toBeCloseTo( 1, 6 );
		expect( image.width * scale ).toBeGreaterThanOrEqual( 200 );
	} );

	it( 'survives a degenerate image', () => {
		expect( fitScale( { width: 0, height: 0 }, { width: 100, height: 100 } ) ).toBe( 1 );
	} );
} );

describe( 'layerBounds', () => {
	const canvas = { width: 400, height: 400 };

	it( 'is the layer size when unrotated and centred', () => {
		const b = layerBounds( { width: 200, height: 100 }, transform(), canvas );

		expect( b.width ).toBeCloseTo( 200, 6 );
		expect( b.height ).toBeCloseTo( 100, 6 );
		expect( b.x ).toBeCloseTo( 100, 6 );
		expect( b.y ).toBeCloseTo( 150, 6 );
	} );

	it( 'grows with rotation so corners are accounted for', () => {
		const b = layerBounds(
			{ width: 100, height: 100 },
			transform( { rotation: 45 } ),
			canvas
		);

		expect( b.width ).toBeCloseTo( 141.42, 1 );
	} );

	it( 'scales each axis independently', () => {
		const b = layerBounds(
			{ width: 100, height: 100 },
			transform( { scaleX: 2, scaleY: 0.5 } ),
			canvas
		);

		expect( b.width ).toBeCloseTo( 200, 6 );
		expect( b.height ).toBeCloseTo( 50, 6 );
	} );
} );

describe( 'applyCrop', () => {
	it( 'resizes the canvas to the crop', () => {
		const out = applyCrop(
			{ width: 400, height: 200 },
			transform(),
			{ x: 0, y: 0, w: 0.5, h: 0.5 }
		);

		expect( out.canvas ).toEqual( { width: 200, height: 100 } );
	} );

	it( 'moves the layer so the same pixels stay under the crop', () => {
		// A centred layer, cropped to the left half, must end up on the right edge
		// of the new canvas -- otherwise the picture jumps when you crop.
		const out = applyCrop(
			{ width: 400, height: 400 },
			transform(),
			{ x: 0, y: 0, w: 0.5, h: 1 }
		);

		// Old centre was at 200px; the new canvas is 200 wide, so 200/200 = 1.
		expect( out.transform.x ).toBeCloseTo( 1, 6 );
		expect( out.transform.y ).toBeCloseTo( 0.5, 6 );
	} );

	it( 'leaves the layer scale and rotation alone', () => {
		const out = applyCrop(
			{ width: 400, height: 400 },
			transform( { scaleX: 1.5, rotation: 30, flipH: true } ),
			{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }
		);

		expect( out.transform.scaleX ).toBe( 1.5 );
		expect( out.transform.rotation ).toBe( 30 );
		expect( out.transform.flipH ).toBe( true );
	} );

	it( 'a full-frame crop is a no-op', () => {
		const out = applyCrop(
			{ width: 400, height: 300 },
			transform( { x: 0.3 } ),
			{ x: 0, y: 0, w: 1, h: 1 }
		);

		expect( out.canvas ).toEqual( { width: 400, height: 300 } );
		expect( out.transform.x ).toBeCloseTo( 0.3, 6 );
	} );
} );

describe( 'resizeCanvas', () => {
	it( 'keeps the picture where it appears when growing the canvas', () => {
		// Growing a canvas should add space around the image, not shove the image.
		const out = resizeCanvas(
			{ width: 200, height: 200 },
			transform(),
			{ width: 400, height: 400 }
		);

		// Centre was at 100px; 100px of space was added on each side, so it is now
		// at 200px of 400 -- still the middle.
		expect( out.transform.x ).toBeCloseTo( 0.5, 6 );
	} );

	it( 'anchors to a corner when asked', () => {
		const out = resizeCanvas(
			{ width: 200, height: 200 },
			transform(),
			{ width: 400, height: 400 },
			{ x: 0, y: 0 }
		);

		// Nothing added before the content, so the centre stays at 100 of 400.
		expect( out.transform.x ).toBeCloseTo( 0.25, 6 );
	} );

	it( 'survives a zero canvas without producing NaN', () => {
		const out = resizeCanvas(
			{ width: 200, height: 200 },
			transform(),
			{ width: 0, height: 0 }
		);

		expect( Number.isNaN( out.transform.x ) ).toBe( false );
	} );
} );

describe( 'normalisers', () => {
	it( 'canvas falls back when unusable', () => {
		const fallback = { width: 640, height: 480 };

		expect( normaliseCanvas( null, fallback ) ).toEqual( fallback );
		expect( normaliseCanvas( { width: 'x' }, fallback ) ).toEqual( fallback );
		expect( normaliseCanvas( { width: 100, height: 50 }, fallback ) ).toEqual( {
			width: 100,
			height: 50,
		} );
	} );

	it( 'canvas keeps zero as the not-sized-yet sentinel', () => {
		// Clamping this to MIN_CANVAS would strand every migrated recipe on a 16x16
		// canvas instead of letting the editor size it from the image.
		expect( normaliseCanvas( { width: 0, height: 0 }, { width: 9, height: 9 } ) ).toEqual( {
			width: 0,
			height: 0,
		} );
	} );

	it( 'transform falls back when unusable', () => {
		expect( isIdentityTransform( normaliseTransform( null ) ) ).toBe( true );
		expect( isIdentityTransform( normaliseTransform( {} ) ) ).toBe( true );
	} );

	it( 'reads a legacy uniform scale into both axes', () => {
		// A v3 layer carried one `scale`. Round-tripping it without losing the
		// zoom is what lets a stored recipe survive the split.
		const t = normaliseTransform( { scale: 2.5 } );

		expect( t.scaleX ).toBe( 2.5 );
		expect( t.scaleY ).toBe( 2.5 );
	} );

	it( 'prefers explicit axes over a legacy scale', () => {
		const t = normaliseTransform( { scale: 2, scaleX: 3, scaleY: 0.5 } );

		expect( t.scaleX ).toBe( 3 );
		expect( t.scaleY ).toBe( 0.5 );
	} );

	it( 'transform coerces flags rather than trusting them', () => {
		const t = normaliseTransform( { flipH: 'yes', flipV: 0 } );

		expect( t.flipH ).toBe( false );
		expect( t.flipV ).toBe( false );
	} );
} );

describe( 'isNativeCanvas', () => {
	it( 'recognises a canvas still matching the image', () => {
		expect(
			isNativeCanvas( { width: 800, height: 600 }, { width: 800, height: 600 } )
		).toBe( true );
		expect(
			isNativeCanvas( { width: 799, height: 600 }, { width: 800, height: 600 } )
		).toBe( false );
	} );
} );
