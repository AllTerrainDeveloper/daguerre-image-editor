/**
 * Undo for painted pixels.
 *
 * A recipe change can be undone by restoring the previous recipe. A brush stroke
 * cannot: the pixels it covered are gone. So the tiles under a stroke are copied out
 * as it happens -- not snapshotted at either end, because the region a stroke will
 * cover is unknown when it starts and the old pixels are gone by the time it finishes.
 */

import { TileCollector } from '../model/pixel-history';
import type { PixelPatch, PixelRect, TilePatch } from '../model/pixel-history';
import type { RecipeStore } from './recipe-store';

/** What the recorder needs from the renderer. */
export interface PixelAccess {
	extractLayerRegion: (
		layerId: string,
		rect: PixelRect
	) => HTMLCanvasElement | null;
	restoreLayerRegion: (
		layerId: string,
		rect: PixelRect,
		pixels: HTMLCanvasElement | null
	) => void;
}

/**
 * Collects the pixels a stroke overwrites, and puts them back on undo.
 */
export class StrokeRecorder {
	private store: RecipeStore;

	private pixels: PixelAccess;

	/** Tiles the stroke in progress has overwritten. */
	private tiles: TileCollector | null = null;

	/** The layer the stroke in progress is painting into. */
	private layerId = '';

	/**
	 * @param store  Document store, which the finished stroke is filed against.
	 * @param pixels Renderer access for reading and writing layer regions.
	 */
	constructor( store: RecipeStore, pixels: PixelAccess ) {
		this.store = store;
		this.pixels = pixels;
	}

	/**
	 * Remembers a region's pixels before a paint operation overwrites them.
	 *
	 * @param layerId Layer about to change.
	 * @param rect    Region about to change, in canvas pixels.
	 */
	capture( layerId: string, rect: PixelRect ): void {
		const canvas = this.store.current.canvas;

		if ( ! this.tiles || this.layerId !== layerId ) {
			this.tiles = new TileCollector( canvas.width, canvas.height );
			this.layerId = layerId;
		}

		this.tiles.add( rect, ( tile ) =>
			this.pixels.extractLayerRegion( layerId, tile )
		);
	}

	/**
	 * Closes the stroke in progress and files it as one undo step.
	 *
	 * Exactly one entry per stroke. Pushing a copy of the current recipe on its own
	 * would produce an entry identical to the one below it -- so the first undo would
	 * restore a state indistinguishable from the one already showing, and it would
	 * take two presses before anything happened.
	 *
	 * @return True when a stroke was filed.
	 */
	commit(): boolean {
		const collector = this.tiles;
		const layerId = this.layerId;

		this.tiles = null;
		this.layerId = '';

		if ( ! collector || 0 === collector.size ) {
			return false;
		}

		this.store.pushStroke( collector.toPatch( layerId ) );

		return true;
	}

	/**
	 * Swaps the pixels the current entry carries for the ones currently there.
	 *
	 * The entry's patch holds the tiles as they were before the stroke; putting them
	 * back means the tiles as they are *now* become the way forward, so the two are
	 * exchanged in place. That is what makes redo work without storing both directions
	 * of every stroke -- the cost is paid only when someone actually undoes something.
	 */
	restore(): void {
		const patch: PixelPatch | undefined = this.store.meta;

		if ( ! patch || ! patch.complete ) {
			return;
		}

		const swapped: TilePatch[] = [];

		for ( const tile of patch.tiles ) {
			swapped.push( {
				rect: tile.rect,
				pixels: this.pixels.extractLayerRegion( patch.layerId, tile.rect ),
			} );

			this.pixels.restoreLayerRegion( patch.layerId, tile.rect, tile.pixels );
		}

		this.store.setMeta( { ...patch, tiles: swapped } );
	}
}
