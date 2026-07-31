/**
 * The dashed outline shown while dragging out a gradient or a shape.
 *
 * Screen-space SVG rather than a real render: committing a canvas-sized bitmap on
 * every pointer move would allocate and upload megabytes per frame on a large
 * document, to show something an outline conveys perfectly.
 */

import { rectFromDrag, squareDrag } from '../../engine/paint-shapes';
import type { ShapeKind } from '../../engine/paint-shapes';
import type { Point } from '../../model/selection';
import type { ActiveTool } from '../panels';
import { toStage } from './coords';

/** What the outline should look like for the tool in hand. */
export interface PreviewShape {
	tool: ActiveTool;
	/** Which shape the shape tool is set to. */
	shapeKind: ShapeKind;
	/** Whether the drag is being constrained to a square. */
	square: boolean;
}

/**
 * A throwaway outline that follows a drag.
 */
export class DragPreview {
	private stage: HTMLElement;

	private svg: SVGSVGElement | null = null;

	private path: SVGPathElement | null = null;

	/** Where the current drag started, in client pixels. */
	private origin: Point | null = null;

	/**
	 * @param stage The canvas area to draw over.
	 */
	constructor( stage: HTMLElement ) {
		this.stage = stage;
	}

	/**
	 * Begins an outline at a pointer position.
	 *
	 * @param event Pointer event the drag began with.
	 * @param shape What the outline should look like.
	 */
	start( event: PointerEvent, shape: PreviewShape ): void {
		if ( ! this.svg ) {
			const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );

			svg.setAttribute( 'class', 'lz-drag-preview' );
			svg.setAttribute( 'aria-hidden', 'true' );

			this.path = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'path'
			);
			svg.appendChild( this.path );
			this.stage.appendChild( svg );
			this.svg = svg;
		}

		this.origin = { x: event.clientX, y: event.clientY };
		this.svg.style.display = '';
		this.update( event, shape );
	}

	/**
	 * Redraws the outline.
	 *
	 * @param event Current pointer position.
	 * @param shape What the outline should look like.
	 */
	update( event: PointerEvent, shape: PreviewShape ): void {
		if ( ! this.path || ! this.origin ) {
			return;
		}

		const rect = this.stage.getBoundingClientRect();
		const from = {
			x: this.origin.x - rect.left,
			y: this.origin.y - rect.top,
		};

		let to = toStage( this.stage, event );

		if ( shape.square && 'shape' === shape.tool ) {
			to = squareDrag( from, to );
		}

		this.path.setAttribute( 'd', outlineFor( from, to, shape ) );
	}

	/** Hides the outline. */
	hide(): void {
		if ( this.svg ) {
			this.svg.style.display = 'none';
			this.path?.setAttribute( 'd', '' );
		}

		this.origin = null;
	}

	/** Takes the outline off the stage. */
	destroy(): void {
		this.svg?.remove();
		this.svg = null;
		this.path = null;
		this.origin = null;
	}
}

/**
 * The path data for one outline.
 *
 * @param from  Where the drag began, in stage pixels.
 * @param to    Where the pointer is now, in stage pixels.
 * @param shape What is being dragged out.
 */
function outlineFor( from: Point, to: Point, shape: PreviewShape ): string {
	// A gradient is a direction, and a line has no interior -- both read as a line.
	if ( 'gradient' === shape.tool || 'line' === shape.shapeKind ) {
		return `M ${ from.x } ${ from.y } L ${ to.x } ${ to.y }`;
	}

	const box = rectFromDrag( from, to );

	if ( 'ellipse' === shape.shapeKind ) {
		const rx = box.width / 2;
		const ry = box.height / 2;

		return (
			`M ${ box.x } ${ box.y + ry } a ${ rx } ${ ry } 0 1 0 ${ box.width } 0 ` +
			`a ${ rx } ${ ry } 0 1 0 ${ -box.width } 0 Z`
		);
	}

	return `M ${ box.x } ${ box.y } h ${ box.width } v ${ box.height } h ${ -box.width } Z`;
}
