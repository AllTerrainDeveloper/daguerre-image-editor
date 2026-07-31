/**
 * Which tools the rail offers, in which order, under which key.
 *
 * Grouped by what they do to the image, with a hairline between groups, so the rail
 * reads as five short lists rather than one long one.
 */

import type { ActiveTool } from '../panels';

/** A tool's presentation. */
interface ToolDef {
	id: ActiveTool;
	glyph: string;
	label: string;
	/** Single-key shortcut, matching the convention users already have. */
	key: string;
	/** Which group the tool belongs to; a change draws a separator. */
	group: number;
}

/**
 * Every tool, in rail order.
 *
 * The glyphs are Unicode rather than an icon font: Dashicons has no marquee, no wand
 * and no dodge tool, and shipping an icon set for sixteen buttons would cost more
 * bytes than the entire tool implementation. Text-presentation symbols throughout, not
 * emoji -- a rail of grey glyphs with three colour pictures in it reads as a mistake.
 */
export const TOOLS: ToolDef[] = [
	{ id: 'transform', glyph: '✥', label: 'Move & transform', key: 'v', group: 1 },
	{ id: 'select', glyph: '⬚', label: 'Select', key: 'm', group: 1 },
	{ id: 'wand', glyph: '✧', label: 'Magic wand', key: 'w', group: 1 },
	{ id: 'crop', glyph: '⌗', label: 'Crop', key: 'c', group: 1 },

	{ id: 'eyedropper', glyph: '⌖', label: 'Eyedropper', key: 'i', group: 2 },
	{ id: 'retouch', glyph: '◌', label: 'Retouch', key: 'r', group: 2 },
	{ id: 'clone', glyph: '⎗', label: 'Clone stamp', key: 's', group: 2 },
	{ id: 'tone', glyph: '◐', label: 'Dodge & burn', key: 'o', group: 2 },

	{ id: 'brush', glyph: '✎', label: 'Brush', key: 'b', group: 3 },
	{ id: 'history', glyph: '↺', label: 'History brush', key: 'y', group: 3 },
	{ id: 'eraser', glyph: '◻', label: 'Eraser', key: 'e', group: 3 },
	{ id: 'fill', glyph: '◧', label: 'Fill', key: 'g', group: 3 },

	{ id: 'gradient', glyph: '▨', label: 'Gradient', key: 'n', group: 4 },
	{ id: 'shape', glyph: '▬', label: 'Shape', key: 'u', group: 4 },
	{ id: 'path', glyph: '✒', label: 'Path', key: 'p', group: 4 },
	{ id: 'text', glyph: 'T', label: 'Text', key: 't', group: 4 },

	{ id: 'hand', glyph: '☞', label: 'Hand', key: 'h', group: 5 },
	{ id: 'zoom', glyph: '⌕', label: 'Zoom', key: 'z', group: 5 },
];
