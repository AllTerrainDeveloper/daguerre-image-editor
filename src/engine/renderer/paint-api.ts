/**
 * The painting surface, as the editor sees it.
 *
 * Grouped rather than flattened onto the renderer because these are the methods a
 * *tool* needs and nothing else does. The stroke recorder, the clipboard and the layer
 * importer can each be handed this instead of the whole engine, which is what keeps
 * them testable against a stub.
 */

import type { CanvasSize } from '../../model/document';
import type { GpuContext, GpuTarget } from './gpu';
import type { LayerTextures } from './layer-textures';
import {
	compositeCanvas,
	extractLayerRegion,
	fillWithMask,
	restoreLayerRegion,
	stampBrush,
} from './paint-ops';
import type { PixelRect } from './paint-ops';

/** What the paint API needs from the renderer. */
export interface PaintApiHost {
	gpu: GpuContext;
	layers: LayerTextures;
	/** Current canvas size. */
	canvas: () => CanvasSize;
	/** Called after any change to a layer's pixels. */
	onChange: () => void;
}

/**
 * Everything that writes pixels into a layer.
 */
export class PaintApi {
	private host: PaintApiHost;

	/**
	 * @param host Renderer internals the operations run against.
	 */
	constructor( host: PaintApiHost ) {
		this.host = host;
	}

	/** The context every operation runs in. */
	private get ctx() {
		return {
			gpu: this.host.gpu,
			layers: this.host.layers,
			canvas: this.host.canvas(),
		};
	}

	/**
	 * Creates a raster layer's backing texture from an image.
	 *
	 * @param id     Layer id.
	 * @param source Decoded pixels.
	 */
	addRasterTexture( id: string, source: HTMLCanvasElement | HTMLImageElement ): void {
		this.host.layers.addRaster( id, source );
	}

	/**
	 * Creates an empty paintable texture for a layer, canvas-sized.
	 *
	 * @param id Layer id.
	 */
	ensurePaintTexture( id: string ): GpuTarget {
		return this.host.layers.ensurePaintable( id, this.host.canvas() );
	}

	/**
	 * The native size of whatever backs a layer.
	 *
	 * @param id Layer id.
	 */
	layerTextureSize( id: string ): CanvasSize {
		return this.host.layers.sizeOf( id );
	}

	/**
	 * Sets the mask confining every paint operation.
	 *
	 * @param mask Canvas-sized alpha mask, or null for no confinement.
	 */
	setPaintMask( mask: HTMLCanvasElement | null ): void {
		this.host.layers.setMask( mask );
	}

	/**
	 * Renders a display object into a layer's texture.
	 *
	 * This is how a brush stroke becomes permanent: the stroke is drawn once into the
	 * layer and never re-drawn, so a long painting session costs the same per frame as
	 * an empty one.
	 *
	 * @param id        Layer to paint into.
	 * @param container What to draw.
	 */
	paintInto( id: string, container: unknown ): void {
		this.host.gpu.draw( container, this.ensurePaintTexture( id ) );
		this.host.onChange();
	}

	/**
	 * Stamps one brush dab into a layer.
	 *
	 * @param layerId Target layer.
	 * @param image   Stamp canvas, white with its shape in the alpha.
	 * @param x       Canvas coordinates of the dab centre.
	 * @param y       Canvas coordinates of the dab centre.
	 * @param size    Diameter in canvas pixels.
	 * @param colour  CSS colour.
	 * @param opacity 0..1.
	 * @param erase   Whether to remove rather than add.
	 */
	stampBrush(
		layerId: string,
		image: HTMLCanvasElement,
		x: number,
		y: number,
		size: number,
		colour: string,
		opacity: number,
		erase: boolean
	): void {
		stampBrush( this.ctx, {
			layerId,
			image,
			x,
			y,
			size,
			colour,
			opacity,
			erase,
		} );
		this.host.onChange();
	}

	/**
	 * Paints a full-canvas mask into a layer.
	 *
	 * @param layerId Target layer.
	 * @param mask    Canvas-sized mask, opaque where the fill applies.
	 * @param colour  CSS colour.
	 * @param opacity 0..1.
	 */
	fillWithMask(
		layerId: string,
		mask: HTMLCanvasElement,
		colour: string,
		opacity: number
	): void {
		fillWithMask( this.ctx, layerId, mask, colour, opacity );
		this.host.onChange();
	}

	/**
	 * Composites a bitmap onto a layer.
	 *
	 * @param layerId Target layer.
	 * @param source  Bitmap to draw.
	 * @param x       Where its top-left corner lands, in canvas pixels.
	 * @param y       Where its top-left corner lands, in canvas pixels.
	 * @param opacity 0..1.
	 * @param erase   Whether to cut the shape out rather than draw it.
	 */
	compositeCanvas(
		layerId: string,
		source: HTMLCanvasElement,
		x = 0,
		y = 0,
		opacity = 1,
		erase = false
	): void {
		compositeCanvas( this.ctx, layerId, source, x, y, opacity, erase );
		this.host.onChange();
	}

	/**
	 * Reads one rectangle of a layer's pixels.
	 *
	 * @param layerId Layer to read.
	 * @param rect    Region, in canvas pixels.
	 */
	extractLayerRegion( layerId: string, rect: PixelRect ): HTMLCanvasElement | null {
		return extractLayerRegion( this.ctx, layerId, rect );
	}

	/**
	 * Puts one rectangle of a layer back to a previous state.
	 *
	 * @param layerId Layer to write.
	 * @param rect    Region, in canvas pixels.
	 * @param pixels  What to put there, or null to leave it empty.
	 */
	restoreLayerRegion(
		layerId: string,
		rect: PixelRect,
		pixels: HTMLCanvasElement | null
	): void {
		restoreLayerRegion( this.ctx, layerId, rect, pixels );
		this.host.onChange();
	}
}
