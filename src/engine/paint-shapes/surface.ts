/**
 * The offscreen canvas everything here draws into.
 */

/**
 * Creates a drawing surface.
 *
 * @param width  Pixels.
 * @param height Pixels.
 * @return The canvas and its context, or null when either is unavailable.
 */
export function makeCanvas(
	width: number,
	height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
	if ( width < 1 || height < 1 ) {
		return null;
	}

	const canvas = document.createElement( 'canvas' );

	canvas.width = Math.round( width );
	canvas.height = Math.round( height );

	const ctx = canvas.getContext( '2d' );

	return ctx ? { canvas, ctx } : null;
}
