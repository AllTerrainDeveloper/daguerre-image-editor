/**
 * Where a layer sits on the canvas.
 *
 * Position is normalised (0..1 of the canvas), scale is about the layer's own centre,
 * and rotation is degrees. None of it touches the source pixels, which is what makes a
 * transform drag stable: the surface the pointer is measured against cannot move
 * underneath it.
 */

import type { CanvasSize } from './canvas';

/**
 * Where a layer sits on the canvas.
 *
 * Position is normalised to the canvas so it survives a canvas resize sensibly.
 * Scale is an absolute multiplier on the layer's native pixels, so `1` always means
 * "one image pixel per canvas pixel" no matter how big either is.
 */
export interface LayerTransform {
	/** Layer centre, as a fraction of canvas width. 0.5 is centred. */
	x: number;
	/** Layer centre, as a fraction of canvas height. 0.5 is centred. */
	y: number;
	/**
	 * Horizontal multiplier on the layer's native size.
	 *
	 * Separate from the vertical one so an edge handle can stretch a single axis.
	 * Corner handles drive both together unless Shift is held.
	 */
	scaleX: number;
	/** Vertical multiplier on the layer's native size. */
	scaleY: number;
	/** Rotation about the layer's centre, in degrees. */
	rotation: number;
	/** Mirror horizontally. */
	flipH: boolean;
	/** Mirror vertically. */
	flipV: boolean;
}

/** A layer at rest: centred, unscaled, unrotated. */
export const IDENTITY_TRANSFORM: LayerTransform = {
	x: 0.5,
	y: 0.5,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	flipH: false,
	flipV: false,
};

/** Smallest canvas, in pixels, so a document can always be grabbed back. */
export const MIN_CANVAS = 16;

/** How far a layer may be scaled, so a slip cannot allocate an absurd render. */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 20;

/**
 * Whether a transform leaves the layer exactly where it started.
 *
 * @param transform Transform to test.
 */
export function isIdentityTransform( transform: LayerTransform ): boolean {
	const e = 1e-4;

	return (
		Math.abs( transform.x - 0.5 ) < e &&
		Math.abs( transform.y - 0.5 ) < e &&
		Math.abs( transform.scaleX - 1 ) < e &&
		Math.abs( transform.scaleY - 1 ) < e &&
		Math.abs( transform.rotation ) < e &&
		! transform.flipH &&
		! transform.flipV
	);
}

/**
 * Clamps a transform to usable bounds.
 *
 * Position is deliberately *not* clamped: a layer may hang off the edge of the
 * canvas, which is exactly what happens when you scale one up to fill a frame.
 *
 * @param transform Candidate transform.
 */
export function clampTransform( transform: LayerTransform ): LayerTransform {
	const axis = ( value: number ) =>
		Math.min(
			MAX_SCALE,
			Math.max( MIN_SCALE, Number.isFinite( value ) ? value : 1 )
		);

	return {
		x: Number.isFinite( transform.x ) ? transform.x : 0.5,
		y: Number.isFinite( transform.y ) ? transform.y : 0.5,
		scaleX: axis( transform.scaleX ),
		scaleY: axis( transform.scaleY ),
		rotation: Number.isFinite( transform.rotation )
			? normaliseAngle( transform.rotation )
			: 0,
		flipH: transform.flipH === true,
		flipV: transform.flipV === true,
	};
}

/**
 * Wraps an angle into -180..180.
 *
 * @param degrees Angle in degrees.
 */
export function normaliseAngle( degrees: number ): number {
	let angle = degrees % 360;

	if ( angle > 180 ) {
		angle -= 360;
	}

	if ( angle <= -180 ) {
		angle += 360;
	}

	return angle;
}

/**
 * The layer's on-canvas size in pixels, before rotation.
 *
 * @param source    Native layer size.
 * @param transform Layer transform.
 */
export function layerSize( source: CanvasSize, transform: LayerTransform ): CanvasSize {
	return {
		width: source.width * transform.scaleX,
		height: source.height * transform.scaleY,
	};
}

/**
 * The axis-aligned bounding box of the transformed layer, in canvas pixels.
 *
 * @param source    Native layer size.
 * @param transform Layer transform.
 * @param canvas    Canvas size, to resolve the normalised position.
 */
export function layerBounds(
	source: CanvasSize,
	transform: LayerTransform,
	canvas: CanvasSize
): { x: number; y: number; width: number; height: number } {
	const size = layerSize( source, transform );
	const radians = ( transform.rotation * Math.PI ) / 180;
	const cos = Math.abs( Math.cos( radians ) );
	const sin = Math.abs( Math.sin( radians ) );

	const width = size.width * cos + size.height * sin;
	const height = size.width * sin + size.height * cos;

	return {
		x: transform.x * canvas.width - width / 2,
		y: transform.y * canvas.height - height / 2,
		width,
		height,
	};
}

/**
 * Validates a layer transform from untrusted input.
 *
 * @param raw Candidate transform.
 */
export function normaliseTransform( raw: unknown ): LayerTransform {
	if ( ! raw || typeof raw !== 'object' ) {
		return { ...IDENTITY_TRANSFORM };
	}

	const input = raw as Partial< LayerTransform >;

	// A pre-v4 transform carried one `scale` for both axes.
	const legacy = ( raw as { scale?: unknown } ).scale;
	const uniform = Number.isFinite( Number( legacy ) ) ? Number( legacy ) : 1;

	return clampTransform( {
		x: Number( input.x ?? 0.5 ),
		y: Number( input.y ?? 0.5 ),
		scaleX: Number( input.scaleX ?? uniform ),
		scaleY: Number( input.scaleY ?? uniform ),
		rotation: Number( input.rotation ?? 0 ),
		flipH: input.flipH === true,
		flipV: input.flipV === true,
	} );
}
