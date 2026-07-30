/**
 * Selections.
 *
 * A selection is a closed path in normalised canvas coordinates, whatever shape
 * drew it. Storing every shape as a path rather than as a rectangle-plus-a-kind is
 * what lets one mask builder, one outline renderer and one clipping routine serve
 * all four tools -- and it is the mask that matters, because painting has to be
 * confined to the selected pixels rather than merely started inside them.
 *
 * Pure geometry plus one canvas rasteriser, so most of it is unit-testable.
 */

/** A point in normalised 0..1 canvas coordinates. */
export interface Point {
	x: number;
	y: number;
}

/** How a selection was drawn. */
export type SelectionShape = 'rect' | 'ellipse' | 'lasso' | 'polygon';

/** The shapes on offer, in picker order. */
export const SELECTION_SHAPES: Array< { value: SelectionShape; label: string } > = [
	{ value: 'rect', label: 'Rectangle' },
	{ value: 'ellipse', label: 'Ellipse' },
	{ value: 'lasso', label: 'Freeform' },
	{ value: 'polygon', label: 'Polygon' },
];

/** A selected region. */
export interface Selection {
	shape: SelectionShape;
	/**
	 * The path.
	 *
	 * For `rect` and `ellipse` these are two opposite corners of the bounding box.
	 * For `lasso` and `polygon` they are the vertices, implicitly closed.
	 */
	points: Point[];
}

/** How many points a lasso keeps; enough for a smooth outline, few enough to stay fast. */
const MAX_LASSO_POINTS = 600;

/**
 * Whether a selection covers no meaningful area.
 *
 * @param selection Selection to test, or null.
 */
export function isEmptySelection( selection: Selection | null ): boolean {
	if ( ! selection || selection.points.length < 2 ) {
		return true;
	}

	const bounds = selectionBounds( selection );

	return bounds.w < 0.002 || bounds.h < 0.002;
}

/**
 * The axis-aligned bounding box, in normalised coordinates.
 *
 * @param selection Selection to measure.
 */
export function selectionBounds( selection: Selection ): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for ( const point of selection.points ) {
		minX = Math.min( minX, point.x );
		minY = Math.min( minY, point.y );
		maxX = Math.max( maxX, point.x );
		maxY = Math.max( maxY, point.y );
	}

	if ( ! Number.isFinite( minX ) ) {
		return { x: 0, y: 0, w: 0, h: 0 };
	}

	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Builds the selection's outline as an SVG path.
 *
 * Rendered as SVG rather than as a positioned `<div>` because a lasso is not a
 * rectangle and never was -- and once the outline has to be a path anyway, the same
 * code draws every shape.
 *
 * @param selection Selection to draw.
 * @param width     Viewport width in CSS pixels.
 * @param height    Viewport height in CSS pixels.
 */
export function selectionToPath(
	selection: Selection,
	width: number,
	height: number
): string {
	const at = ( point: Point ) => `${ point.x * width } ${ point.y * height }`;

	if ( selection.shape === 'rect' || selection.shape === 'ellipse' ) {
		const b = selectionBounds( selection );
		const x = b.x * width;
		const y = b.y * height;
		const w = b.w * width;
		const h = b.h * height;

		if ( selection.shape === 'rect' ) {
			return `M ${ x } ${ y } H ${ x + w } V ${ y + h } H ${ x } Z`;
		}

		const rx = w / 2;
		const ry = h / 2;

		// Two arcs, because a single arc command cannot close a full ellipse.
		return (
			`M ${ x } ${ y + ry } ` +
			`a ${ rx } ${ ry } 0 1 0 ${ w } 0 ` +
			`a ${ rx } ${ ry } 0 1 0 ${ -w } 0 Z`
		);
	}

	if ( selection.points.length < 2 ) {
		return '';
	}

	return (
		`M ${ at( selection.points[ 0 ] ) } ` +
		selection.points
			.slice( 1 )
			.map( ( point ) => `L ${ at( point ) }` )
			.join( ' ' ) +
		' Z'
	);
}

/**
 * Rasterises a selection into a canvas-sized alpha mask.
 *
 * This is what confines a brush. Testing whether the *centre* of a dab falls inside
 * the selection is not enough: a round brush is wider than its centre, so a stroke
 * along the edge spills over it. Masking the stroke clips every pixel instead.
 *
 * @param selection Selection to rasterise.
 * @param width     Canvas width in pixels.
 * @param height    Canvas height in pixels.
 * @return An opaque-white-on-transparent mask, or null when there is nothing to mask.
 */
export function buildSelectionMask(
	selection: Selection | null,
	width: number,
	height: number
): HTMLCanvasElement | null {
	if ( ! selection || isEmptySelection( selection ) || width < 1 || height < 1 ) {
		return null;
	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = Math.round( width );
	canvas.height = Math.round( height );

	const ctx = canvas.getContext( '2d' );

	if ( ! ctx ) {
		return null;
	}

	ctx.fillStyle = '#fff';
	ctx.beginPath();

	const bounds = selectionBounds( selection );

	if ( selection.shape === 'ellipse' ) {
		ctx.ellipse(
			( bounds.x + bounds.w / 2 ) * canvas.width,
			( bounds.y + bounds.h / 2 ) * canvas.height,
			( bounds.w / 2 ) * canvas.width,
			( bounds.h / 2 ) * canvas.height,
			0,
			0,
			Math.PI * 2
		);
	} else if ( selection.shape === 'rect' ) {
		ctx.rect(
			bounds.x * canvas.width,
			bounds.y * canvas.height,
			bounds.w * canvas.width,
			bounds.h * canvas.height
		);
	} else {
		selection.points.forEach( ( point, index ) => {
			const x = point.x * canvas.width;
			const y = point.y * canvas.height;

			if ( index === 0 ) {
				ctx.moveTo( x, y );
			} else {
				ctx.lineTo( x, y );
			}
		} );

		ctx.closePath();
	}

	ctx.fill();

	return canvas;
}

/**
 * Traces the outline of a mask into a closed path.
 *
 * This is what lets the magic wand share everything the other selection tools use.
 * The wand naturally produces a *region* -- a flood fill -- and the rest of the editor
 * speaks in paths, so rather than teaching the outline renderer, the mask rasteriser
 * and the clipper about a second representation, the region is converted once, here.
 *
 * Moore-neighbour boundary tracing: start at the first filled pixel found scanning
 * row by row, then keep turning around the outside of the region until arriving back.
 * Only the outer contour is traced, so a region with holes selects through them --
 * a real limitation, and the right trade for not carrying two selection models.
 *
 * @param mask      Alpha mask, filled where the region is.
 * @param maxPoints Vertices to keep; the path is thinned evenly to fit.
 * @return Normalised vertices, or an empty array when there is no region.
 */
export function traceMask(
	mask: { data: Uint8ClampedArray; width: number; height: number },
	maxPoints = 400
): Point[] {
	const { width, height, data } = mask;
	const filled = ( x: number, y: number ): boolean =>
		x >= 0 &&
		y >= 0 &&
		x < width &&
		y < height &&
		data[ ( y * width + x ) * 4 + 3 ] > 127;

	let start: Point | null = null;

	for ( let y = 0; y < height && ! start; y++ ) {
		for ( let x = 0; x < width; x++ ) {
			if ( filled( x, y ) ) {
				start = { x, y };
				break;
			}
		}
	}

	if ( ! start ) {
		return [];
	}

	// Clockwise from due west. Scanning row-major guarantees the pixel to the west of
	// the start is outside the region, which is the entry direction tracing needs.
	const ring = [
		[ -1, 0 ],
		[ -1, -1 ],
		[ 0, -1 ],
		[ 1, -1 ],
		[ 1, 0 ],
		[ 1, 1 ],
		[ 0, 1 ],
		[ -1, 1 ],
	];

	const contour: Point[] = [ start ];
	let current = start;
	let entry = 0;
	// A boundary cannot be longer than the perimeter of every pixel in the mask.
	const limit = width * height * 4 + 8;

	for ( let step = 0; step < limit; step++ ) {
		let moved = false;

		for ( let i = 1; i <= 8; i++ ) {
			const direction = ( entry + i ) % 8;
			const next = {
				x: current.x + ring[ direction ][ 0 ],
				y: current.y + ring[ direction ][ 1 ],
			};

			if ( ! filled( next.x, next.y ) ) {
				continue;
			}

			// Re-enter from the far side of where we came from, so the walk keeps
			// hugging the same edge instead of doubling back.
			entry = ( direction + 5 ) % 8;
			current = next;
			moved = true;
			break;
		}

		if ( ! moved ) {
			// A single isolated pixel has no boundary to walk.
			break;
		}

		if ( current.x === start.x && current.y === start.y ) {
			break;
		}

		contour.push( current );
	}

	return thinPath( contour, maxPoints, width, height );
}

/**
 * Reduces a pixel contour to a normalised path of at most `maxPoints` vertices.
 *
 * @param contour   Pixel vertices.
 * @param maxPoints Ceiling.
 * @param width     Canvas width.
 * @param height    Canvas height.
 */
function thinPath(
	contour: Point[],
	maxPoints: number,
	width: number,
	height: number
): Point[] {
	const stride = Math.max( 1, Math.ceil( contour.length / Math.max( 3, maxPoints ) ) );
	const out: Point[] = [];

	for ( let i = 0; i < contour.length; i += stride ) {
		out.push( {
			x: contour[ i ].x / width,
			y: contour[ i ].y / height,
		} );
	}

	return out;
}

/**
 * Clips a lifted region to the selection's actual shape.
 *
 * Pixels are read out of the renderer as a rectangle, because that is the only shape a
 * texture read has -- but the *selection* is very often not one. Copying an ellipse or a
 * lasso without this step yields its bounding box, corners and all, which is not what
 * anyone drew.
 *
 * The mask is rasterised at canvas size and drawn offset, so it lines up with the region
 * pixel for pixel however the region was cropped. `destination-in` keeps the region only
 * where the mask is opaque, which is exactly the selection.
 *
 * A rectangular selection is unaffected: its bounding box is its shape.
 *
 * @param region    Lifted pixels, modified in place.
 * @param selection Shape to clip to.
 * @param canvas    Canvas size the selection is expressed against.
 * @param origin    Where the region's top-left corner sits, in canvas pixels.
 * @return True when the region was clipped.
 */
export function clipToSelection(
	region: HTMLCanvasElement,
	selection: Selection,
	canvas: { width: number; height: number },
	origin: { x: number; y: number }
): boolean {
	const mask = buildSelectionMask( selection, canvas.width, canvas.height );
	const ctx = region.getContext( '2d' );

	if ( ! mask || ! ctx ) {
		return false;
	}

	ctx.save();
	ctx.globalCompositeOperation = 'destination-in';
	ctx.drawImage( mask, -Math.round( origin.x ), -Math.round( origin.y ) );
	ctx.restore();

	return true;
}

/**
 * Builds a rectangle or ellipse selection from two dragged corners.
 *
 * @param shape Which shape.
 * @param from  First corner.
 * @param to    Second corner.
 */
export function selectionFromDrag(
	shape: 'rect' | 'ellipse',
	from: Point,
	to: Point
): Selection {
	return {
		shape,
		points: [
			{ x: clamp01( Math.min( from.x, to.x ) ), y: clamp01( Math.min( from.y, to.y ) ) },
			{ x: clamp01( Math.max( from.x, to.x ) ), y: clamp01( Math.max( from.y, to.y ) ) },
		],
	};
}

/**
 * Adds a point to a freeform path, thinning as it goes.
 *
 * A pointer emits far more samples than an outline needs. Dropping points that
 * barely moved keeps the path short enough to rasterise instantly, and makes no
 * visible difference to the shape.
 *
 * @param points  Path so far.
 * @param point   New point.
 * @param minStep Smallest movement worth recording, in normalised units.
 */
export function appendPathPoint(
	points: Point[],
	point: Point,
	minStep = 0.004
): Point[] {
	const last = points[ points.length - 1 ];

	if (
		last &&
		Math.abs( last.x - point.x ) < minStep &&
		Math.abs( last.y - point.y ) < minStep
	) {
		return points;
	}

	const next = [ ...points, { x: clamp01( point.x ), y: clamp01( point.y ) } ];

	// A pathological drag should not be allowed to grow without bound.
	return next.length > MAX_LASSO_POINTS
		? next.slice( next.length - MAX_LASSO_POINTS )
		: next;
}

/**
 * Clamps a value into 0..1.
 *
 * @param value Value to clamp.
 */
function clamp01( value: number ): number {
	return Math.min( 1, Math.max( 0, value ) );
}
