/**
 * Rendering typed text into a bitmap exactly the size of its glyphs.
 *
 * The tight bitmap is the point: a text layer is an object you can move and scale, and
 * that only works if its texture is the text rather than a canvas-sized sheet with some
 * words somewhere in it.
 */

import { makeCanvas } from './surface';

/** How text should be rendered. */
export interface TextOptions {
	text: string;
	/** Pixel size of the em box. */
	size: number;
	family: string;
	colour: string;
	bold?: boolean;
	italic?: boolean;
	/** Outline width in pixels; 0 for solid text. */
	strokeWidth?: number;
}

/**
 * Renders text to a bitmap just big enough to hold it.
 *
 * Tight rather than canvas-sized because text is placed at a point, so the caller
 * needs to know how far up and left the glyphs actually reach.
 *
 * @param options What to render.
 * @return The bitmap and the offset from the anchor to its top-left corner, or null
 *         when there is nothing to render.
 */
export function textCanvas(
	options: TextOptions
): { canvas: HTMLCanvasElement; offsetX: number; offsetY: number } | null {
	const text = options.text.trim();

	if ( ! text ) {
		return null;
	}

	const font = cssFont( options );
	const measure = makeCanvas( 1, 1 );

	if ( ! measure ) {
		return null;
	}

	measure.ctx.font = font;

	const lines = options.text.split( '\n' );
	const lineHeight = Math.ceil( options.size * 1.25 );
	const pad = Math.ceil( ( options.strokeWidth ?? 0 ) + options.size * 0.35 );
	const widest = Math.max(
		1,
		...lines.map( ( line ) => measure.ctx.measureText( line ).width )
	);

	const surface = makeCanvas(
		Math.ceil( widest ) + pad * 2,
		lineHeight * lines.length + pad * 2
	);

	if ( ! surface ) {
		return null;
	}

	const { canvas, ctx } = surface;

	ctx.font = font;
	ctx.textBaseline = 'top';
	ctx.fillStyle = options.colour;
	ctx.strokeStyle = options.colour;
	ctx.lineWidth = Math.max( 1, options.strokeWidth ?? 1 );
	ctx.lineJoin = 'round';

	lines.forEach( ( line, index ) => {
		const y = pad + index * lineHeight;

		if ( options.strokeWidth ) {
			ctx.strokeText( line, pad, y );
		} else {
			ctx.fillText( line, pad, y );
		}
	} );

	// The anchor is the text's baseline start, so the bitmap sits up and left of it.
	return { canvas, offsetX: -pad, offsetY: -pad };
}

/**
 * Builds a CSS font shorthand.
 *
 * @param options Text settings.
 */
export function cssFont( options: TextOptions ): string {
	return [
		options.italic ? 'italic' : '',
		options.bold ? '700' : '400',
		`${ Math.max( 1, Math.round( options.size ) ) }px`,
		options.family || 'sans-serif',
	]
		.filter( Boolean )
		.join( ' ' );
}

/** Font stacks offered by the text tool. Only families a browser certainly has. */
export const FONT_STACKS: Array< { value: string; label: string } > = [
	{ value: 'system-ui, sans-serif', label: 'System' },
	{ value: 'Helvetica, Arial, sans-serif', label: 'Sans' },
	{ value: 'Georgia, "Times New Roman", serif', label: 'Serif' },
	{ value: 'ui-monospace, Menlo, Consolas, monospace', label: 'Mono' },
];
