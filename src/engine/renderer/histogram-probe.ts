/**
 * The live histogram.
 *
 * Reading pixels back forces a synchronous flush of the GPU pipeline, and how
 * expensive that is depends entirely on the machine -- so rather than assume a rate,
 * this times its own work and backs off only when it needs to. On hardware where the
 * pass is cheap it never skips anything.
 */

import { computeHistogram, emptyHistogram } from '../histogram';
import type { Histogram } from '../histogram';
import type { GpuContext, GpuSprite } from './gpu';

/** Longest edge of the offscreen target the histogram is measured from. */
const HISTOGRAM_EDGE = 256;

/**
 * Cost above which the histogram starts skipping frames, in milliseconds.
 *
 * Measured on a mid-range laptop, a full histogram pass at HISTOGRAM_EDGE costs
 * about 4ms -- roughly a quarter of a 60fps frame -- so it runs live on every frame
 * of a slider drag. This budget exists for the machines where that is not true: a
 * weak GPU, a huge viewport, or a browser already under load.
 */
const HISTOGRAM_BUDGET_MS = 8;

/** Most consecutive frames the histogram will skip when it is over budget. */
const HISTOGRAM_MAX_SKIP = 4;

/** What the probe needs from the renderer to take a measurement. */
export interface ProbeSource {
	/** Size of the texture being measured, or null when nothing is loaded. */
	size: () => { width: number; height: number } | null;
	/** Builds a throwaway sprite of the edit, at the given scale. */
	sprite: ( scale: number ) => GpuSprite | null;
}

/**
 * Renders a small copy of the edit, reads it back, and reports the distribution.
 */
export class HistogramProbe {
	private gpu: GpuContext;

	private source: ProbeSource;

	private listeners = new Set< ( histogram: Histogram ) => void >();

	private frame: number | null = null;

	/** Frames still to skip because the last pass ran over budget. */
	private skip = 0;

	private stopped = false;

	/**
	 * @param gpu    Drawing context.
	 * @param source How to build the thing being measured.
	 */
	constructor( gpu: GpuContext, source: ProbeSource ) {
		this.gpu = gpu;
		this.source = source;
	}

	/**
	 * Subscribes to histogram updates.
	 *
	 * @param listener Called after each recomputation.
	 * @return Unsubscribe function.
	 */
	subscribe( listener: ( histogram: Histogram ) => void ): () => void {
		this.listeners.add( listener );

		return () => {
			this.listeners.delete( listener );
		};
	}

	/**
	 * Queues a recomputation for the next animation frame.
	 *
	 * A slider drag fires many pointer moves per frame, so the work is coalesced to
	 * one pass per frame -- the display cannot show more than that anyway. Aligning
	 * to the frame also means the readback happens once the frame's drawing is
	 * already queued, rather than interleaved with it.
	 */
	schedule(): void {
		if ( null !== this.frame ) {
			return;
		}

		this.frame = window.requestAnimationFrame( () => {
			this.frame = null;

			if ( this.skip > 0 ) {
				this.skip--;
				// Re-arm, so the final state still gets a histogram even while
				// backing off.
				this.schedule();

				return;
			}

			this.measure();
		} );
	}

	/** Renders the probe, reads it back, and notifies listeners. */
	private measure(): void {
		const size = this.source.size();

		if ( this.stopped || ! size || 0 === this.listeners.size ) {
			return;
		}

		const started = performance.now();
		const width = Math.max( 1, Math.round( size.width * fitScale( size ) ) );
		const height = Math.max( 1, Math.round( size.height * fitScale( size ) ) );

		let target = null;

		try {
			target = this.gpu.createTarget( width, height );

			const probe = this.source.sprite( width / size.width );

			if ( ! probe ) {
				return;
			}

			this.gpu.draw( probe, target, true );

			const { pixels } = this.gpu.extractPixels( target );

			probe.destroy( { children: true } );
			this.emit( computeHistogram( pixels ) );
		} catch {
			// A lost GPU context or a tainted canvas both land here. The image is
			// still perfectly editable, so degrade to an empty plot rather than
			// failing the whole editor.
			this.emit( emptyHistogram() );
		} finally {
			target?.destroy( true );
		}

		const cost = performance.now() - started;

		this.skip =
			cost > HISTOGRAM_BUDGET_MS
				? Math.min( HISTOGRAM_MAX_SKIP, Math.ceil( cost / HISTOGRAM_BUDGET_MS ) - 1 )
				: 0;
	}

	/**
	 * Emits a histogram to every listener.
	 *
	 * @param histogram Computed histogram.
	 */
	private emit( histogram: Histogram ): void {
		for ( const listener of this.listeners ) {
			listener( histogram );
		}
	}

	/** Cancels any pending pass and drops every listener. */
	stop(): void {
		this.stopped = true;

		if ( null !== this.frame ) {
			window.cancelAnimationFrame( this.frame );
			this.frame = null;
		}

		this.listeners.clear();
	}
}

/**
 * How much to shrink an image so its longest edge fits the probe.
 *
 * @param size Image size.
 */
function fitScale( size: { width: number; height: number } ): number {
	return Math.min( HISTOGRAM_EDGE / Math.max( size.width, size.height ), 1 );
}
