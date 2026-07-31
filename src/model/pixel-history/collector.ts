/**
 * Collecting the tiles a stroke overwrites, as it happens.
 *
 * Not a snapshot at either end: the region a stroke will cover is unknown when it
 * starts, and by the time it finishes the old pixels are gone.
 */

import { tileKey, tilesCovering } from './tiles';
import { MAX_TILES } from './types';
import type { PixelPatch, PixelRect, TilePatch } from './types';

/**
 * Collects tiles for an action, refusing to grow past the cap.
 *
 * Used while a stroke is in progress: each dab offers the tiles it is about to touch,
 * and only the ones not already held get captured.
 */
export class TileCollector {
	private tiles = new Map< string, TilePatch >();

	private overflowed = false;

	private width: number;

	private height: number;

	/**
	 * @param width  Canvas width.
	 * @param height Canvas height.
	 */
	constructor( width: number, height: number ) {
		this.width = width;
		this.height = height;
	}

	/**
	 * Captures whatever tiles a region touches and has not been captured yet.
	 *
	 * @param rect    Region about to change.
	 * @param capture Reads a tile's current pixels, or returns null when it is empty.
	 */
	add(
		rect: PixelRect,
		capture: ( tile: PixelRect ) => HTMLCanvasElement | null
	): void {
		if ( this.overflowed ) {
			return;
		}

		for ( const tile of tilesCovering( rect, this.width, this.height ) ) {
			const key = tileKey( tile );

			if ( this.tiles.has( key ) ) {
				continue;
			}

			if ( this.tiles.size >= MAX_TILES ) {
				// Past the cap the patch would cost more than it is worth, and a partial
				// one is worse than none: it would restore half a stroke.
				this.overflowed = true;
				this.tiles.clear();

				return;
			}

			this.tiles.set( key, { rect: tile, pixels: capture( tile ) } );
		}
	}

	/** Whether anything has been captured. */
	get size(): number {
		return this.tiles.size;
	}

	/**
	 * The finished patch.
	 *
	 * @param layerId Layer the tiles belong to.
	 */
	toPatch( layerId: string ): PixelPatch {
		return {
			layerId,
			tiles: [ ...this.tiles.values() ],
			complete: ! this.overflowed,
		};
	}
}
