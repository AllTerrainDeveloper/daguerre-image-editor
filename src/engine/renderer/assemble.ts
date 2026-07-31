/**
 * Wiring the engine's collaborators together.
 *
 * Each of them needs one or two things the renderer holds -- the current canvas size,
 * the texture on screen, the sprite being displayed -- and every one of those is read
 * through a closure rather than passed by value, because all three change over the
 * renderer's life and none of the collaborators should have to be told.
 */

import { AdjustPipeline } from './adjust-pipeline';
import { DocumentCompositor } from './compositor';
import type { GpuContext, GpuSprite, GpuTexture } from './gpu';
import { HistogramProbe } from './histogram-probe';
import { LayerTextures } from './layer-textures';
import { makeRenderSprite } from './offscreen';
import type { OffscreenContext } from './offscreen';
import { PaintApi } from './paint-api';
import { ScreenFilters } from './screen-filters';
import { ViewController } from './view-controller';
import type { CanvasSize } from '../../model/document';
import type { OpSchema } from '../../types';

/** What the assembly reads back out of the renderer. */
export interface EngineReads {
	/** Current canvas size. */
	canvas: () => CanvasSize;
	/** The loaded source texture, before any composition. */
	source: () => GpuTexture | null;
	/** The texture every downstream stage reads. */
	display: () => GpuTexture | null;
	/** The on-screen sprite. */
	sprite: () => GpuSprite | null;
	/** Called after any change to a layer's pixels. */
	onPaint: () => void;
}

/** Everything the renderer delegates to. */
export interface Engine {
	adjust: AdjustPipeline;
	filters: ScreenFilters;
	layers: LayerTextures;
	compositor: DocumentCompositor;
	view: ViewController;
	paint: PaintApi;
	histogram: HistogramProbe;
	offscreen: OffscreenContext;
}

/**
 * Builds the engine.
 *
 * @param gpu    Drawing context.
 * @param host   Element the canvas fills.
 * @param schema Op table, used to skip adjustments sitting at rest.
 * @param reads  How to read the renderer's own state.
 */
export function assemble(
	gpu: GpuContext,
	host: HTMLElement,
	schema: OpSchema,
	reads: EngineReads
): Engine {
	const adjust = new AdjustPipeline( gpu, schema );
	const layers = new LayerTextures( gpu );
	const compositor = new DocumentCompositor( gpu, layers );

	const offscreen: OffscreenContext = { gpu, adjust, texture: reads.display };

	const view = new ViewController( gpu, host, {
		sprite: reads.sprite,
		size: () => sizeOf( reads.display() ),
		textures: () => [ reads.source(), reads.display(), ...layers.all() ],
	} );

	const paint = new PaintApi( {
		gpu,
		layers,
		canvas: reads.canvas,
		onChange: reads.onPaint,
	} );

	const histogram = new HistogramProbe( gpu, {
		size: () => ( reads.source() ? sizeOf( reads.display() ) : null ),
		sprite: ( scale ) => makeRenderSprite( offscreen, scale ),
	} );

	return {
		adjust,
		filters: new ScreenFilters( gpu, adjust ),
		layers,
		compositor,
		view,
		paint,
		histogram,
		offscreen,
	};
}

/**
 * A texture's dimensions, or zeroes when there is none.
 *
 * @param texture Texture to measure.
 */
export function sizeOf( texture: GpuTexture | null ): CanvasSize {
	return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
}
