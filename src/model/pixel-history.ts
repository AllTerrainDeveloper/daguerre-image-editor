/**
 * Undo for painted pixels.
 *
 * The recipe history stores whole snapshots because a recipe is a few hundred bytes.
 * Pixels are not: a 5504x3072 layer is 67MB, so snapshotting one per brush stroke is
 * not an option, and "undo does not reach painted pixels" was the honest limitation
 * until now.
 *
 * The way out is the one every raster editor uses: remember the *tiles* a stroke
 * touched, and only the version of them that existed beforehand. A stroke across a
 * photo touches a handful of 256-pixel tiles, so an undo entry costs a few hundred
 * kilobytes rather than the whole document, and the cost is proportional to what was
 * painted rather than to what it was painted on.
 *
 * The geometry is pure and lives here; the actual reading and writing of pixels
 * belongs to the renderer, because only it knows about textures.
 */

/** Tile edge in pixels. Small enough to be cheap, large enough not to be chatty. */
export const TILE_SIZE = 256;

/**
 * Most tiles one action may capture.
 *
 * A flood fill can legitimately touch the whole document, and capturing a hundred
 * megabytes to make one click undoable is a worse outcome than the click not being
 * undoable. Past this, the action records no patch and says so.
 */
export const MAX_TILES = 96;

/** A rectangle in canvas pixels. */
export interface PixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** One tile's contents before an action touched it. */
export interface TilePatch {
	rect: PixelRect;
	/** The pixels that were there, or null when the tile was empty. */
	pixels: HTMLCanvasElement | null;
}

/** Everything needed to put one layer back the way it was. */
export interface PixelPatch {
	layerId: string;
	tiles: TilePatch[];
	/**
	 * Whether the patch covers everything the action changed.
	 *
	 * False when the action was too large to capture, in which case undo must leave
	 * the pixels alone rather than restoring part of them and claiming success.
	 */
	complete: boolean;
}

/**
 * The tiles a rectangle overlaps, clipped to the canvas.
 *
 * @param rect   Region touched, in canvas pixels.
 * @param width  Canvas width.
 * @param height Canvas height.
 * @return Tile rectangles, aligned to the tile grid.
 */
export function tilesCovering(
	rect: PixelRect,
	width: number,
	height: number
): PixelRect[] {
	if ( width < 1 || height < 1 || rect.width <= 0 || rect.height <= 0 ) {
		return [];
	}

	const left = Math.max( 0, Math.floor( rect.x / TILE_SIZE ) );
	const top = Math.max( 0, Math.floor( rect.y / TILE_SIZE ) );
	const right = Math.min(
		Math.ceil( width / TILE_SIZE ),
		Math.ceil( ( rect.x + rect.width ) / TILE_SIZE )
	);
	const bottom = Math.min(
		Math.ceil( height / TILE_SIZE ),
		Math.ceil( ( rect.y + rect.height ) / TILE_SIZE )
	);

	const tiles: PixelRect[] = [];

	for ( let ty = top; ty < bottom; ty++ ) {
		for ( let tx = left; tx < right; tx++ ) {
			tiles.push( {
				x: tx * TILE_SIZE,
				y: ty * TILE_SIZE,
				// Clipped, so the last row and column do not run past the canvas.
				width: Math.min( TILE_SIZE, width - tx * TILE_SIZE ),
				height: Math.min( TILE_SIZE, height - ty * TILE_SIZE ),
			} );
		}
	}

	return tiles;
}

/**
 * A stable key for a tile, so the same tile is only captured once per stroke.
 *
 * @param rect Tile rectangle.
 */
export function tileKey( rect: PixelRect ): string {
	return `${ Math.floor( rect.x / TILE_SIZE ) },${ Math.floor(
		rect.y / TILE_SIZE
	) }`;
}

/**
 * The rectangle a brush dab covers.
 *
 * @param x    Dab centre.
 * @param y    Dab centre.
 * @param size Dab diameter.
 */
export function dabRegion( x: number, y: number, size: number ): PixelRect {
	// A dab's alpha can reach a pixel beyond its nominal edge once it is scaled and
	// anti-aliased, so the region is rounded outwards rather than truncated.
	const radius = Math.max( 1, size / 2 ) + 1;

	return {
		x: Math.floor( x - radius ),
		y: Math.floor( y - radius ),
		width: Math.ceil( radius * 2 ),
		height: Math.ceil( radius * 2 ),
	};
}

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
