/**
 * The settings every drawing tool shares.
 *
 * Its own module because half the editor reads this type and almost none of it needs
 * the pointer controller that happens to consume it. Importing `BrushSettings` used to
 * drag in Pixi, the paint shapes and the whole selection model with it.
 */

import type { BrushShape } from '../../engine/brush';
import type { GradientKind, ShapeKind, ShapeStyle } from '../../engine/paint-shapes';
import type { PixelOp } from '../../engine/pixel-tools';

/**
 * Everything the drawing tools need to know about themselves.
 *
 * One object rather than one per tool: the settings overlap heavily -- size, opacity
 * and colour belong to almost all of them -- and a single object means the options bar
 * and the sidebar panel are two views of one model rather than nine.
 */
export interface BrushSettings {
	shape: BrushShape;
	/** Diameter in canvas pixels. */
	size: number;
	/** Edge falloff, 0..1. */
	hardness: number;
	/** Stroke opacity, 0..1. */
	opacity: number;
	/** The foreground colour: what brushes, fills, shapes and text paint with. */
	colour: string;
	/** The background colour: the far end of a gradient, and what X swaps to. */
	background: string;
	/** Flood fill match tolerance, 0..255. */
	tolerance: number;
	/** Which pixel operation the retouch tool performs. */
	retouch: PixelOp;
	/** Which pixel operation the dodge/burn tool performs. */
	tone: PixelOp;
	/** How hard the retouching tools bite, 0..1. */
	strength: number;
	/** Linear or radial, for the gradient tool. */
	gradient: GradientKind;
	/** Whether the gradient ends transparent rather than at the background colour. */
	gradientFade: boolean;
	/** What the shape tool draws. */
	shapeKind: ShapeKind;
	/** Whether shapes are filled or outlined. */
	shapeStyle: ShapeStyle;
	/** Outline width in canvas pixels. */
	strokeWidth: number;
	/** Text size in canvas pixels. */
	fontSize: number;
	fontFamily: string;
	bold: boolean;
	italic: boolean;
}

/**
 * The settings a freshly opened editor starts with.
 *
 * A factory rather than a shared constant, because every editor instance owns its own
 * copy and handing them all the same object would let two windows fight over one brush.
 */
export function defaultBrush(): BrushSettings {
	return {
		shape: 'soft',
		size: 40,
		hardness: 0.6,
		opacity: 1,
		colour: '#000000',
		background: '#ffffff',
		tolerance: 32,
		retouch: 'blur',
		tone: 'dodge',
		strength: 0.5,
		gradient: 'linear',
		gradientFade: false,
		shapeKind: 'rect',
		shapeStyle: 'fill',
		strokeWidth: 4,
		fontSize: 72,
		fontFamily: 'system-ui, sans-serif',
		bold: false,
		italic: false,
	};
}
