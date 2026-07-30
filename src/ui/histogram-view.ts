/**
 * Draws a histogram onto a 2D canvas.
 *
 * The three colour channels are drawn with additive compositing, which is what
 * makes the plot readable: where all three overlap the result reads as neutral
 * grey, and a cast shows up immediately as a channel poking out on its own. The
 * luminance curve is stroked on top as a single outline.
 */

import type { Histogram } from '../engine/histogram';

/** Fill colours for the three channels, kept dim enough that overlaps stay legible. */
const CHANNEL_COLOURS = [ '#ff4d4d', '#4dff88', '#4d9dff' ] as const;

/**
 * A canvas-backed histogram plot.
 */
export class HistogramView {
	public readonly el: HTMLElement;

	private canvas: HTMLCanvasElement;

	private ctx: CanvasRenderingContext2D | null;

	private last: Histogram | null = null;

	private resizeObserver: ResizeObserver | null = null;

	constructor() {
		this.el = document.createElement( 'div' );
		this.el.className = 'lz-histogram';
		this.el.setAttribute( 'role', 'img' );
		this.el.setAttribute( 'aria-label', 'Tone distribution of the edited image' );

		this.canvas = document.createElement( 'canvas' );
		this.canvas.className = 'lz-histogram__canvas';
		this.el.appendChild( this.canvas );

		this.ctx = this.canvas.getContext( '2d' );

		if ( typeof ResizeObserver !== 'undefined' ) {
			this.resizeObserver = new ResizeObserver( () => this.redraw() );
			this.resizeObserver.observe( this.el );
		}
	}

	/**
	 * Replaces the plotted data.
	 *
	 * @param histogram Bucket counts.
	 */
	update( histogram: Histogram ): void {
		this.last = histogram;
		this.redraw();
	}

	/** Re-renders the last histogram at the current element size. */
	private redraw(): void {
		if ( ! this.ctx ) {
			return;
		}

		const dpr = window.devicePixelRatio || 1;
		const rect = this.el.getBoundingClientRect();
		const width = Math.max( 1, Math.round( rect.width ) );
		const height = Math.max( 1, Math.round( rect.height ) );

		if ( this.canvas.width !== width * dpr || this.canvas.height !== height * dpr ) {
			this.canvas.width = width * dpr;
			this.canvas.height = height * dpr;
			this.canvas.style.width = `${ width }px`;
			this.canvas.style.height = `${ height }px`;
		}

		const ctx = this.ctx;
		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		ctx.clearRect( 0, 0, width, height );

		const histogram = this.last;

		if ( ! histogram || histogram.total === 0 || histogram.peak === 0 ) {
			return;
		}

		ctx.save();
		ctx.globalCompositeOperation = 'lighter';

		[ histogram.r, histogram.g, histogram.b ].forEach( ( bins, index ) => {
			ctx.fillStyle = CHANNEL_COLOURS[ index ];
			ctx.globalAlpha = 0.55;
			this.fillCurve( ctx, bins, histogram.peak, width, height );
		} );

		ctx.restore();

		ctx.save();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
		ctx.lineWidth = 1;
		this.strokeCurve( ctx, histogram.luma, histogram.peak, width, height );
		ctx.restore();
	}

	/**
	 * Builds the path for one channel.
	 *
	 * Counts above `peak` are clamped to the top rather than rescaling everything,
	 * so a clipping spike reads as a bar running off the plot instead of flattening
	 * the whole curve. See `histogramPeak()` for why the peak excludes the extremes.
	 */
	private traceCurve(
		ctx: CanvasRenderingContext2D,
		bins: Uint32Array,
		peak: number,
		width: number,
		height: number
	): void {
		ctx.beginPath();
		ctx.moveTo( 0, height );

		for ( let i = 0; i < 256; i++ ) {
			const x = ( i / 255 ) * width;
			const y = height - Math.min( 1, bins[ i ] / peak ) * height;
			ctx.lineTo( x, y );
		}

		ctx.lineTo( width, height );
	}

	/** Fills one channel's curve. */
	private fillCurve(
		ctx: CanvasRenderingContext2D,
		bins: Uint32Array,
		peak: number,
		width: number,
		height: number
	): void {
		this.traceCurve( ctx, bins, peak, width, height );
		ctx.closePath();
		ctx.fill();
	}

	/** Strokes one channel's curve. */
	private strokeCurve(
		ctx: CanvasRenderingContext2D,
		bins: Uint32Array,
		peak: number,
		width: number,
		height: number
	): void {
		this.traceCurve( ctx, bins, peak, width, height );
		ctx.stroke();
	}

	/** Releases the resize observer. */
	destroy(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
	}
}
