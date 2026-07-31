/**
 * The marquee being drawn, and the vertices placed so far.
 *
 * One object because the three ways of drawing a selection share one point list. A
 * rectangle drag and a lasso drag both start somewhere and extend; a polygon is placed
 * click by click and never enters the drag lifecycle at all. The path tool reuses the
 * same vertices, which is why closing a path and closing a polygon are one gesture with
 * two endings.
 */

import { appendPathPoint, selectionFromDrag } from '../../model/selection';
import type { Point, Selection, SelectionShape } from '../../model/selection';

/**
 * The selection gesture in progress.
 */
export class SelectionGesture {
	/** Where a drag began, in normalised coordinates. Null when not dragging. */
	private from: Point | null = null;

	/** Freeform path being drawn, or polygon vertices placed so far. */
	private points: Point[] = [];

	/** Whether a drag is currently extending a marquee. */
	get isDragging(): boolean {
		return null !== this.from;
	}

	/** The vertices placed so far. */
	get vertices(): Point[] {
		return this.points;
	}

	/**
	 * Places one vertex, for the shapes built click by click.
	 *
	 * @param point Normalised coordinates.
	 * @return The selection to show.
	 */
	addVertex( point: Point ): Selection {
		// No thinning: these vertices are placed deliberately, one click at a time.
		this.points = appendPathPoint( this.points, point, 0 );

		return { shape: 'polygon', points: this.points };
	}

	/**
	 * Starts a marquee.
	 *
	 * @param point Normalised coordinates.
	 * @param shape Which shape the marquee tool draws.
	 * @return The selection to show, or null to clear it.
	 */
	begin( point: Point, shape: SelectionShape ): Selection | null {
		if ( 'polygon' === shape ) {
			return this.addVertex( point );
		}

		this.from = point;
		this.points = [ point ];

		return null;
	}

	/**
	 * Extends a marquee.
	 *
	 * @param point Normalised coordinates.
	 * @param shape Which shape the marquee tool draws.
	 * @return The selection to show, or null when there is no drag to extend.
	 */
	extend( point: Point, shape: SelectionShape ): Selection | null {
		if ( ! this.from ) {
			return null;
		}

		if ( 'lasso' === shape ) {
			this.points = appendPathPoint( this.points, point );

			return { shape: 'lasso', points: this.points };
		}

		return selectionFromDrag( shape as 'rect' | 'ellipse', this.from, point );
	}

	/** Ends a drag, leaving whatever it produced in place. */
	endDrag(): void {
		this.from = null;
	}

	/** Abandons a half-placed polygon or path. */
	clear(): void {
		this.points = [];
		this.from = null;
	}
}
