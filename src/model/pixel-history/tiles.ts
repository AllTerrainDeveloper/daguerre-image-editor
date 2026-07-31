/**
 * Dividing a painted region into fixed tiles.
 *
 * Fixed tiles rather than exact rectangles, so two overlapping dabs record the same
 * tile once. Without that, a stroke would keep a copy of its own overlaps and the undo
 * entry would grow with the stroke's length rather than with its area.
 */

import { TILE_SIZE } from './types';
import type { PixelRect } from './types';

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
