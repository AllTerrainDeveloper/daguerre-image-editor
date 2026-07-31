/**
 * What a painted change records so it can be undone.
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
