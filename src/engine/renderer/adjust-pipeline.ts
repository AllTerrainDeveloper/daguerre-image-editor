/**
 * The adjustment filter and its uniforms.
 *
 * One GLSL pass carries every phase-1 op, because they are all per-pixel colour maths
 * and a chain of one-op filters would quantise to 8 bits between each. Blur is the
 * exception and cannot join: a Gaussian has to be separable to be affordable, which
 * means two passes by definition.
 */

import { composeAdjustments } from '../color-matrix';
import type { AdjustUniforms } from '../color-matrix';
import { buildLut, isIdentityCurves, isIdentityLevels } from '../lut';
import type { Curves, Levels } from '../lut';
import { ADJUST_FRAG, ADJUST_VERT } from '../shaders/adjust';
import type { Op } from '../../model/recipe';
import type { OpSchema } from '../../types';
import type { GpuContext, GpuTexture } from './gpu';
import type { Pixi } from '../pixi-loader';

/** A built adjustment filter. */
export type AdjustFilter = InstanceType< Pixi[ 'Filter' ] >;

/** The colour matrix that changes nothing. */
const IDENTITY_MATRIX = [
	1, 0, 0, 0, 0,
	0, 1, 0, 0, 0,
	0, 0, 1, 0, 0,
	0, 0, 0, 1, 0,
];

/**
 * How much of the render width a blur of 1.0 covers.
 *
 * The stored value is a fraction of the longest edge, so a blur previewed on a 900px
 * canvas survives being saved at 6000px instead of becoming imperceptible. Capped well
 * below the full width: a full-width Gaussian would be minutes of GPU time and is not
 * a photo adjustment anyone wants.
 */
const BLUR_FRACTION = 0.04;

/**
 * The adjustment filter, its tone table, and the uniforms they read.
 */
export class AdjustPipeline {
	private gpu: GpuContext;

	private schema: OpSchema;

	private uniforms: AdjustUniforms = {
		matrix: [],
		vibrance: 0,
		sharpen: 0,
		vignette: 0,
		grain: 0,
		blur: 0,
	};

	/** The baked tone table, or null before one has been built. */
	private lut: GpuTexture | null = null;

	/** Whether the tone table currently changes anything. */
	private lutActive = false;

	private bypassed = false;

	/**
	 * Grain seed, fixed for the lifetime of the renderer.
	 *
	 * Constant rather than per-frame so the grain sits still while a slider is
	 * dragged. Crawling grain reads as a rendering bug, not as film.
	 */
	private readonly seed = Math.floor( Math.random() * 1000 );

	/**
	 * @param gpu    Drawing context.
	 * @param schema Op table, used to skip adjustments sitting at rest.
	 */
	constructor( gpu: GpuContext, schema: OpSchema ) {
		this.gpu = gpu;
		this.schema = schema;
	}

	/** Whether the blur pass is currently doing anything. */
	get hasBlur(): boolean {
		return this.uniforms.blur > 0;
	}

	/** Whether the adjustments are currently being skipped. */
	get bypass(): boolean {
		return this.bypassed;
	}

	/**
	 * Builds a fresh adjustment filter.
	 *
	 * A new instance per call, deliberately. A Pixi filter holds per-instance uniform
	 * buffers, so sharing one between two concurrent render targets is asking for the
	 * wrong values on one of them.
	 *
	 * `uColorMatrix` is declared with `size: 20` so Pixi uploads it as a GLSL array
	 * uniform rather than a scalar.
	 */
	build(): AdjustFilter {
		const uniforms = new this.gpu.pixi.UniformGroup( {
			uColorMatrix: { value: [ ...IDENTITY_MATRIX ], type: 'f32', size: 20 },
			uVibrance: { value: 0, type: 'f32' },
			uLutMix: { value: 0, type: 'f32' },
			uSharpen: { value: 0, type: 'f32' },
			uVignette: { value: 0, type: 'f32' },
			uGrain: { value: 0, type: 'f32' },
			uSeed: { value: 0, type: 'f32' },
		} );

		return new this.gpu.pixi.Filter( {
			glProgram: this.gpu.pixi.GlProgram.from( {
				vertex: ADJUST_VERT,
				fragment: ADJUST_FRAG,
				name: 'lienzo-adjust',
			} ),
			resources: {
				adjustUniforms: uniforms,
				// A second texture needs both its source and its sampler style. Binding
				// only the source leaves the sampler unresolved and the program fails to
				// link -- which surfaces as "Could not initialize shader" and a blank
				// canvas, because Pixi silently skips a filter it could not compile.
				uLut: this.lutTexture().source,
				uLutSampler: this.lutTexture().source.style,
			},
		} );
	}

	/**
	 * The tone lookup table texture, created on first use.
	 *
	 * Sampled with nearest-neighbour filtering. Linear filtering would blend adjacent
	 * entries and quietly soften any hard step a user deliberately put in a curve.
	 */
	private lutTexture(): GpuTexture {
		if ( ! this.lut ) {
			this.lut = new this.gpu.pixi.Texture( {
				source: new this.gpu.pixi.BufferImageSource( {
					resource: buildLut(),
					width: 256,
					height: 1,
					scaleMode: 'nearest',
					alphaMode: 'premultiply-alpha-on-upload',
				} ),
			} );
		}

		return this.lut;
	}

	/**
	 * Rebuilds the tone table from curves and levels.
	 *
	 * @param curves Curve set.
	 * @param levels Levels.
	 */
	setTone( curves: Curves, levels: Levels ): void {
		const source = this.lutTexture().source as unknown as {
			resource: Uint8Array;
			update: () => void;
		};

		source.resource.set( buildLut( curves, levels ) );
		source.update();

		this.lutActive = ! ( isIdentityCurves( curves ) && isIdentityLevels( levels ) );
	}

	/**
	 * Sets the adjustments to render.
	 *
	 * @param ops Recipe ops.
	 * @return True when the blur pass was switched on or off, so the chain needs
	 *         rebuilding.
	 */
	setOps( ops: Op[] ): boolean {
		const hadBlur = this.hasBlur;

		this.uniforms = composeAdjustments( ops, this.schema );

		return hadBlur !== this.hasBlur;
	}

	/**
	 * Temporarily shows the unedited image, for a before/after comparison.
	 *
	 * @param bypass Whether to skip the adjustments.
	 * @return True when the state changed.
	 */
	setBypass( bypass: boolean ): boolean {
		if ( this.bypassed === bypass ) {
			return false;
		}

		this.bypassed = bypass;

		return true;
	}

	/**
	 * The blur radius for a given render width.
	 *
	 * @param width Width being rendered, in pixels.
	 */
	blurStrength( width: number ): number {
		return Math.max( 0.1, this.uniforms.blur * BLUR_FRACTION * width );
	}

	/**
	 * Pushes the current uniforms onto a filter.
	 *
	 * @param filter Filter to update.
	 */
	applyTo( filter: AdjustFilter ): void {
		const group = (
			filter.resources as Record<
				string,
				{ uniforms: Record< string, unknown > }
			>
		).adjustUniforms;

		const off = this.bypassed;

		group.uniforms.uColorMatrix = off ? [ ...IDENTITY_MATRIX ] : this.uniforms.matrix;
		group.uniforms.uVibrance = off ? 0 : this.uniforms.vibrance;
		group.uniforms.uLutMix = ! off && this.lutActive ? 1 : 0;
		group.uniforms.uSharpen = off ? 0 : this.uniforms.sharpen;
		group.uniforms.uVignette = off ? 0 : this.uniforms.vignette;
		group.uniforms.uGrain = off ? 0 : this.uniforms.grain;
		group.uniforms.uSeed = this.seed;
	}

	/** Frees the tone table. */
	release(): void {
		this.lut?.destroy( true );
		this.lut = null;
	}
}
