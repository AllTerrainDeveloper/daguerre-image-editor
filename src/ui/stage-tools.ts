/**
 * Pointer handling for every tool that acts on the canvas.
 *
 * One controller, because they all share one surface and one coordinate conversion.
 * Screen pixels reach the canvas through a single `toCanvas()`, so a brush stroke, a
 * selection rectangle and a gradient ramp cannot disagree about where the pointer is.
 *
 * The tools fall into four families, and each family is one method here:
 *
 * - **Stroking** -- brush, eraser, and the retouching tools. A stroke is interpolated
 *   into evenly spaced dabs, so speed does not change the result.
 * - **Dragging a region** -- select, gradient, shape. A dashed preview follows the
 *   drag, and the pixels are only committed on release; drawing a full-canvas bitmap
 *   on every pointer move would stall on a large document for no visible benefit.
 * - **Clicking a point** -- fill, wand, eyedropper, text, zoom.
 * - **Panning** -- hand, which moves the view rather than the pixels.
 *
 * Like the transform handles, drags are tracked on `window`: a release outside the
 * stage must still end the gesture.
 */

import {
	STAMP_SPACING,
	brushStamp,
	floodFillMask,
	interpolateStroke,
} from '../engine/brush';
import {
	gradientCanvas,
	rectFromDrag,
	rgbToHex,
	shapeCanvas,
	squareDrag,
} from '../engine/paint-shapes';
import { applyPixelDab } from '../engine/pixel-tools';
import type { Carry, PixelBuffer, PixelOp } from '../engine/pixel-tools';
import { appendPathPoint, selectionFromDrag, traceMask } from '../model/selection';
import type { Point } from '../model/selection';
import type { ActiveTool } from './panels';
import {
	PIXEL_OPS,
	PIXEL_TOOLS,
	RETOUCH_SPACING,
} from './stage-tools/types';
import type { StageToolsOptions } from './stage-tools/types';

/**
 * Routes pointer events on the stage to whichever tool is active.
 */
export class StageTools {
	private options: StageToolsOptions;

	private drawing = false;

	private last: { x: number; y: number } | null = null;

	private dragStart: Point | null = null;

	/** Where a region drag began, in canvas pixels. */
	private dragFrom: { x: number; y: number } | null = null;

	/** Freeform path being drawn, or polygon vertices placed so far. */
	private path: Point[] = [];

	/** Working pixels for a retouching stroke, and where they came from. */
	private work: PixelBuffer | null = null;

	private carry: Carry | null = null;

	/** The image before anything was painted, for the history brush. */
	private pristine: PixelBuffer | null = null;

	/** Where the clone stamp samples from, in canvas pixels. */
	private cloneSource: { x: number; y: number } | null = null;

	/** Offset from the stroke to the clone source, fixed at the first dab. */
	private cloneOffset: { x: number; y: number } | null = null;

	/** Dashed outline shown while dragging out a region. */
	private preview: SVGSVGElement | null = null;

	private previewPath: SVGPathElement | null = null;

	constructor( options: StageToolsOptions ) {
		this.options = options;
		options.stage.addEventListener( 'pointerdown', this.onPointerDown );
	}

	/**
	 * Converts a pointer position into canvas pixels.
	 *
	 * @param event Pointer event.
	 * @return Canvas coordinates, or null when nothing is loaded.
	 */
	private toCanvas( event: PointerEvent ): { x: number; y: number } | null {
		const viewport = this.options.getViewport();
		const canvas = this.options.getCanvas();

		if ( ! viewport || viewport.width === 0 || canvas.width === 0 ) {
			return null;
		}

		const stageRect = this.options.stage.getBoundingClientRect();
		const x = event.clientX - stageRect.left - viewport.x;
		const y = event.clientY - stageRect.top - viewport.y;

		return {
			x: ( x / viewport.width ) * canvas.width,
			y: ( y / viewport.height ) * canvas.height,
		};
	}

	/** Begins whatever the active tool does. */
	private onPointerDown = ( event: PointerEvent ): void => {
		const tool = this.options.getTool();

		if ( tool === 'transform' || tool === 'crop' ) {
			return;
		}

		if ( tool === 'hand' ) {
			event.preventDefault();
			this.last = { x: event.clientX, y: event.clientY };
			this.listen();

			return;
		}

		const point = this.toCanvas( event );

		if ( ! point ) {
			return;
		}

		event.preventDefault();

		switch ( tool ) {
			case 'zoom':
				// Alt inverts, as it does in every editor that has this tool.
				this.zoom( event );

				return;

			case 'eyedropper':
				this.pick( point );
				this.last = point;
				this.listen();

				return;

			case 'fill':
				this.fill( point );

				return;

			case 'wand':
				this.wand( point );

				return;

			case 'text':
				this.options.onPlaceText( point );

				return;

			case 'path':
				// Vertices are placed deliberately, one click at a time, and the shape
				// is only drawn once the path is closed -- so no thinning, and no drag
				// lifecycle at all.
				this.path = appendPathPoint( this.path, this.normalise( point ), 0 );
				this.options.setSelection( { shape: 'polygon', points: this.path } );

				return;

			case 'select':
				this.beginSelect( point );
				this.listen();

				return;

			case 'gradient':
			case 'shape':
				this.dragFrom = point;
				this.showPreview( event, event );
				this.listen();

				return;

			case 'clone':
				if ( event.altKey ) {
					// Alt-click sets the sample point, exactly as the clone stamp has
					// worked since Photoshop 3. Without it the tool has nothing to copy.
					this.cloneSource = point;
					this.cloneOffset = null;
					this.options.onToolStateChange?.();

					return;
				}

				if ( ! this.cloneSource ) {
					return;
				}

				this.cloneOffset = {
					x: point.x - this.cloneSource.x,
					y: point.y - this.cloneSource.y,
				};
				break;
		}

		this.drawing = true;
		this.last = point;
		this.beginPixelStroke( tool );
		this.strokeDab( point, tool );
		this.listen();
	};

	/** Starts tracking a drag on the window, so a release anywhere ends it. */
	private listen(): void {
		window.addEventListener( 'pointermove', this.onPointerMove );
		window.addEventListener( 'pointerup', this.onPointerUp );
		window.addEventListener( 'pointercancel', this.onPointerUp );
		window.addEventListener( 'blur', this.onPointerUp );
	}

	/** Continues a stroke, a selection drag, a region drag or a pan. */
	private onPointerMove = ( event: PointerEvent ): void => {
		const tool = this.options.getTool();

		if ( tool === 'hand' ) {
			if ( this.last ) {
				this.options.pan(
					event.clientX - this.last.x,
					event.clientY - this.last.y
				);
				this.last = { x: event.clientX, y: event.clientY };
			}

			return;
		}

		const point = this.toCanvas( event );

		if ( ! point ) {
			return;
		}

		if ( tool === 'eyedropper' ) {
			// Dragging keeps sampling, which is how you find the exact shade you meant.
			this.pick( point );

			return;
		}

		if ( this.dragFrom ) {
			this.updatePreview( event );

			return;
		}

		if ( this.dragStart ) {
			this.continueSelect( point );

			return;
		}

		if ( ! this.drawing || ! this.last ) {
			return;
		}

		const brush = this.options.getBrush();
		const spacing = PIXEL_TOOLS.includes( tool ) ? RETOUCH_SPACING : STAMP_SPACING;

		// Fill the gap between pointer samples, or a fast stroke lays down dots.
		for ( const step of interpolateStroke( this.last, point, brush.size * spacing ) ) {
			this.strokeDab( step, tool );
		}

		this.last = point;
	};

	/** Ends the gesture, committing anything that was only previewed. */
	private onPointerUp = ( event?: Event ): void => {
		window.removeEventListener( 'pointermove', this.onPointerMove );
		window.removeEventListener( 'pointerup', this.onPointerUp );
		window.removeEventListener( 'pointercancel', this.onPointerUp );
		window.removeEventListener( 'blur', this.onPointerUp );

		const wasDrawing = this.drawing;
		const dragFrom = this.dragFrom;

		this.drawing = false;
		this.last = null;
		this.dragStart = null;
		this.dragFrom = null;
		this.work = null;
		this.carry = null;
		this.pristine = null;
		this.hidePreview();

		if ( dragFrom && event instanceof PointerEvent ) {
			this.commitRegion( dragFrom, event );
		}

		if ( wasDrawing ) {
			this.options.onStrokeEnd();
		}
	};

	// -- Selection ------------------------------------------------------------

	/**
	 * Starts a marquee.
	 *
	 * @param point Canvas coordinates.
	 */
	private beginSelect( point: { x: number; y: number } ): void {
		const shape = this.options.getSelectionShape();
		const norm = this.normalise( point );

		if ( shape === 'polygon' ) {
			// Polygons are placed click by click and closed deliberately, so they never
			// enter the drag lifecycle at all.
			this.path = appendPathPoint( this.path, norm, 0 );
			this.options.setSelection( { shape: 'polygon', points: this.path } );

			return;
		}

		this.dragStart = norm;
		this.path = [ norm ];
		this.options.setSelection( null );
	}

	/**
	 * Extends a marquee.
	 *
	 * @param point Canvas coordinates.
	 */
	private continueSelect( point: { x: number; y: number } ): void {
		const shape = this.options.getSelectionShape();
		const norm = this.normalise( point );

		if ( ! this.dragStart ) {
			return;
		}

		if ( shape === 'lasso' ) {
			this.path = appendPathPoint( this.path, norm );
			this.options.setSelection( { shape: 'lasso', points: this.path } );

			return;
		}

		this.options.setSelection(
			selectionFromDrag( shape as 'rect' | 'ellipse', this.dragStart, norm )
		);
	}

	/**
	 * Selects the contiguous region matching the colour under the pointer.
	 *
	 * The same flood fill the paint bucket uses, traced into a path -- which is the
	 * whole reason the wand was cheap to add.
	 *
	 * @param point Canvas coordinates.
	 */
	private wand( point: { x: number; y: number } ): void {
		const source = this.options.readDocument();

		if ( ! source ) {
			return;
		}

		const brush = this.options.getBrush();
		const mask = floodFillMask(
			source.pixels,
			source.width,
			source.height,
			point.x,
			point.y,
			brush.tolerance
		);

		if ( ! mask ) {
			return;
		}

		const ctx = mask.getContext( '2d' );
		const pixels = ctx?.getImageData( 0, 0, mask.width, mask.height );

		if ( ! pixels ) {
			return;
		}

		const points = traceMask( pixels );

		this.options.setSelection(
			points.length > 2 ? { shape: 'lasso', points } : null
		);
	}

	// -- Point tools ----------------------------------------------------------

	/**
	 * Samples the colour under the pointer into the foreground.
	 *
	 * @param point Canvas coordinates.
	 */
	private pick( point: { x: number; y: number } ): void {
		const source = this.options.readDocument();

		if ( ! source ) {
			return;
		}

		const x = Math.round( point.x );
		const y = Math.round( point.y );

		if ( x < 0 || y < 0 || x >= source.width || y >= source.height ) {
			return;
		}

		const index = ( y * source.width + x ) * 4;

		this.options.setBrush( {
			colour: rgbToHex(
				source.pixels[ index ],
				source.pixels[ index + 1 ],
				source.pixels[ index + 2 ]
			),
		} );
	}

	/**
	 * Zooms in, or out with Alt held.
	 *
	 * @param event Pointer event, positioned within the stage.
	 */
	private zoom( event: PointerEvent ): void {
		const rect = this.options.stage.getBoundingClientRect();

		this.options.zoomAt(
			event.altKey ? 1 / 1.4 : 1.4,
			event.clientX - rect.left,
			event.clientY - rect.top
		);
	}

	/**
	 * Floods the region matching the colour under the pointer.
	 *
	 * Matched against the *composed* document rather than the target layer, because
	 * that is what the user can see -- filling against an invisible layer's contents
	 * would look arbitrary.
	 *
	 * @param point Canvas coordinates.
	 */
	private fill( point: { x: number; y: number } ): void {
		const source = this.options.readDocument();

		if ( ! source ) {
			return;
		}

		const brush = this.options.getBrush();
		const mask = floodFillMask(
			source.pixels,
			source.width,
			source.height,
			point.x,
			point.y,
			brush.tolerance
		);

		if ( ! mask ) {
			return;
		}

		this.options.fillMask(
			this.options.getTargetLayerId(),
			mask,
			brush.colour,
			brush.opacity
		);

		this.options.onStrokeEnd();
	}

	// -- Region drags ---------------------------------------------------------

	/**
	 * Commits a gradient or a shape once the drag ends.
	 *
	 * @param from  Canvas coordinates the drag began at.
	 * @param event The releasing pointer event.
	 */
	private commitRegion(
		from: { x: number; y: number },
		event: PointerEvent
	): void {
		const to = this.toCanvas( event );
		const tool = this.options.getTool();
		const brush = this.options.getBrush();
		const canvas = this.options.getCanvas();

		if ( ! to ) {
			return;
		}

		const end = event.shiftKey && tool === 'shape' ? squareDrag( from, to ) : to;

		const bitmap =
			tool === 'gradient'
				? gradientCanvas(
						canvas.width,
						canvas.height,
						brush.gradient,
						from,
						end,
						brush.colour,
						brush.background,
						brush.gradientFade
				  )
				: shapeCanvas( canvas.width, canvas.height, from, end, {
						kind: brush.shapeKind,
						style: brush.shapeStyle,
						colour: brush.colour,
						strokeWidth: brush.strokeWidth,
				  } );

		if ( ! bitmap ) {
			return;
		}

		this.options.composite(
			this.options.getTargetLayerId(),
			bitmap,
			0,
			0,
			brush.opacity
		);
		this.options.onStrokeEnd();
	}

	/**
	 * Creates the dashed drag preview.
	 *
	 * Screen-space SVG rather than a real render: committing a canvas-sized bitmap on
	 * every pointer move would allocate and upload megabytes per frame on a large
	 * document, to show something an outline conveys perfectly.
	 *
	 * @param origin Where the drag began.
	 * @param event  Current pointer position.
	 */
	private showPreview( origin: PointerEvent, event: PointerEvent ): void {
		if ( ! this.preview ) {
			const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
			svg.setAttribute( 'class', 'lz-drag-preview' );
			svg.setAttribute( 'aria-hidden', 'true' );

			this.previewPath = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'path'
			);
			svg.appendChild( this.previewPath );
			this.options.stage.appendChild( svg );
			this.preview = svg;
		}

		this.previewOrigin = {
			x: origin.clientX,
			y: origin.clientY,
		};
		this.preview.style.display = '';
		this.updatePreview( event );
	}

	/** Where the current region drag started, in client pixels. */
	private previewOrigin: { x: number; y: number } | null = null;

	/**
	 * Redraws the drag preview.
	 *
	 * @param event Current pointer position.
	 */
	private updatePreview( event: PointerEvent ): void {
		if ( ! this.previewPath || ! this.previewOrigin ) {
			return;
		}

		const rect = this.options.stage.getBoundingClientRect();
		const from = {
			x: this.previewOrigin.x - rect.left,
			y: this.previewOrigin.y - rect.top,
		};
		let to = { x: event.clientX - rect.left, y: event.clientY - rect.top };

		const tool = this.options.getTool();
		const brush = this.options.getBrush();

		if ( event.shiftKey && tool === 'shape' ) {
			to = squareDrag( from, to );
		}

		if ( tool === 'gradient' || brush.shapeKind === 'line' ) {
			this.previewPath.setAttribute(
				'd',
				`M ${ from.x } ${ from.y } L ${ to.x } ${ to.y }`
			);

			return;
		}

		const box = rectFromDrag( from, to );

		if ( brush.shapeKind === 'ellipse' ) {
			const rx = box.width / 2;
			const ry = box.height / 2;

			this.previewPath.setAttribute(
				'd',
				`M ${ box.x } ${ box.y + ry } a ${ rx } ${ ry } 0 1 0 ${ box.width } 0 ` +
					`a ${ rx } ${ ry } 0 1 0 ${ -box.width } 0 Z`
			);

			return;
		}

		this.previewPath.setAttribute(
			'd',
			`M ${ box.x } ${ box.y } h ${ box.width } v ${ box.height } h ${ -box.width } Z`
		);
	}

	/** Hides the drag preview. */
	private hidePreview(): void {
		if ( this.preview ) {
			this.preview.style.display = 'none';
			this.previewPath?.setAttribute( 'd', '' );
		}

		this.previewOrigin = null;
	}

	// -- Strokes --------------------------------------------------------------

	/**
	 * Prepares a retouching stroke.
	 *
	 * The pixel operations read the composed document, because that is what the user
	 * sees -- the base image layer is not canvas-aligned, so reading it directly would
	 * blur the wrong pixels the moment the image had been moved. Reading once per
	 * stroke rather than once per dab is what keeps them usable on a big photo.
	 *
	 * @param tool Active tool.
	 */
	private beginPixelStroke( tool: ActiveTool ): void {
		if ( ! PIXEL_TOOLS.includes( tool ) ) {
			return;
		}

		const source = this.options.readDocument();

		this.carry = null;
		this.work = source
			? {
					data: new Uint8ClampedArray( source.pixels ),
					width: source.width,
					height: source.height,
			  }
			: null;

		// The history brush reads the image as it was before anything was painted, so
		// it needs a second buffer that the stroke never writes into.
		if ( tool === 'history' ) {
			const pristine = this.options.readPristine();

			this.pristine = pristine
				? {
						data: pristine.pixels,
						width: pristine.width,
						height: pristine.height,
				  }
				: null;
		} else {
			this.pristine = null;
		}
	}

	/**
	 * Places one dab, whichever kind the tool wants.
	 *
	 * @param point Canvas coordinates.
	 * @param tool  Active tool.
	 */
	private strokeDab( point: { x: number; y: number }, tool: ActiveTool ): void {
		if ( PIXEL_TOOLS.includes( tool ) ) {
			this.pixelDab( point, tool );

			return;
		}

		const brush = this.options.getBrush();

		// No bounds test here on purpose. Rejecting dabs whose *centre* falls outside
		// the selection lets half of every edge dab escape, because a brush is wider
		// than its centre. The renderer masks the stroke instead, clipping it pixel
		// by pixel.
		this.options.stamp(
			this.options.getTargetLayerId(),
			brushStamp( brush.shape, brush.size, brush.hardness ),
			point.x,
			point.y,
			brush.size,
			brush.colour,
			brush.opacity,
			tool === 'eraser'
		);
	}

	/**
	 * Applies one retouching dab and composites the changed pixels back.
	 *
	 * Only the dab's own dirty rectangle is uploaded, so the cost is proportional to
	 * the brush rather than to the document.
	 *
	 * @param point Canvas coordinates.
	 * @param tool  Active tool.
	 */
	private pixelDab( point: { x: number; y: number }, tool: ActiveTool ): void {
		const work = this.work;

		if ( ! work ) {
			return;
		}

		const brush = this.options.getBrush();
		const op: PixelOp =
			PIXEL_OPS[ tool ] ?? ( tool === 'tone' ? brush.tone : brush.retouch );

		if ( op === 'restore' && ! this.pristine ) {
			return;
		}

		const result = applyPixelDab( {
			op,
			target: work,
			source: op === 'restore' ? ( this.pristine as PixelBuffer ) : undefined,
			x: point.x,
			y: point.y,
			radius: brush.size,
			strength: brush.strength,
			hardness: brush.hardness,
			offsetX: this.cloneOffset?.x ?? 0,
			offsetY: this.cloneOffset?.y ?? 0,
			carry: this.carry,
		} );

		if ( ! result ) {
			return;
		}

		this.carry = result.carry ?? this.carry;

		const patch = document.createElement( 'canvas' );
		patch.width = result.rect.width;
		patch.height = result.rect.height;

		const ctx = patch.getContext( '2d' );

		if ( ! ctx ) {
			return;
		}

		const region = ctx.createImageData( result.rect.width, result.rect.height );

		for ( let row = 0; row < result.rect.height; row++ ) {
			const from = ( ( result.rect.y + row ) * work.width + result.rect.x ) * 4;

			region.data.set(
				work.data.subarray( from, from + result.rect.width * 4 ),
				row * result.rect.width * 4
			);
		}

		ctx.putImageData( region, 0, 0 );

		this.options.composite(
			this.options.getTargetLayerId(),
			patch,
			result.rect.x,
			result.rect.y,
			1
		);
	}

	/**
	 * Converts canvas pixels into normalised canvas coordinates.
	 *
	 * @param point Canvas pixels.
	 */
	private normalise( point: Point ): Point {
		const canvas = this.options.getCanvas();

		return { x: point.x / canvas.width, y: point.y / canvas.height };
	}

	/** Where the clone stamp is currently sampling from, if anywhere. */
	getCloneSource(): { x: number; y: number } | null {
		return this.cloneSource;
	}

	/** Forgets the clone sample point. */
	clearCloneSource(): void {
		this.cloneSource = null;
		this.cloneOffset = null;
		this.options.onToolStateChange?.();
	}

	/**
	 * Paints the placed path with the current colour and style.
	 *
	 * Called when the path is closed with Enter. Reuses the shape drawing, which is why
	 * a pen tool cost a dozen lines rather than a vector subsystem.
	 *
	 * @return Whether anything was drawn.
	 */
	commitPath(): boolean {
		const canvas = this.options.getCanvas();
		const brush = this.options.getBrush();

		if ( this.path.length < 3 ) {
			return false;
		}

		const surface = document.createElement( 'canvas' );
		surface.width = canvas.width;
		surface.height = canvas.height;

		const ctx = surface.getContext( '2d' );

		if ( ! ctx ) {
			return false;
		}

		ctx.beginPath();
		this.path.forEach( ( point, index ) => {
			const x = point.x * canvas.width;
			const y = point.y * canvas.height;

			if ( index === 0 ) {
				ctx.moveTo( x, y );
			} else {
				ctx.lineTo( x, y );
			}
		} );
		ctx.closePath();

		if ( brush.shapeStyle === 'fill' ) {
			ctx.fillStyle = brush.colour;
			ctx.fill();
		} else {
			ctx.strokeStyle = brush.colour;
			ctx.lineWidth = Math.max( 1, brush.strokeWidth );
			ctx.lineJoin = 'round';
			ctx.stroke();
		}

		this.options.composite(
			this.options.getTargetLayerId(),
			surface,
			0,
			0,
			brush.opacity
		);
		this.options.onStrokeEnd();
		this.clearPath();

		return true;
	}

	/** Abandons a half-placed polygon. */
	clearPath(): void {
		this.path = [];
		this.dragStart = null;
	}

	/** Removes the listeners. */
	destroy(): void {
		this.onPointerUp();
		this.preview?.remove();
		this.preview = null;
		this.previewPath = null;
		this.options.stage.removeEventListener( 'pointerdown', this.onPointerDown );
	}
}


export type { BrushSettings } from './stage-tools/brush-settings';
export { defaultBrush } from './stage-tools/brush-settings';
export type { StageToolsOptions } from './stage-tools/types';
