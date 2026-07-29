/**
 * Gradients, shapes and text.
 *
 * All three end up as the same thing: a canvas-sized RGBA bitmap that gets composited
 * onto the active layer through the selection mask. Once that is the shared
 * destination, a gradient and a rounded rectangle and a word of text stop being three
 * features and become three `<canvas>` draw calls -- which the 2D context has done
 * well for fifteen years, and which needs no library.
 *
 * The geometry is separated from the drawing so the maths can be unit-tested without
 * a canvas backend.
 */

/** A rectangle in pixels. */
export interface PixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A point in pixels. */
export interface PixelPoint {
	x: number;
	y: number;
}

/** How a gradient is laid out. */
export type GradientKind = 'linear' | 'radial';

/** What the shape tool draws. */
export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'line' | 'triangle' | 'star';

/** Whether a shape is filled, outlined, or both. */
export type ShapeStyle = 'fill' | 'stroke';

/** The gradients on offer, in picker order. */
export const GRADIENT_KINDS: Array< { value: GradientKind; label: string } > = [
	{ value: 'linear', label: 'Linear' },
	{ value: 'radial', label: 'Radial' },
];

/** The shapes on offer, in picker order. */
export const SHAPE_KINDS: Array< { value: ShapeKind; label: string } > = [
	{ value: 'rect', label: 'Rectangle' },
	{ value: 'rounded', label: 'Rounded' },
	{ value: 'ellipse', label: 'Ellipse' },
	{ value: 'line', label: 'Line' },
	{ value: 'triangle', label: 'Triangle' },
	{ value: 'star', label: 'Star' },
];

/**
 * Normalises two dragged corners into a rectangle.
 *
 * @param from First corner.
 * @param to   Second corner.
 */
export function rectFromDrag( from: PixelPoint, to: PixelPoint ): PixelRect {
	return {
		x: Math.min( from.x, to.x ),
		y: Math.min( from.y, to.y ),
		width: Math.abs( to.x - from.x ),
		height: Math.abs( to.y - from.y ),
	};
}

/**
 * Constrains a drag to a square, keeping the direction it went.
 *
 * This is what Shift does in every editor, and it is worth having because a circle
 * drawn by eye is never quite a circle.
 *
 * @param from Anchor corner.
 * @param to   Dragged corner.
 */
export function squareDrag( from: PixelPoint, to: PixelPoint ): PixelPoint {
	const size = Math.max( Math.abs( to.x - from.x ), Math.abs( to.y - from.y ) );

	return {
		x: from.x + Math.sign( to.x - from.x || 1 ) * size,
		y: from.y + Math.sign( to.y - from.y || 1 ) * size,
	};
}

/**
 * The vertices of a regular star.
 *
 * Exported because it is the only shape here whose geometry is not obvious, and
 * therefore the only one worth testing on its own.
 *
 * @param rect   Bounding box.
 * @param points Number of outer points.
 * @param inner  Inner radius as a fraction of the outer, 0..1.
 */
export function starPoints( rect: PixelRect, points = 5, inner = 0.5 ): PixelPoint[] {
	const cx = rect.x + rect.width / 2;
	const cy = rect.y + rect.height / 2;
	const rx = rect.width / 2;
	const ry = rect.height / 2;
	const out: PixelPoint[] = [];

	for ( let i = 0; i < points * 2; i++ ) {
		// Starts at the top, so a star looks like a star rather than a pinwheel.
		const angle = ( i / ( points * 2 ) ) * Math.PI * 2 - Math.PI / 2;
		const scale = i % 2 === 0 ? 1 : inner;

		out.push( {
			x: cx + Math.cos( angle ) * rx * scale,
			y: cy + Math.sin( angle ) * ry * scale,
		} );
	}

	return out;
}

/** How a shape should be painted. */
export interface ShapeOptions {
	kind: ShapeKind;
	style: ShapeStyle;
	colour: string;
	strokeWidth: number;
	/** Corner radius for `rounded`, in pixels. */
	radius?: number;
}

/**
 * Draws a shape spanning two dragged corners onto a canvas-sized bitmap.
 *
 * @param width   Canvas width.
 * @param height  Canvas height.
 * @param from    Where the drag started.
 * @param to      Where it ended.
 * @param options What to draw.
 * @return The bitmap, or null when there is nothing to draw.
 */
export function shapeCanvas(
	width: number,
	height: number,
	from: PixelPoint,
	to: PixelPoint,
	options: ShapeOptions
): HTMLCanvasElement | null {
	const surface = makeCanvas( width, height );

	if ( ! surface ) {
		return null;
	}

	const { canvas, ctx } = surface;
	const rect = rectFromDrag( from, to );

	// A line has no area, so it is the one shape a zero-height drag can still draw.
	if ( options.kind !== 'line' && ( rect.width < 1 || rect.height < 1 ) ) {
		return null;
	}

	ctx.beginPath();

	switch ( options.kind ) {
		case 'rect':
			ctx.rect( rect.x, rect.y, rect.width, rect.height );
			break;

		case 'rounded': {
			const radius = Math.min(
				options.radius ?? 16,
				rect.width / 2,
				rect.height / 2
			);

			roundedRect( ctx, rect, radius );
			break;
		}

		case 'ellipse':
			ctx.ellipse(
				rect.x + rect.width / 2,
				rect.y + rect.height / 2,
				rect.width / 2,
				rect.height / 2,
				0,
				0,
				Math.PI * 2
			);
			break;

		case 'line':
			ctx.moveTo( from.x, from.y );
			ctx.lineTo( to.x, to.y );
			break;

		case 'triangle':
			ctx.moveTo( rect.x + rect.width / 2, rect.y );
			ctx.lineTo( rect.x + rect.width, rect.y + rect.height );
			ctx.lineTo( rect.x, rect.y + rect.height );
			ctx.closePath();
			break;

		case 'star':
			starPoints( rect ).forEach( ( point, index ) => {
				if ( index === 0 ) {
					ctx.moveTo( point.x, point.y );
				} else {
					ctx.lineTo( point.x, point.y );
				}
			} );
			ctx.closePath();
			break;
	}

	// A line cannot be filled, whatever the setting says.
	if ( options.style === 'fill' && options.kind !== 'line' ) {
		ctx.fillStyle = options.colour;
		ctx.fill();
	} else {
		ctx.strokeStyle = options.colour;
		ctx.lineWidth = Math.max( 1, options.strokeWidth );
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.stroke();
	}

	return canvas;
}

/**
 * Traces a rounded rectangle.
 *
 * Written out rather than using `roundRect()`, which Safari only shipped in 16.4 --
 * and an editor that silently draws nothing on a slightly older browser is worse than
 * ten lines of arcs.
 *
 * @param ctx    Target context.
 * @param rect   Bounding box.
 * @param radius Corner radius.
 */
function roundedRect(
	ctx: CanvasRenderingContext2D,
	rect: PixelRect,
	radius: number
): void {
	const r = Math.max( 0, radius );

	ctx.moveTo( rect.x + r, rect.y );
	ctx.arcTo( rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, r );
	ctx.arcTo(
		rect.x + rect.width,
		rect.y + rect.height,
		rect.x,
		rect.y + rect.height,
		r
	);
	ctx.arcTo( rect.x, rect.y + rect.height, rect.x, rect.y, r );
	ctx.arcTo( rect.x, rect.y, rect.x + rect.width, rect.y, r );
	ctx.closePath();
}

/**
 * Draws a gradient between two dragged points onto a canvas-sized bitmap.
 *
 * The gradient covers the whole canvas rather than only the dragged span, because that
 * is what a gradient is for: the drag sets the *ramp*, not the extent. Confining it to
 * a region is the selection's job.
 *
 * @param width  Canvas width.
 * @param height Canvas height.
 * @param kind   Linear or radial.
 * @param from   Start of the ramp.
 * @param to     End of the ramp.
 * @param start  Colour at the start.
 * @param end    Colour at the end.
 * @param fade   Whether the end is transparent rather than a colour.
 * @return The bitmap, or null when the drag was too short to define a direction.
 */
export function gradientCanvas(
	width: number,
	height: number,
	kind: GradientKind,
	from: PixelPoint,
	to: PixelPoint,
	start: string,
	end: string,
	fade = false
): HTMLCanvasElement | null {
	const surface = makeCanvas( width, height );
	const span = Math.hypot( to.x - from.x, to.y - from.y );

	if ( ! surface || span < 1 ) {
		return null;
	}

	const { canvas, ctx } = surface;
	const ramp =
		kind === 'linear'
			? ctx.createLinearGradient( from.x, from.y, to.x, to.y )
			: ctx.createRadialGradient( from.x, from.y, 0, from.x, from.y, span );

	ramp.addColorStop( 0, start );
	ramp.addColorStop( 1, fade ? withAlpha( start, 0 ) : end );

	ctx.fillStyle = ramp;
	ctx.fillRect( 0, 0, width, height );

	return canvas;
}

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

/**
 * Rewrites a colour with a new alpha.
 *
 * Only `#rgb` and `#rrggbb` are understood, which is all the colour inputs produce.
 *
 * @param colour CSS colour.
 * @param alpha  0..1.
 */
export function withAlpha( colour: string, alpha: number ): string {
	const rgb = hexToRgb( colour );

	if ( ! rgb ) {
		return colour;
	}

	return `rgba( ${ rgb[ 0 ] }, ${ rgb[ 1 ] }, ${ rgb[ 2 ] }, ${ alpha } )`;
}

/**
 * Parses a hex colour.
 *
 * @param colour CSS hex colour, three or six digits.
 * @return Channels 0..255, or null when it is not hex.
 */
export function hexToRgb( colour: string ): [ number, number, number ] | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec( colour.trim() );

	if ( ! match ) {
		return null;
	}

	const hex = match[ 1 ];
	const full =
		hex.length === 3
			? hex
					.split( '' )
					.map( ( c ) => c + c )
					.join( '' )
			: hex;

	return [
		parseInt( full.slice( 0, 2 ), 16 ),
		parseInt( full.slice( 2, 4 ), 16 ),
		parseInt( full.slice( 4, 6 ), 16 ),
	];
}

/**
 * Formats channels as a hex colour.
 *
 * @param r Red 0..255.
 * @param g Green 0..255.
 * @param b Blue 0..255.
 */
export function rgbToHex( r: number, g: number, b: number ): string {
	const byte = ( value: number ) =>
		Math.min( 255, Math.max( 0, Math.round( value ) ) )
			.toString( 16 )
			.padStart( 2, '0' );

	return `#${ byte( r ) }${ byte( g ) }${ byte( b ) }`;
}

/**
 * Creates a drawing surface.
 *
 * @param width  Pixels.
 * @param height Pixels.
 * @return The canvas and its context, or null when either is unavailable.
 */
function makeCanvas(
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
