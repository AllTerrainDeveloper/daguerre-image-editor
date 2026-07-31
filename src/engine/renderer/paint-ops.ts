/**
 * Drawing into a layer.
 *
 * Every one of these renders once into the layer's own texture and never re-draws, so
 * a long painting session costs the same per frame as an empty one. All of them are
 * clipped by the selection, because testing a dab's centre alone let half of every
 * edge stroke escape the marquee.
 */

import type { CanvasSize } from '../../model/document';
import type { GpuContext } from './gpu';
import type { LayerTextures } from './layer-textures';

/** A region of a layer, in canvas pixels. */
export interface PixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** What every paint operation needs. */
export interface PaintContext {
	gpu: GpuContext;
	layers: LayerTextures;
	canvas: CanvasSize;
}

export interface StampOptions {
	layerId: string;
	/** Stamp canvas: white, with the brush shape in the alpha. */
	image: HTMLCanvasElement;
	/** Canvas coordinates of the dab centre. */
	x: number;
	y: number;
	/** Diameter in canvas pixels. */
	size: number;
	colour: string;
	opacity: number;
	/** Whether to remove rather than add. */
	erase: boolean;
}

/**
 * Stamps one brush dab into a layer.
 *
 * The stamp is white with its shape in the alpha, tinted here -- so one cached stamp
 * serves every colour.
 *
 * @param ctx     Paint context.
 * @param options Dab to stamp.
 */
export function stampBrush( ctx: PaintContext, options: StampOptions ): void {
	const target = ctx.layers.ensurePaintable( options.layerId, ctx.canvas );
	const texture = ctx.gpu.textureFrom( options.image );
	const sprite = ctx.gpu.sprite( texture );

	sprite.anchor.set( 0.5 );
	sprite.width = options.size;
	sprite.height = options.size;
	sprite.position.set( options.x, options.y );
	sprite.alpha = options.opacity;

	if ( options.erase ) {
		// Removes the destination's alpha rather than painting over it, which is
		// what makes an eraser reveal the layers beneath instead of a colour.
		sprite.blendMode = 'erase';
	} else {
		sprite.tint = options.colour;
	}

	const clip = ctx.layers.clip( sprite );

	ctx.gpu.draw( clip.container, target );
	clip.release();
	texture.destroy( true );
}

/**
 * Paints a full-canvas mask into a layer.
 *
 * @param ctx     Paint context.
 * @param layerId Target layer.
 * @param mask    Canvas-sized mask, opaque where the fill applies.
 * @param colour  CSS colour.
 * @param opacity 0..1.
 */
export function fillWithMask(
	ctx: PaintContext,
	layerId: string,
	mask: HTMLCanvasElement,
	colour: string,
	opacity: number
): void {
	const target = ctx.layers.ensurePaintable( layerId, ctx.canvas );
	const texture = ctx.gpu.textureFrom( mask );
	const sprite = ctx.gpu.sprite( texture );

	sprite.position.set( 0, 0 );
	sprite.alpha = opacity;
	sprite.tint = colour;

	const clip = ctx.layers.clip( sprite );

	ctx.gpu.draw( clip.container, target );
	clip.release();
	texture.destroy( true );
}

/**
 * Composites a bitmap onto a layer.
 *
 * The shared destination for everything that is drawn with the 2D context rather than
 * with a brush stamp: gradients, shapes, text, and the retouching tools' patches.
 *
 * @param ctx     Paint context.
 * @param layerId Target layer.
 * @param source  Bitmap to draw.
 * @param x       Where its top-left corner lands, in canvas pixels.
 * @param y       Where its top-left corner lands, in canvas pixels.
 * @param opacity 0..1.
 * @param erase   Whether to cut the shape out rather than draw it.
 */
export function compositeCanvas(
	ctx: PaintContext,
	layerId: string,
	source: HTMLCanvasElement,
	x = 0,
	y = 0,
	opacity = 1,
	erase = false
): void {
	const target = ctx.layers.ensurePaintable( layerId, ctx.canvas );
	const texture = ctx.gpu.textureFrom( source );
	const sprite = ctx.gpu.sprite( texture );

	sprite.position.set( Math.round( x ), Math.round( y ) );
	sprite.alpha = opacity;

	if ( erase ) {
		sprite.blendMode = 'erase';
	}

	const clip = ctx.layers.clip( sprite );

	ctx.gpu.draw( clip.container, target );
	clip.release();
	texture.destroy( true );
}

/**
 * Reads one rectangle of a layer's pixels.
 *
 * Renders just that region into a small target rather than extracting the whole
 * texture and cropping: undo captures tiles constantly while a stroke is in progress,
 * and a full-texture transfer per tile would cost more than the painting.
 *
 * @param ctx     Paint context.
 * @param layerId Layer to read.
 * @param rect    Region, in canvas pixels.
 * @return The pixels, or null when the layer has no texture yet.
 */
export function extractLayerRegion(
	ctx: PaintContext,
	layerId: string,
	rect: PixelRect
): HTMLCanvasElement | null {
	const texture = ctx.layers.get( layerId );

	if ( ! texture || rect.width < 1 || rect.height < 1 ) {
		return null;
	}

	const target = ctx.gpu.createTarget( rect.width, rect.height );
	const sprite = ctx.gpu.sprite( texture );

	sprite.position.set( -Math.round( rect.x ), -Math.round( rect.y ) );

	ctx.gpu.draw( sprite, target, true );

	const canvas = ctx.gpu.extractCanvas( target );

	sprite.destroy();
	target.destroy( true );

	return canvas;
}

/**
 * Puts one rectangle of a layer back to a previous state.
 *
 * The region is erased first and then redrawn, rather than drawn over. Drawing over
 * would composite the old pixels *onto* the new ones, so a stroke undone would leave
 * both visible -- and an empty region could never be restored at all, because
 * compositing nothing changes nothing.
 *
 * @param ctx     Paint context.
 * @param layerId Layer to write.
 * @param rect    Region, in canvas pixels.
 * @param pixels  What to put there, or null to leave it empty.
 */
export function restoreLayerRegion(
	ctx: PaintContext,
	layerId: string,
	rect: PixelRect,
	pixels: HTMLCanvasElement | null
): void {
	const target = ctx.layers.ensurePaintable( layerId, ctx.canvas );
	const eraser = ctx.gpu.sprite( ctx.gpu.solidTexture() );

	eraser.position.set( Math.round( rect.x ), Math.round( rect.y ) );
	eraser.width = Math.round( rect.width );
	eraser.height = Math.round( rect.height );
	eraser.blendMode = 'erase';

	ctx.gpu.drawDetached( eraser, target );

	if ( pixels ) {
		const texture = ctx.gpu.textureFrom( pixels );
		const sprite = ctx.gpu.sprite( texture );

		sprite.position.set( Math.round( rect.x ), Math.round( rect.y ) );

		ctx.gpu.drawDetached( sprite, target );
		texture.destroy( true );
	}
}
