/**
 * Selections as SVG paths, and the drags that build them.
 *
 * One path for every shape, because a lasso is not a rectangle -- and once the outline
 * has to be a path anyway, one routine draws all four.
 */

import { selectionBounds } from './bounds';
import { MAX_LASSO_POINTS } from './types';
import type { Point, Selection } from './types';

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
 * Reduces a pixel contour to a normalised path of at most `maxPoints` vertices.
 *
 * @param contour   Pixel vertices.
 * @param maxPoints Ceiling.
 * @param width     Canvas width.
 * @param height    Canvas height.
 */
export function thinPath(
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
