/**
 * The interactive tone curve.
 *
 * A 256x256 graph: input level along the x axis, output level up the y axis, with
 * draggable control points. Drawn on a canvas rather than as DOM, because the
 * curve between the points is a sampled polyline and 256 elements would be absurd.
 *
 * The curve maths lives in `src/engine/lut.ts` and is shared with the renderer, so
 * the line drawn here is literally the function the GPU will apply -- not an
 * approximation of it.
 */

import { sampleCurve } from '../engine/lut';
import type { CurvePoint } from '../engine/lut';
import { __ } from '../i18n';

/** How close a click must be to grab an existing point, in graph units. */
const GRAB_RADIUS = 12;

/** Beyond this, a drag out of the graph deletes the point instead. */
const DELETE_DISTANCE = 40;

export interface CurveEditorOptions {
	/** Current control points. */
	getPoints: () => CurvePoint[];
	/** Fires continuously while dragging. */
	onChange: ( points: CurvePoint[] ) => void;
	/** Fires once a drag finishes. */
	onCommit: () => void;
}

/**
 * A draggable tone curve graph.
 */
export class CurveEditor {
	public readonly el: HTMLElement;

	private canvas: HTMLCanvasElement;

	private ctx: CanvasRenderingContext2D | null;

	private options: CurveEditorOptions;

	private dragIndex = -1;

	private resizeObserver: ResizeObserver | null = null;

	constructor( options: CurveEditorOptions ) {
		this.options = options;

		this.el = document.createElement( 'div' );
		this.el.className = 'dg-curve';

		this.canvas = document.createElement( 'canvas' );
		this.canvas.className = 'dg-curve__canvas';
		this.canvas.setAttribute( 'role', 'img' );
		this.canvas.setAttribute(
			'aria-label',
			__( 'Tone curve. Drag to add or move control points.' )
		);
		this.canvas.tabIndex = 0;

		this.el.appendChild( this.canvas );
		this.ctx = this.canvas.getContext( '2d' );

		this.canvas.addEventListener( 'pointerdown', this.onPointerDown );
		this.canvas.addEventListener( 'dblclick', this.onDoubleClick );

		if ( typeof ResizeObserver !== 'undefined' ) {
			this.resizeObserver = new ResizeObserver( () => this.draw() );
			this.resizeObserver.observe( this.el );
		}

		this.draw();
	}

	/** Re-renders from the model. */
	sync = (): void => this.draw();

	/** Converts a pointer event into graph coordinates, 0..255 with y up. */
	private toGraph( event: PointerEvent | MouseEvent ): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();

		return {
			x: ( ( event.clientX - rect.left ) / rect.width ) * 255,
			y: ( 1 - ( event.clientY - rect.top ) / rect.height ) * 255,
		};
	}

	/**
	 * Grabs an existing point, or inserts a new one.
	 */
	private onPointerDown = ( event: PointerEvent ): void => {
		const points = [ ...this.options.getPoints() ];
		const at = this.toGraph( event );

		let index = points.findIndex(
			( [ px, py ] ) => Math.hypot( px - at.x, py - at.y ) < GRAB_RADIUS
		);

		if ( index === -1 ) {
			points.push( [ at.x, at.y ] );
			points.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
			index = points.findIndex( ( p ) => p[ 0 ] === at.x && p[ 1 ] === at.y );
			this.options.onChange( points );
		}

		this.dragIndex = index;

		this.canvas.setPointerCapture( event.pointerId );
		this.canvas.addEventListener( 'pointermove', this.onPointerMove );
		this.canvas.addEventListener( 'pointerup', this.onPointerUp );
		event.preventDefault();

		this.draw();
	};

	/** Moves the grabbed point. */
	private onPointerMove = ( event: PointerEvent ): void => {
		if ( this.dragIndex < 0 ) {
			return;
		}

		const points = this.options.getPoints().map( ( p ) => [ ...p ] as CurvePoint );

		if ( ! points[ this.dragIndex ] ) {
			return;
		}

		const at = this.toGraph( event );

		// Endpoints keep their x. Letting the black point slide inwards would
		// silently clip the shadows, which is what the Levels control is for.
		const isEndpoint =
			this.dragIndex === 0 || this.dragIndex === points.length - 1;

		points[ this.dragIndex ] = [
			isEndpoint ? points[ this.dragIndex ][ 0 ] : at.x,
			at.y,
		];

		this.options.onChange( points );
		this.draw();
	};

	/** Drops the point, deleting it if it was dragged well outside the graph. */
	private onPointerUp = ( event: PointerEvent ): void => {
		const points = this.options.getPoints().map( ( p ) => [ ...p ] as CurvePoint );
		const index = this.dragIndex;

		this.dragIndex = -1;
		this.canvas.releasePointerCapture?.( event.pointerId );
		this.canvas.removeEventListener( 'pointermove', this.onPointerMove );
		this.canvas.removeEventListener( 'pointerup', this.onPointerUp );

		const at = this.toGraph( event );
		const outside =
			at.x < -DELETE_DISTANCE ||
			at.x > 255 + DELETE_DISTANCE ||
			at.y < -DELETE_DISTANCE ||
			at.y > 255 + DELETE_DISTANCE;

		// Flicking a point away is how every curve editor deletes one -- but the two
		// endpoints define the curve's domain and cannot go.
		if ( outside && index > 0 && index < points.length - 1 ) {
			points.splice( index, 1 );
			this.options.onChange( points );
		}

		this.options.onCommit();
		this.draw();
	};

	/** Resets the curve to a straight line. */
	private onDoubleClick = ( event: MouseEvent ): void => {
		event.preventDefault();

		this.options.onChange( [
			[ 0, 0 ],
			[ 255, 255 ],
		] );
		this.options.onCommit();
		this.draw();
	};

	/** Paints the grid, the curve and its control points. */
	private draw(): void {
		if ( ! this.ctx ) {
			return;
		}

		const dpr = window.devicePixelRatio || 1;
		const rect = this.el.getBoundingClientRect();
		const size = Math.max( 1, Math.round( Math.min( rect.width, rect.width ) ) );

		if ( this.canvas.width !== size * dpr ) {
			this.canvas.width = size * dpr;
			this.canvas.height = size * dpr;
			this.canvas.style.width = `${ size }px`;
			this.canvas.style.height = `${ size }px`;
		}

		const ctx = this.ctx;
		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		ctx.clearRect( 0, 0, size, size );

		const toCanvas = ( x: number, y: number ) => ( {
			cx: ( x / 255 ) * size,
			cy: ( 1 - y / 255 ) * size,
		} );

		ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.lineWidth = 1;

		for ( let i = 1; i < 4; i++ ) {
			const at = ( i / 4 ) * size;

			ctx.beginPath();
			ctx.moveTo( at, 0 );
			ctx.lineTo( at, size );
			ctx.moveTo( 0, at );
			ctx.lineTo( size, at );
			ctx.stroke();
		}

		// The no-op diagonal, for reference.
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
		ctx.beginPath();
		ctx.moveTo( 0, size );
		ctx.lineTo( size, 0 );
		ctx.stroke();

		const points = this.options.getPoints();
		const sampled = sampleCurve( points );

		ctx.strokeStyle = '#f0f0f1';
		ctx.lineWidth = 1.5;
		ctx.beginPath();

		for ( let x = 0; x < 256; x++ ) {
			const { cx, cy } = toCanvas( x, sampled[ x ] );

			if ( x === 0 ) {
				ctx.moveTo( cx, cy );
			} else {
				ctx.lineTo( cx, cy );
			}
		}

		ctx.stroke();

		points.forEach( ( [ x, y ], index ) => {
			const { cx, cy } = toCanvas( x, y );

			ctx.beginPath();
			ctx.arc( cx, cy, index === this.dragIndex ? 5 : 3.5, 0, Math.PI * 2 );
			ctx.fillStyle = index === this.dragIndex ? '#3582c4' : '#f0f0f1';
			ctx.fill();
		} );
	}

	/** Releases listeners. */
	destroy(): void {
		this.resizeObserver?.disconnect();
		this.canvas.removeEventListener( 'pointerdown', this.onPointerDown );
		this.canvas.removeEventListener( 'dblclick', this.onDoubleClick );
	}
}
