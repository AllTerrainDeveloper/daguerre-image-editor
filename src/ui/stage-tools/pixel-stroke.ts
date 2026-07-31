/**
 * The retouching strokes, which read pixels rather than lay down paint.
 *
 * Heal, clone, dodge, burn and the history brush all work the same way: lift the
 * composed document once, walk it dab by dab, and upload only each dab's own dirty
 * rectangle. Reading once per stroke rather than once per dab is what keeps them usable
 * on a big photograph, and uploading only the dirty rectangle is what keeps the cost
 * proportional to the brush rather than to the document.
 *
 * The composed document is the right source because it is what the user sees. The base
 * image layer is not canvas-aligned, so reading it directly would blur the wrong pixels
 * the moment the image had been moved.
 */

import { applyPixelDab } from '../../engine/pixel-tools';
import type { Carry, PixelBuffer, PixelOp } from '../../engine/pixel-tools';
import type { Point } from '../../model/selection';
import type { ActiveTool } from '../panels';
import { cutPatch } from './patch';
import { PIXEL_OPS, PIXEL_TOOLS } from './types';
import type { StageToolsOptions } from './types';

/**
 * Whether a tool retouches pixels rather than painting over them.
 *
 * @param tool Tool to test.
 */
export function isPixelTool( tool: ActiveTool ): boolean {
	return PIXEL_TOOLS.includes( tool );
}

/**
 * One retouching stroke in progress.
 */
export class PixelStroke {
	private options: StageToolsOptions;

	/** Working pixels for the stroke, lifted once when it began. */
	private work: PixelBuffer | null = null;

	/** Colour carried between smudge dabs. */
	private carry: Carry | null = null;

	/** The image before anything was painted, for the history brush. */
	private pristine: PixelBuffer | null = null;

	/** Offset from the stroke to the clone source, fixed at the first dab. */
	private offset: Point | null = null;

	/**
	 * @param options Tool wiring.
	 */
	constructor( options: StageToolsOptions ) {
		this.options = options;
	}

	/**
	 * Fixes where the clone stamp copies from for this stroke.
	 *
	 * @param offset Distance from the stroke to the sample point, in canvas pixels.
	 */
	setCloneOffset( offset: Point | null ): void {
		this.offset = offset;
	}

	/**
	 * Prepares a stroke.
	 *
	 * @param tool Active tool.
	 */
	begin( tool: ActiveTool ): void {
		if ( ! isPixelTool( tool ) ) {
			return;
		}

		const source = this.options.readDocument();

		this.carry = null;
		this.work = source
			? {
					data: new Uint8ClampedArray( source.pixels ),
					width: source.width,
					height: source.height,
			  }
			: null;

		// The history brush reads the image as it was before anything was painted, so
		// it needs a second buffer that the stroke never writes into.
		if ( 'history' !== tool ) {
			this.pristine = null;

			return;
		}

		const pristine = this.options.readPristine();

		this.pristine = pristine
			? {
					data: pristine.pixels,
					width: pristine.width,
					height: pristine.height,
			  }
			: null;
	}

	/**
	 * Applies one dab and composites the changed pixels back.
	 *
	 * @param point Canvas coordinates.
	 * @param tool  Active tool.
	 */
	dab( point: Point, tool: ActiveTool ): void {
		const work = this.work;

		if ( ! work ) {
			return;
		}

		const brush = this.options.getBrush();
		const op: PixelOp =
			PIXEL_OPS[ tool ] ?? ( 'tone' === tool ? brush.tone : brush.retouch );

		if ( 'restore' === op && ! this.pristine ) {
			return;
		}

		const result = applyPixelDab( {
			op,
			target: work,
			source: 'restore' === op ? ( this.pristine as PixelBuffer ) : undefined,
			x: point.x,
			y: point.y,
			radius: brush.size,
			strength: brush.strength,
			hardness: brush.hardness,
			offsetX: this.offset?.x ?? 0,
			offsetY: this.offset?.y ?? 0,
			carry: this.carry,
		} );

		if ( ! result ) {
			return;
		}

		this.carry = result.carry ?? this.carry;

		const patch = cutPatch( work, result.rect );

		if ( ! patch ) {
			return;
		}

		this.options.composite(
			this.options.getTargetLayerId(),
			patch,
			result.rect.x,
			result.rect.y,
			1
		);
	}

	/** Drops the stroke's buffers. */
	reset(): void {
		this.work = null;
		this.carry = null;
		this.pristine = null;
	}
}
