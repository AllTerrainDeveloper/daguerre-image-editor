/**
 * Smooth or pixelated sampling.
 */

import type { GpuTexture } from './gpu';

/**
 * Above this on-screen scale the user is inspecting pixels and wants to see squares.
 *
 * Slightly above 1 rather than exactly 1, so a fit that lands a hair over does not
 * flip the whole image to nearest-neighbour.
 */
const NEAREST_ABOVE = 1.05;

/**
 * Switches a set of textures between smooth and pixelated sampling.
 *
 * Applied to *every* texture in the chain, not just the one on screen. The source
 * image is resampled when it is composited into the document, and the document is
 * resampled again through the adjustment filter -- so leaving any link on linear
 * reintroduces the smoothing the last link just removed. That is exactly what made
 * zooming still look soft after the display texture alone was switched.
 *
 * @param scale    On-screen scale, where 1 is one canvas pixel per CSS pixel.
 * @param textures Every texture in the chain. Nulls are skipped.
 */
export function applySampling(
	scale: number,
	textures: Iterable< GpuTexture | null | undefined >
): void {
	const wanted = scale > NEAREST_ABOVE ? 'nearest' : 'linear';

	for ( const texture of textures ) {
		if ( ! texture ) {
			continue;
		}

		const source = texture.source as unknown as {
			scaleMode: string;
			style?: { scaleMode: string; update?: () => void };
		};

		if ( source.scaleMode === wanted ) {
			continue;
		}

		source.scaleMode = wanted;

		// Pixi caches the sampler state on the style, so the change has to be
		// announced or the GPU keeps the old filter.
		if ( source.style ) {
			source.style.scaleMode = wanted;
			source.style.update?.();
		}
	}
}
