/**
 * Rulers along the top and leading edges.
 *
 * Marked in *canvas* pixels, not screen pixels, so a reading means the same thing
 * whatever the zoom -- which is the only version worth having. The tick interval
 * adapts so labels never collide: as you zoom out the ruler steps up through
 * 1, 2, 5, 10, 20, 50, 100 and so on rather than crowding.
 *
 * Drawn on canvases rather than as DOM. A ruler across a wide viewport is hundreds
 * of ticks, and hundreds of elements repositioned on every pan would be visible as
 * lag.
 */

import type { CanvasSize } from '../../model/document';
import { paintRuler } from './paint';
import { RULER_SIZE } from './ticks';

export { RULER_SIZE } from './ticks';

export interface RulersOptions {
	/** Element the rulers are positioned within -- the stage. */
	stage: HTMLElement;
	/** Where the canvas sits inside the stage, in CSS pixels. */
	getViewport: () => { x: number; y: number; width: number; height: number } | null;
	/** Canvas size in its own pixels. */
	getCanvas: () => CanvasSize;
}

/**
 * Top and leading-edge rulers.
 */
export class Rulers {
	private options: RulersOptions;

	private root: HTMLElement;

	private horizontal: HTMLCanvasElement;

	private vertical: HTMLCanvasElement;

	/** Pointer position in canvas pixels, drawn as a tracking marker. */
	private marker: { x: number; y: number } | null = null;

	constructor( options: RulersOptions ) {
		this.options = options;

		this.root = document.createElement( 'div' );
		this.root.className = 'lz-rulers';
		this.root.setAttribute( 'aria-hidden', 'true' );

		this.horizontal = document.createElement( 'canvas' );
		this.horizontal.className = 'lz-ruler lz-ruler--h';

		this.vertical = document.createElement( 'canvas' );
		this.vertical.className = 'lz-ruler lz-ruler--v';

		const corner = document.createElement( 'div' );
		corner.className = 'lz-ruler__corner';

		this.root.append( corner, this.horizontal, this.vertical );
		options.stage.appendChild( this.root );

		options.stage.addEventListener( 'pointermove', this.onPointerMove );

		this.draw();
	}

	/** Tracks the pointer so the rulers show where it is. */
	private onPointerMove = ( event: PointerEvent ): void => {
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! viewport || viewport.width === 0 ) {
			return;
		}

		const rect = this.options.stage.getBoundingClientRect();

		this.marker = {
			x:
				( ( event.clientX - rect.left - viewport.x ) / viewport.width ) *
				canvas.width,
			y:
				( ( event.clientY - rect.top - viewport.y ) / viewport.height ) *
				canvas.height,
		};

		this.draw();
	};

	/** Redraws both rulers. */
	draw = (): void => {
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! viewport || canvas.width <= 0 ) {
			this.root.hidden = true;

			return;
		}

		this.root.hidden = false;

		const bounds = this.options.stage.getBoundingClientRect();
		const scale = viewport.width / canvas.width;

		paintRuler(
			this.horizontal,
			bounds.width - RULER_SIZE,
			RULER_SIZE,
			'h',
			viewport.x - RULER_SIZE,
			scale,
			this.marker
		);
		paintRuler(
			this.vertical,
			RULER_SIZE,
			bounds.height - RULER_SIZE,
			'v',
			viewport.y - RULER_SIZE,
			scale,
			this.marker
		);
	};

	/** Shows or hides the rulers. */
	setVisible( visible: boolean ): void {
		this.root.style.display = visible ? '' : 'none';
	}

	/** Removes the rulers. */
	destroy(): void {
		this.options.stage.removeEventListener( 'pointermove', this.onPointerMove );
		this.root.remove();
	}
}
