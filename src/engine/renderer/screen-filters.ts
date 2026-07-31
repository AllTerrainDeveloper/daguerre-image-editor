/**
 * The filter chain hanging off the on-screen sprite.
 *
 * One GLSL pass carries every phase-1 op. Blur is the exception and gets a second
 * pass, but only while it is actually doing something -- so an edit without blur still
 * pays for exactly one pass and one quantisation.
 *
 * Separate from `AdjustPipeline` because that owns the *values*; this owns the two
 * filter instances the display sprite is wearing, and the rule for when the second one
 * joins them.
 */

import type { Op } from '../../model/recipe';
import type { Curves, Levels } from '../lut';
import type { AdjustPipeline, AdjustFilter } from './adjust-pipeline';
import type { GpuContext, GpuSprite } from './gpu';

/**
 * The filters applied to what is on screen.
 */
export class ScreenFilters {
	private gpu: GpuContext;

	private adjust: AdjustPipeline;

	private sprite: GpuSprite | null = null;

	private filter: AdjustFilter | null = null;

	/** Separable blur, added to the chain only when the blur op is non-zero. */
	private blur: InstanceType< GpuContext[ 'pixi' ][ 'BlurFilter' ] > | null = null;

	/**
	 * @param gpu    Drawing context.
	 * @param adjust The pipeline holding the uniform values.
	 */
	constructor( gpu: GpuContext, adjust: AdjustPipeline ) {
		this.gpu = gpu;
		this.adjust = adjust;
	}

	/**
	 * Puts the chain on a newly created sprite.
	 *
	 * @param sprite Sprite to filter.
	 */
	attach( sprite: GpuSprite ): void {
		this.sprite = sprite;
		this.filter = this.adjust.build();

		this.rebuildChain();
		sprite.filters ??= [ this.filter ];
		this.applyUniforms();
	}

	/**
	 * Rebuilds the tone table from curves and levels.
	 *
	 * @param curves Curve set.
	 * @param levels Levels.
	 */
	setTone( curves: Curves, levels: Levels ): void {
		this.adjust.setTone( curves, levels );
		this.applyUniforms();
	}

	/**
	 * Sets the adjustments to render.
	 *
	 * @param ops        Recipe ops.
	 * @param blurTarget Width the blur radius should be scaled to.
	 */
	setOps( ops: Op[], blurTarget: number ): void {
		if ( this.adjust.setOps( ops ) ) {
			this.rebuildChain();
		}

		this.refreshBlur( blurTarget );
		this.applyUniforms();
	}

	/**
	 * Temporarily shows the unedited image.
	 *
	 * @param bypass Whether to skip the adjustments.
	 * @return True when the state changed, so the caller can re-measure.
	 */
	setBypass( bypass: boolean ): boolean {
		if ( ! this.adjust.setBypass( bypass ) ) {
			return false;
		}

		this.applyUniforms();

		return true;
	}

	/**
	 * Scales the blur radius to whatever is being rendered.
	 *
	 * The stored value is a fraction of the longest edge, so a blur previewed on a
	 * 900px canvas survives being saved at 6000px instead of becoming imperceptible.
	 *
	 * @param width Width being rendered, in pixels.
	 */
	refreshBlur( width: number ): void {
		if ( this.blur && this.adjust.hasBlur ) {
			this.blur.strength = this.adjust.blurStrength( width );
		}
	}

	/** Adds or removes the blur pass. */
	private rebuildChain(): void {
		if ( ! this.sprite || ! this.filter ) {
			return;
		}

		if ( ! this.adjust.hasBlur ) {
			this.sprite.filters = [ this.filter ];

			return;
		}

		this.blur ??= new this.gpu.pixi.BlurFilter( { strength: 1, quality: 3 } );
		this.sprite.filters = [ this.blur, this.filter ];
	}

	/** Pushes the current uniforms onto the on-screen filter. */
	applyUniforms(): void {
		if ( this.filter ) {
			this.adjust.applyTo( this.filter );
		}
	}

	/** Forgets the sprite's filter, which is destroyed along with the sprite. */
	release(): void {
		this.sprite = null;
		this.filter = null;
	}
}
