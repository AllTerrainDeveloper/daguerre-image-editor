/**
 * Panning and zooming the pasteboard.
 */

/** What the pasteboard needs from the renderer. */
export interface PasteboardView {
	pan: ( dx: number, dy: number ) => void;
	zoomAt: ( factor: number, originX: number, originY: number ) => void;
}

/**
 * Lets the pasteboard be scrolled and zoomed.
 *
 * A plain wheel scrolls, which is what a trackpad or a Magic Mouse produces from
 * a two-finger swipe -- so panning is the default gesture rather than something
 * behind a modifier. Ctrl or Cmd with the wheel zooms, matching the convention
 * every map and design tool uses, and is also what a pinch gesture reports.
 *
 * The listener is non-passive because it has to call `preventDefault()`: without
 * that, the admin page scrolls behind the editor and a pinch zooms the browser.
 *
 * @param stage       The canvas area.
 * @param getRenderer The renderer, or null before it has started.
 * @return Detach function.
 */
export function attachPasteboard(
	stage: HTMLElement,
	getRenderer: () => PasteboardView | null
): () => void {
	const onWheel = ( event: WheelEvent ) => {
		const renderer = getRenderer();

		if ( ! renderer ) {
			return;
		}

		event.preventDefault();

		if ( event.ctrlKey || event.metaKey ) {
			const bounds = stage.getBoundingClientRect();

			// Exponential so zooming in and out by the same gesture is symmetrical.
			// The coefficient is tuned for a mouse wheel, where one notch reports a
			// delta of about 120: that gives roughly 1.27x per notch, which is a step
			// you can aim with. A trackpad pinch reports much smaller deltas and lands
			// proportionally finer.
			renderer.zoomAt(
				Math.exp( -event.deltaY * 0.002 ),
				event.clientX - bounds.left,
				event.clientY - bounds.top
			);

			return;
		}

		renderer.pan( -event.deltaX, -event.deltaY );
	};

	stage.addEventListener( 'wheel', onWheel, { passive: false } );

	return () => stage.removeEventListener( 'wheel', onWheel );
}
