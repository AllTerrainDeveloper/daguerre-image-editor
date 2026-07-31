/**
 * What each tool is called, and what to say when it has no options.
 */

/** Tool names shown at the start of the bar. */
export const TOOL_NAMES: Record< string, string > = {
	transform: 'Move & transform',
	select: 'Select',
	wand: 'Magic wand',
	crop: 'Crop',
	eyedropper: 'Eyedropper',
	retouch: 'Retouch',
	brush: 'Brush',
	history: 'History brush',
	clone: 'Clone stamp',
	eraser: 'Eraser',
	fill: 'Fill',
	gradient: 'Gradient',
	tone: 'Dodge & burn',
	text: 'Text',
	shape: 'Shape',
	path: 'Path',
	hand: 'Hand',
	zoom: 'Zoom',
};

/** One-line guidance for tools with no options of their own. */
export const TOOL_HINTS: Record< string, string > = {
	transform:
		'Drag to move, corners scale, edges scale one axis, top handle rotates. Alt bypasses snapping.',
	crop: 'Drag a rectangle, then apply it from the Canvas & crop panel.',
	eyedropper: 'Click or drag to sample a colour into the foreground swatch.',
	hand: 'Drag to move the view. Scrolling does the same thing from any tool.',
};
