/**
 * Pixel content per layer.
 *
 * Kept outside the recipe because it is not describable: an `image` layer maps to the
 * loaded source texture, and a `raster` layer to a RenderTexture holding pixels that
 * exist nowhere else. That last part is why the lifetime rules here matter so much --
 * free a raster layer's texture and the pixels are gone for good.
 */

import { BASE_LAYER_ID } from '../../model/document';
import type { CanvasSize } from '../../model/document';
import type { GpuContext, GpuSprite, GpuTarget, GpuTexture } from './gpu';

/** A sprite wrapped in the current selection mask, and its teardown. */
export interface ClippedSprite {
	container: unknown;
	release: () => void;
}

/**
 * The textures behind the layer stack, and the mask that confines painting.
 */
export class LayerTextures {
	private gpu: GpuContext;

	private textures = new Map< string, GpuTexture >();

	/** The selection, rasterised, confining every paint operation. */
	private mask: GpuTexture | null = null;

	/**
	 * @param gpu Drawing context.
	 */
	constructor( gpu: GpuContext ) {
		this.gpu = gpu;
	}

	/**
	 * The texture behind a layer, when it has one.
	 *
	 * @param id Layer id.
	 */
	get( id: string ): GpuTexture | undefined {
		return this.textures.get( id );
	}

	/**
	 * Whether a layer has a texture.
	 *
	 * @param id Layer id.
	 */
	has( id: string ): boolean {
		return this.textures.has( id );
	}

	/**
	 * Adopts a texture for a layer.
	 *
	 * @param id      Layer id.
	 * @param texture Texture to adopt.
	 */
	set( id: string, texture: GpuTexture ): void {
		this.textures.set( id, texture );
	}

	/** Every texture currently held. */
	all(): Iterable< GpuTexture > {
		return this.textures.values();
	}

	/**
	 * The native size of whatever backs a layer.
	 *
	 * @param id Layer id.
	 */
	sizeOf( id: string ): CanvasSize {
		const texture = this.textures.get( id );

		return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
	}

	/**
	 * Whether a layer's texture can be rendered into.
	 *
	 * @param id Layer id.
	 */
	isTarget( id: string ): boolean {
		const texture = this.textures.get( id );

		return !! texture && this.gpu.isTarget( texture );
	}

	/**
	 * Creates a raster layer's backing texture from an image.
	 *
	 * @param id     Layer id.
	 * @param source Decoded pixels.
	 */
	addRaster( id: string, source: HTMLCanvasElement | HTMLImageElement ): void {
		this.textures.get( id )?.destroy( true );
		this.textures.set( id, this.gpu.textureFrom( source ) );
	}

	/**
	 * Creates an empty paintable texture for a layer, canvas-sized.
	 *
	 * @param id     Layer id.
	 * @param canvas Current canvas size.
	 */
	ensurePaintable( id: string, canvas: CanvasSize ): GpuTarget {
		const existing = this.textures.get( id );

		if ( existing && this.gpu.isTarget( existing ) ) {
			return existing as GpuTarget;
		}

		const target = this.gpu.createTarget(
			Math.max( 1, canvas.width ),
			Math.max( 1, canvas.height )
		);

		// A pasted layer arrives as a plain texture, which cannot be rendered into.
		// Painting on one therefore has to promote it first: copy what is there into
		// a render target and swap. Without this a brush stroke on a pasted layer
		// silently does nothing.
		if ( existing ) {
			const sprite = this.gpu.sprite( existing );

			sprite.anchor.set( 0.5 );
			sprite.position.set( canvas.width / 2, canvas.height / 2 );

			this.gpu.draw( sprite, target, true );
			sprite.destroy();
			existing.destroy( true );
		}

		this.textures.set( id, target );

		return target;
	}

	/**
	 * Frees textures for layers that can no longer come back.
	 *
	 * Reachability is the caller's to decide, and it is not "in the current document".
	 * A layer that has merely been *undone* still exists as far as the user is
	 * concerned -- one press of redo brings it back -- but its pixels live only in a
	 * texture, so freeing them on undo made redo restore an empty frame.
	 *
	 * @param live      Layer ids in the current document.
	 * @param reachable Layer ids still referenced anywhere the user can return to.
	 */
	retain( live: Set< string >, reachable: Set< string > ): void {
		for ( const [ id, texture ] of this.textures ) {
			if ( live.has( id ) || reachable.has( id ) || BASE_LAYER_ID === id ) {
				continue;
			}

			texture.destroy( true );
			this.textures.delete( id );
		}
	}

	/**
	 * Sets the mask confining every paint operation.
	 *
	 * @param mask Canvas-sized alpha mask, or null for no confinement.
	 */
	setMask( mask: HTMLCanvasElement | null ): void {
		this.mask?.destroy( true );
		this.mask = mask ? this.gpu.textureFrom( mask ) : null;
	}

	/**
	 * Wraps a sprite in the current selection mask, if there is one.
	 *
	 * Both the sprite and its mask have to be in the same rendered container, which
	 * is why this returns a holder rather than just setting a property.
	 *
	 * @param sprite What to clip.
	 * @return The container to render, and its teardown.
	 */
	clip( sprite: GpuSprite ): ClippedSprite {
		const holder = this.gpu.container();

		holder.addChild( sprite );

		if ( ! this.mask ) {
			return {
				container: holder,
				release: () => holder.destroy( { children: true } ),
			};
		}

		const mask = this.gpu.sprite( this.mask );

		mask.position.set( 0, 0 );
		holder.addChild( mask );
		sprite.mask = mask;

		return {
			container: holder,
			release: () => {
				sprite.mask = null;
				holder.destroy( { children: true } );
			},
		};
	}

	/**
	 * Frees every layer texture except the source.
	 *
	 * The base layer's texture *is* the loaded source, which its owner destroys
	 * separately -- releasing it twice is how a double-free surfaces as a blank canvas.
	 */
	releaseAll(): void {
		for ( const [ id, texture ] of this.textures ) {
			if ( BASE_LAYER_ID !== id ) {
				texture.destroy( true );
			}
		}

		this.textures.clear();
	}

	/** Frees the mask. */
	releaseMask(): void {
		this.mask?.destroy( true );
		this.mask = null;
	}
}
