/**
 * How the canvas is presented, not what it contains.
 *
 * Deliberately outside the recipe. Where someone happens to have scrolled is not part
 * of their edit, and saving it would mean two people opening the same image disagreed
 * about what the file looks like.
 */

/** Where the image sits inside the stage, in CSS pixels. */
export interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Closest and furthest the view will go. */
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

/** Margin left around a fitted image, in CSS pixels. */
const INSET = 48;

/** Extra margin when the rulers are showing, so fitting never tucks under them. */
export const RULER_GUTTER = 20;

/**
 * The view: zoom, pan, and the arithmetic that turns them into a placement.
 */
export class Camera {
	private zoomLevel = 1;

	private panX = 0;

	private panY = 0;

	private listeners = new Set< () => void >();

	/** Current zoom, where 1 means fitted to the stage. */
	get zoom(): number {
		return this.zoomLevel;
	}

	/** Current pan offset, in CSS pixels. */
	get pan(): { x: number; y: number } {
		return { x: this.panX, y: this.panY };
	}

	/**
	 * Scale that fits an image inside the stage, never magnifying past 1:1.
	 *
	 * Upscaling a small image to fill the viewport would show interpolation artefacts
	 * and mislead the user about the detail they actually have.
	 *
	 * @param stage   Stage size in CSS pixels.
	 * @param texture Image size in pixels.
	 * @param gutter  Extra inset for the rulers.
	 */
	fitScale(
		stage: { width: number; height: number },
		texture: { width: number; height: number },
		gutter: number
	): number {
		const available = {
			width: Math.max( 1, stage.width - INSET - gutter ),
			height: Math.max( 1, stage.height - INSET - gutter ),
		};

		return Math.min(
			available.width / texture.width,
			available.height / texture.height,
			1
		);
	}

	/**
	 * Where the sprite's centre goes, in stage CSS pixels.
	 *
	 * @param stage  Stage size.
	 * @param gutter Extra inset for the rulers.
	 */
	centre( stage: { width: number; height: number }, gutter: number ): {
		x: number;
		y: number;
	} {
		return {
			x: ( stage.width + gutter ) / 2 + this.panX,
			y: ( stage.height + gutter ) / 2 + this.panY,
		};
	}

	/**
	 * The rectangle the image occupies.
	 *
	 * The crop overlay needs this to draw over the image rather than over the
	 * letterboxing around it.
	 *
	 * @param stage   Stage size.
	 * @param texture Image size in pixels.
	 * @param scale   On-screen scale currently applied to the sprite.
	 * @param gutter  Extra inset for the rulers.
	 */
	viewport(
		stage: { width: number; height: number },
		texture: { width: number; height: number },
		scale: number,
		gutter: number
	): Viewport {
		const width = texture.width * scale;
		const height = texture.height * scale;

		return {
			x: ( stage.width - width + gutter ) / 2 + this.panX,
			y: ( stage.height - height + gutter ) / 2 + this.panY,
			width,
			height,
		};
	}

	/**
	 * Scrolls the pasteboard.
	 *
	 * @param dx Horizontal movement in CSS pixels.
	 * @param dy Vertical movement in CSS pixels.
	 */
	scrollBy( dx: number, dy: number ): void {
		this.panX += dx;
		this.panY += dy;
	}

	/**
	 * Zooms about a point, keeping whatever is under it in place.
	 *
	 * Anchoring to the pointer rather than to the centre is what makes wheel-zoom feel
	 * like a map instead of a slideshow: the detail you were looking at is still under
	 * the cursor afterwards.
	 *
	 * @param factor  Multiplier on the current zoom.
	 * @param originX Anchor point, in stage CSS pixels.
	 * @param originY Anchor point, in stage CSS pixels.
	 * @param stage   Stage size.
	 * @return True when the zoom actually moved.
	 */
	zoomAt(
		factor: number,
		originX: number,
		originY: number,
		stage: { width: number; height: number }
	): boolean {
		const previous = this.zoomLevel;
		const next = clampZoom( previous * factor );

		if ( next === previous ) {
			return false;
		}

		const centreX = stage.width / 2 + this.panX;
		const centreY = stage.height / 2 + this.panY;
		const ratio = next / previous;

		// Move the centre so the anchor point maps to itself at the new zoom.
		this.panX += ( centreX - originX ) * ( ratio - 1 );
		this.panY += ( centreY - originY ) * ( ratio - 1 );
		this.zoomLevel = next;

		return true;
	}

	/**
	 * Zooms so one canvas pixel covers one CSS pixel, and recentres.
	 *
	 * `zoom` is relative to the fitted size, not absolute, so getting to 100% means
	 * cancelling out whatever the fit came to.
	 *
	 * @param spriteScale The scale currently applied on screen.
	 */
	zoomToActual( spriteScale: number ): void {
		const fitted = spriteScale / Math.max( this.zoomLevel, 1e-6 );

		this.zoomLevel = clampZoom( 1 / Math.max( fitted, 1e-6 ) );
		this.panX = 0;
		this.panY = 0;
	}

	/** Returns the view to a centred, fitted position. */
	reset(): void {
		this.zoomLevel = 1;
		this.panX = 0;
		this.panY = 0;
	}

	/**
	 * Subscribes to view changes, so overlays can follow a resize.
	 *
	 * @param listener Called after each re-fit.
	 * @return Unsubscribe function.
	 */
	onChange( listener: () => void ): () => void {
		this.listeners.add( listener );

		return () => {
			this.listeners.delete( listener );
		};
	}

	/** Tells every listener the view moved. */
	emit(): void {
		for ( const listener of this.listeners ) {
			listener();
		}
	}

	/** Drops every listener. */
	clear(): void {
		this.listeners.clear();
	}
}

/**
 * Holds a zoom level inside the supported range.
 *
 * @param value Requested zoom.
 */
function clampZoom( value: number ): number {
	return Math.min( MAX_ZOOM, Math.max( MIN_ZOOM, value ) );
}
