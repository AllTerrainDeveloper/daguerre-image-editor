/**
 * The canvas: the exact pixel size the output will be.
 *
 * Resizing it never resizes the image. Cropping is a canvas change plus a compensating
 * move of the layer, so both survive an undo and neither re-decodes anything.
 */

import type { LayerTransform } from './transform';

/** Pixel dimensions of the canvas. The output is exactly this size. */
export interface CanvasSize {
	width: number;
	height: number;
}

/** Smallest canvas, in pixels, so a document can always be grabbed back. */
export const MIN_CANVAS = 16;

/**
 * Whether the canvas still matches the layer's native size.
 *
 * @param canvas Canvas size.
 * @param source Source image size.
 */
export function isNativeCanvas( canvas: CanvasSize, source: CanvasSize ): boolean {
	return (
		Math.abs( canvas.width - source.width ) < 1 &&
		Math.abs( canvas.height - source.height ) < 1
	);
}

/**
 * Clamps a canvas to something renderable.
 *
 * @param canvas    Candidate size.
 * @param maxPixels Ceiling on total pixels.
 */
export function clampCanvas( canvas: CanvasSize, maxPixels: number ): CanvasSize {
	let width = Math.max( MIN_CANVAS, Math.round( canvas.width ) || MIN_CANVAS );
	let height = Math.max( MIN_CANVAS, Math.round( canvas.height ) || MIN_CANVAS );

	// Shrink proportionally rather than truncating one axis, so a canvas that asked
	// for too much comes back the shape the user intended.
	const total = width * height;

	if ( total > maxPixels ) {
		const factor = Math.sqrt( maxPixels / total );

		width = Math.max( MIN_CANVAS, Math.floor( width * factor ) );
		height = Math.max( MIN_CANVAS, Math.floor( height * factor ) );
	}

	return { width, height };
}

/**
 * The scale that makes a layer exactly fill the canvas without cropping it.
 *
 * @param source Native layer size.
 * @param canvas Canvas size.
 */
export function fitScale( source: CanvasSize, canvas: CanvasSize ): number {
	if ( source.width <= 0 || source.height <= 0 ) {
		return 1;
	}

	return Math.min( canvas.width / source.width, canvas.height / source.height );
}

/**
 * The scale that makes a layer cover the canvas entirely, overflowing if needed.
 *
 * @param source Native layer size.
 * @param canvas Canvas size.
 */
export function coverScale( source: CanvasSize, canvas: CanvasSize ): number {
	if ( source.width <= 0 || source.height <= 0 ) {
		return 1;
	}

	return Math.max( canvas.width / source.width, canvas.height / source.height );
}

/**
 * Applies a crop to the document.
 *
 * Cropping resizes the *canvas* and moves the layer to compensate, so the pixels
 * under the crop rectangle stay exactly where they were. That is what makes crop a
 * separate tool from transform: one changes the surface, the other changes what sits
 * on it, and neither disturbs the other.
 *
 * @param canvas    Current canvas size.
 * @param transform Current layer transform.
 * @param rect      Crop rectangle in normalised canvas coordinates.
 * @return The new canvas and transform.
 */
export function applyCrop(
	canvas: CanvasSize,
	transform: LayerTransform,
	rect: { x: number; y: number; w: number; h: number }
): { canvas: CanvasSize; transform: LayerTransform } {
	const next: CanvasSize = {
		width: Math.max( MIN_CANVAS, Math.round( canvas.width * rect.w ) ),
		height: Math.max( MIN_CANVAS, Math.round( canvas.height * rect.h ) ),
	};

	// The layer's centre in old canvas pixels, re-expressed as a fraction of the
	// new, smaller canvas.
	const centreX = transform.x * canvas.width - rect.x * canvas.width;
	const centreY = transform.y * canvas.height - rect.y * canvas.height;

	return {
		canvas: next,
		transform: {
			...transform,
			x: centreX / ( canvas.width * rect.w ),
			y: centreY / ( canvas.height * rect.h ),
		},
	};
}

/**
 * Resizes the canvas, keeping the layer where it appears to be.
 *
 * Growing a canvas should add space around the picture rather than move the picture,
 * so the layer's position is re-expressed against the new dimensions.
 *
 * @param canvas    Current canvas size.
 * @param transform Current layer transform.
 * @param next      Requested canvas size.
 * @param anchor    Where the existing content sits in the new canvas, 0..1.
 * @return The new canvas and transform.
 */
export function resizeCanvas(
	canvas: CanvasSize,
	transform: LayerTransform,
	next: CanvasSize,
	anchor: { x: number; y: number } = { x: 0.5, y: 0.5 }
): { canvas: CanvasSize; transform: LayerTransform } {
	const offsetX = ( next.width - canvas.width ) * anchor.x;
	const offsetY = ( next.height - canvas.height ) * anchor.y;

	const centreX = transform.x * canvas.width + offsetX;
	const centreY = transform.y * canvas.height + offsetY;

	return {
		canvas: next,
		transform: {
			...transform,
			x: next.width === 0 ? 0.5 : centreX / next.width,
			y: next.height === 0 ? 0.5 : centreY / next.height,
		},
	};
}

/**
 * Validates a canvas size from untrusted input.
 *
 * A zero canvas is legitimate and passes through untouched: it is the sentinel for
 * "not sized yet", which is what a freshly created or newly migrated recipe carries
 * until the editor opens the image and fills it in. Clamping it to the minimum here
 * would leave every migrated edit stranded on a 16x16 canvas.
 *
 * @param raw      Candidate size.
 * @param fallback Size to use when the candidate is unusable.
 */
export function normaliseCanvas( raw: unknown, fallback: CanvasSize ): CanvasSize {
	if ( ! raw || typeof raw !== 'object' ) {
		return { ...fallback };
	}

	const input = raw as Partial< CanvasSize >;
	const width = Number( input.width );
	const height = Number( input.height );

	if ( ! Number.isFinite( width ) || ! Number.isFinite( height ) ) {
		return { ...fallback };
	}

	if ( width <= 0 || height <= 0 ) {
		return { width: 0, height: 0 };
	}

	return {
		width: Math.max( MIN_CANVAS, Math.round( width ) ),
		height: Math.max( MIN_CANVAS, Math.round( height ) ),
	};
}
