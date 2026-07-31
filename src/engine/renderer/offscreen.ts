/**
 * Rendering the edit somewhere other than the screen.
 *
 * Two callers, one path: the histogram probe wants a small copy, the save path wants a
 * full-resolution one. Both need the image square in the corner at a known scale --
 * which is exactly what the on-screen sprite is not, since it carries the
 * fit-to-viewport transform and a centred anchor.
 */

import type { AdjustPipeline } from './adjust-pipeline';
import { encodeCanvas } from './encode';
import type { GpuContext, GpuSprite, GpuTexture } from './gpu';

/** What an offscreen render needs. */
export interface OffscreenContext {
	gpu: GpuContext;
	adjust: AdjustPipeline;
	/** The texture every downstream stage reads. */
	texture: () => GpuTexture | null;
}

/**
 * Builds a throwaway sprite of the current edit.
 *
 * It gets its own filter instance carrying the same uniforms: a Pixi filter holds
 * per-instance uniform buffers, so sharing one between two concurrent render targets
 * is asking for the wrong values on one of them.
 *
 * @param ctx   Offscreen context.
 * @param scale Scale factor to apply.
 * @return The sprite, or null when nothing is loaded.
 */
export function makeRenderSprite(
	ctx: OffscreenContext,
	scale: number
): GpuSprite | null {
	const texture = ctx.texture();

	if ( ! texture ) {
		return null;
	}

	const sprite = ctx.gpu.sprite( texture );
	const filter = ctx.adjust.build();

	sprite.anchor.set( 0 );
	sprite.position.set( 0, 0 );
	sprite.scale.set( scale );

	ctx.adjust.applyTo( filter );

	if ( ! ctx.adjust.bypass && ctx.adjust.hasBlur ) {
		const blur = new ctx.gpu.pixi.BlurFilter( {
			strength: ctx.adjust.blurStrength( texture.width * scale ),
			quality: 3,
		} );

		sprite.filters = [ blur, filter ];

		return sprite;
	}

	sprite.filters = [ filter ];

	return sprite;
}

/**
 * Renders the edit at full resolution and encodes it.
 *
 * Runs the same filter as the preview, against the unscaled texture. Because every
 * phase-1 op is per-pixel colour maths with no spatial radius, the result is exactly
 * what the proxy was previewing, just with more pixels.
 *
 * @param ctx             Offscreen context.
 * @param format          Output MIME type.
 * @param quality         Encoder quality, 0..1. Ignored for PNG.
 * @param maxRenderPixels Refuse to render more than this many pixels in one pass.
 * @return The encoded image.
 * @throws {Error} When nothing is loaded, the image is too large, or encoding fails.
 */
export async function renderFull(
	ctx: OffscreenContext,
	format: string,
	quality: number,
	maxRenderPixels: number
): Promise< Blob > {
	const texture = ctx.texture();

	if ( ! texture ) {
		throw new Error( 'No image is loaded.' );
	}

	const { width, height } = texture;

	if ( width * height > maxRenderPixels ) {
		throw new Error(
			`This image is too large to render in the browser (${ width }x${ height }).`
		);
	}

	const sprite = makeRenderSprite( ctx, 1 )!;
	let target = null;

	try {
		target = ctx.gpu.createTarget( width, height );

		ctx.gpu.draw( sprite, target, true );

		return await encodeCanvas( ctx.gpu.extractCanvas( target ), format, quality );
	} finally {
		sprite.destroy( { children: true } );
		target?.destroy( true );
	}
}
