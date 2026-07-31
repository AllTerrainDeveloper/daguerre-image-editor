/**
 * The marquee.
 *
 * Owns both halves of a selection: the outline the user sees, and the mask that
 * actually confines painting. Keeping them together is the point -- rasterising the
 * mask on every change means no tool has to remember to rebuild it.
 */

import {
	buildSelectionMask,
	isEmptySelection,
	selectionToPath,
} from '../model/selection';
import type { Selection } from '../model/selection';
import type { CanvasSize } from '../model/document';
import type { Viewport } from '../ui/panels';

export interface SelectionOverlayOptions {
	/** The canvas area to draw over. */
	stage: HTMLElement;
	/** Where the canvas sits inside the stage. */
	getViewport: () => Viewport | null;
	/** Current canvas size, which the mask is rasterised at. */
	getCanvas: () => CanvasSize;
	/** Hands the rasterised mask to the renderer. */
	setMask: ( mask: HTMLCanvasElement | null ) => void;
	/** Called after any change, so the options bar can re-render. */
	onChange: () => void;
}

/** The whole canvas, as a selection. */
export const SELECT_ALL: Selection = {
	shape: 'rect',
	points: [
		{ x: 0, y: 0 },
		{ x: 1, y: 1 },
	],
};

/**
 * The selection outline and its mask.
 */
export class SelectionOverlay {
	/** The current marquee, or null when nothing is selected. */
	private selection: Selection | null = null;

	private svg: SVGSVGElement;

	private options: SelectionOverlayOptions;

	/**
	 * @param options Overlay configuration.
	 */
	constructor( options: SelectionOverlayOptions ) {
		this.options = options;

		// SVG rather than a positioned box: a lasso is not a rectangle, and once the
		// outline has to be a path anyway, one element draws every shape.
		this.svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
		this.svg.setAttribute( 'class', 'lz-selection' );
		this.svg.setAttribute( 'aria-hidden', 'true' );

		// Two paths, opposite colours, one dashed and animated: marching ants that
		// stay visible over both light and dark pixels.
		for ( const cls of [ 'lz-selection__under', 'lz-selection__over' ] ) {
			const path = document.createElementNS( 'http://www.w3.org/2000/svg', 'path' );
			path.setAttribute( 'class', cls );
			this.svg.appendChild( path );
		}

		options.stage.appendChild( this.svg );
		this.sync();
	}

	/** The current marquee, or null. */
	get current(): Selection | null {
		return this.selection;
	}

	/** Whether anything is selected. */
	get isActive(): boolean {
		return null !== this.selection;
	}

	/**
	 * Replaces the marquee and rebuilds the mask.
	 *
	 * @param selection Selection, or null to clear it.
	 */
	set( selection: Selection | null ): void {
		this.selection = isEmptySelection( selection ) ? null : selection;

		const canvas = this.options.getCanvas();

		this.options.setMask(
			buildSelectionMask( this.selection, canvas.width, canvas.height )
		);

		this.sync();
		this.options.onChange();
	}

	/** Selects the whole canvas. */
	selectAll(): void {
		this.set( { ...SELECT_ALL } );
	}

	/**
	 * Draws the marquee outline over the canvas.
	 *
	 * Hidden with `style.display`, not the `hidden` property. `hidden` is an
	 * HTMLElement IDL attribute and this is an SVG element -- assigning it sets a
	 * property that reflects to nothing, so the CSS never matches and the outline
	 * stays on screen. That is what made a deselect appear to do nothing.
	 *
	 * The path is also emptied rather than merely hidden, so a stale outline cannot
	 * reappear the moment something else makes the element visible again.
	 */
	readonly sync = (): void => {
		const viewport = this.options.getViewport();

		if ( ! this.selection || ! viewport ) {
			this.svg.style.display = 'none';
			this.paint( '' );

			return;
		}

		this.svg.style.display = '';
		this.svg.style.insetInlineStart = `${ viewport.x }px`;
		this.svg.style.insetBlockStart = `${ viewport.y }px`;
		this.svg.setAttribute( 'width', String( viewport.width ) );
		this.svg.setAttribute( 'height', String( viewport.height ) );

		this.paint( selectionToPath( this.selection, viewport.width, viewport.height ) );
	};

	/**
	 * Writes one path into both outline strokes.
	 *
	 * @param d Path data.
	 */
	private paint( d: string ): void {
		for ( const node of this.svg.querySelectorAll( 'path' ) ) {
			node.setAttribute( 'd', d );
		}
	}

	/** Takes the outline off the stage. */
	destroy(): void {
		this.svg.remove();
	}
}
