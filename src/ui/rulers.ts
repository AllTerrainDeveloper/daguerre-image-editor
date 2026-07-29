/**
 * Rulers along the top and leading edges.
 *
 * Marked in *canvas* pixels, not screen pixels, so a reading means the same thing
 * whatever the zoom -- which is the only version worth having. The tick interval
 * adapts so labels never collide: as you zoom out the ruler steps up through
 * 1, 2, 5, 10, 20, 50, 100 and so on rather than crowding.
 *
 * Drawn on canvases rather than as DOM. A ruler across a wide viewport is hundreds
 * of ticks, and hundreds of elements repositioned on every pan would be visible as
 * lag.
 */

import type { CanvasSize } from '../model/document';

/** Thickness of each ruler, in CSS pixels. */
export const RULER_SIZE = 20;

/** Smallest gap between labelled ticks, in CSS pixels. */
const MIN_LABEL_GAP = 56;

export interface RulersOptions {
	/** Element the rulers are positioned within -- the stage. */
	stage: HTMLElement;
	/** Where the canvas sits inside the stage, in CSS pixels. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Canvas size in its own pixels. */
	getCanvas: () => CanvasSize;
}

/**
 * Top and leading-edge rulers.
 */
export class Rulers {
	private options: RulersOptions;

	private root: HTMLElement;

	private horizontal: HTMLCanvasElement;

	private vertical: HTMLCanvasElement;

	/** Pointer position in canvas pixels, drawn as a tracking marker. */
	private marker: { x: number; y: number } | null = null;

	constructor( options: RulersOptions ) {
		this.options = options;

		this.root = document.createElement( 'div' );
		this.root.className = 'dg-rulers';
		this.root.setAttribute( 'aria-hidden', 'true' );

		this.horizontal = document.createElement( 'canvas' );
		this.horizontal.className = 'dg-ruler dg-ruler--h';

		this.vertical = document.createElement( 'canvas' );
		this.vertical.className = 'dg-ruler dg-ruler--v';

		const corner = document.createElement( 'div' );
		corner.className = 'dg-ruler__corner';

		this.root.append( corner, this.horizontal, this.vertical );
		options.stage.appendChild( this.root );

		options.stage.addEventListener( 'pointermove', this.onPointerMove );

		this.draw();
	}

	/** Tracks the pointer so the rulers show where it is. */
	private onPointerMove = ( event: PointerEvent ): void => {
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! viewport || viewport.width === 0 ) {
			return;
		}

		const rect = this.options.stage.getBoundingClientRect();

		this.marker = {
			x:
				( ( event.clientX - rect.left - viewport.x ) / viewport.width ) *
				canvas.width,
			y:
				( ( event.clientY - rect.top - viewport.y ) / viewport.height ) *
				canvas.height,
		};

		this.draw();
	};

	/** Redraws both rulers. */
	draw = (): void => {
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! viewport || canvas.width <= 0 ) {
			this.root.hidden = true;

			return;
		}

		this.root.hidden = false;

		const bounds = this.options.stage.getBoundingClientRect();
		const scale = viewport.width / canvas.width;

		this.paint(
			this.horizontal,
			bounds.width - RULER_SIZE,
			RULER_SIZE,
			'h',
			viewport.x - RULER_SIZE,
			scale
		);
		this.paint(
			this.vertical,
			RULER_SIZE,
			bounds.height - RULER_SIZE,
			'v',
			viewport.y - RULER_SIZE,
			scale
		);
	};

	/**
	 * Paints one ruler.
	 *
	 * @param canvas Target canvas.
	 * @param width  CSS width.
	 * @param height CSS height.
	 * @param axis   Which ruler.
	 * @param origin Where canvas pixel zero falls, in CSS pixels along the ruler.
	 * @param scale  CSS pixels per canvas pixel.
	 */
	private paint(
		canvas: HTMLCanvasElement,
		width: number,
		height: number,
		axis: 'h' | 'v',
		origin: number,
		scale: number
	): void {
		const dpr = window.devicePixelRatio || 1;
		const w = Math.max( 1, Math.round( width ) );
		const h = Math.max( 1, Math.round( height ) );

		if ( canvas.width !== w * dpr || canvas.height !== h * dpr ) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			canvas.style.width = `${ w }px`;
			canvas.style.height = `${ h }px`;
		}

		const ctx = canvas.getContext( '2d' );

		if ( ! ctx ) {
			return;
		}

		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		ctx.clearRect( 0, 0, w, h );

		ctx.fillStyle = '#1a1f24';
		ctx.fillRect( 0, 0, w, h );

		const length = axis === 'h' ? w : h;
		const step = tickStep( scale );

		ctx.font = '9px -apple-system, system-ui, sans-serif';
		ctx.textBaseline = 'top';
		ctx.fillStyle = '#8f979e';
		ctx.strokeStyle = '#4a5259';
		ctx.lineWidth = 1;
		ctx.beginPath();

		// First tick at or before the visible start, so panning does not shift the
		// marks relative to the image.
		const firstValue = Math.floor( -origin / scale / step ) * step;

		for ( let value = firstValue; ; value += step ) {
			const at = origin + value * scale;

			if ( at > length ) {
				break;
			}

			if ( at < 0 ) {
				continue;
			}

			const major = value % ( step * 5 ) === 0;
			const size = major ? RULER_SIZE : RULER_SIZE * 0.4;

			if ( axis === 'h' ) {
				ctx.moveTo( Math.round( at ) + 0.5, RULER_SIZE - size );
				ctx.lineTo( Math.round( at ) + 0.5, RULER_SIZE );
			} else {
				ctx.moveTo( RULER_SIZE - size, Math.round( at ) + 0.5 );
				ctx.lineTo( RULER_SIZE, Math.round( at ) + 0.5 );
			}

			if ( major ) {
				if ( axis === 'h' ) {
					ctx.fillText( String( value ), at + 2, 2 );
				} else {
					// Rotated so the numbers read along the ruler.
					ctx.save();
					ctx.translate( 2, at + 2 );
					ctx.rotate( Math.PI / 2 );
					ctx.fillText( String( value ), 0, -RULER_SIZE + 4 );
					ctx.restore();
				}
			}
		}

		ctx.stroke();

		if ( this.marker ) {
			const at = origin + ( axis === 'h' ? this.marker.x : this.marker.y ) * scale;

			ctx.strokeStyle = '#3582c4';
			ctx.beginPath();

			if ( axis === 'h' ) {
				ctx.moveTo( Math.round( at ) + 0.5, 0 );
				ctx.lineTo( Math.round( at ) + 0.5, RULER_SIZE );
			} else {
				ctx.moveTo( 0, Math.round( at ) + 0.5 );
				ctx.lineTo( RULER_SIZE, Math.round( at ) + 0.5 );
			}

			ctx.stroke();
		}
	}

	/** Shows or hides the rulers. */
	setVisible( visible: boolean ): void {
		this.root.style.display = visible ? '' : 'none';
	}

	/** Removes the rulers. */
	destroy(): void {
		this.options.stage.removeEventListener( 'pointermove', this.onPointerMove );
		this.root.remove();
	}
}

/**
 * Chooses a tick interval in canvas pixels.
 *
 * Steps through a 1-2-5 sequence per decade, which is what keeps the numbers round
 * at every zoom instead of landing on values like 37.
 *
 * @param scale CSS pixels per canvas pixel.
 */
export function tickStep( scale: number ): number {
	const wanted = MIN_LABEL_GAP / Math.max( scale, 1e-6 ) / 5;
	const magnitude = Math.pow( 10, Math.floor( Math.log10( Math.max( wanted, 1e-6 ) ) ) );

	for ( const multiple of [ 1, 2, 5, 10 ] ) {
		if ( magnitude * multiple >= wanted ) {
			return magnitude * multiple;
		}
	}

	return magnitude * 10;
}
