/**
 * The `wp.desktop` surface, as Lienzo uses it.
 *
 * These types are hand-written on purpose. Taking the `desktop-mode` npm package as a
 * dependency would mean Lienzo could not build with Desktop Mode absent from disk, and
 * a standalone plugin has to.
 *
 * Everything here is feature-detected. This module also loads on plain WordPress admin
 * screens where none of these APIs exist, so every reader must return undefined rather
 * than throw.
 */

/** Window id registered by `lienzo_register_desktop_window()`. */
export const WINDOW_ID = 'lienzo';

/** The `wp.desktop` surface this module uses. */
/**
 * The parts of the shell's native render context this file uses.
 *
 * Declared here rather than imported: Lienzo builds without Desktop Mode present on
 * disk, so its types are described narrowly at the point of use.
 */
export interface NativeRenderContext {
	/** Puts the window body back into its loading state. */
	markLoading?: () => void;
	/** Tells the shell the body is ready, which hides the spinner. */
	markReady?: () => void;
}

export interface DesktopApi {
	isActive?: () => boolean;
	/** Runs a callback once the shell has finished booting. */
	whenReady?: ( callback: () => void ) => void;
	openWindow?: ( id: string, opts?: { source?: string } ) => boolean;
	files?: {
		registerOpener?: ( def: {
			id: string;
			label: string;
			types: string[];
			isDefault?: boolean;
			sort?: number;
			handler: { kind: 'js'; open: ( file: DesktopFileLike ) => void };
		} ) => void;
	};
	dragManager?: {
		registerDropTarget?: ( target: {
			id: string;
			element: HTMLElement;
			accept: ( payload: DragPayloadLike ) => boolean;
			onDrop: (
				session: { payload: DragPayloadLike },
				at: { clientX: number; clientY: number }
			) => void;
			acceptLabel?: string;
		} ) => () => void;
	};
	dragBridge?: {
		start?: ( payload: Record< string, unknown > ) => void;
		end?: () => void;
	};
}

/** A file on the Desktop Mode desktop. */
export interface DesktopFileLike {
	ref: () => string;
	type?: () => string;
}

/** A Desktop Mode drag payload. */
export interface DragPayloadLike {
	type: string;
	data?: Record< string, unknown >;
}

/** Returns the Desktop Mode API when the shell is actually mounted. */
export function desktop(): DesktopApi | undefined {
	const api = ( window.wp as { desktop?: DesktopApi } | undefined )?.desktop;

	return api?.isActive?.() ? api : undefined;
}


/** Consumes the pending attachment id, if any. */
export function takePending(): number {
	const shared = state();
	const id = shared.pending;

	shared.pending = 0;

	return id;
}

/**
 * State shared by every copy of this bundle on the page.
 *
 * There is more than one. WordPress enqueues the script, and the shell's lazy-load
 * payload injects the same URL again when a native window first opens -- so the IIFE
 * is evaluated twice and there are two module scopes. Module-level variables are then
 * two variables: `window.lienzo` belongs to whichever copy ran last, the render
 * callback to whichever registered last, and a request to open an image reached a set
 * of window loaders that the live window had never been added to. It reported success
 * and did nothing.
 *
 * Hanging the mutable state off one global makes the duplicate harmless. Everything
 * here is state that must be singular no matter how many times this file runs.
 */
export interface SharedState {
	/**
	 * Loaders belonging to the windows currently rendered.
	 *
	 * A window that is already open does not re-run its render callback when it is
	 * focused, so parking an id and calling `openWindow()` would focus the window and
	 * change nothing. A live loader is what lets a second request land in it.
	 *
	 * A set rather than one slot: the shell can render a window more than once, and a
	 * single slot ends up nulled by the first render's teardown arriving after the
	 * second render replaced it. Each render adds and removes only its own entry.
	 */
	openers: Set< ( attachmentId: number ) => void >;
	/** Attachment parked for a window that has not rendered yet. */
	pending: number;
	/** Thumbnail of the image currently open, for the dock's hover-peek card. */
	previewUrl: string;
	/** Its title, for the thumbnail's alternative text. */
	previewTitle: string;
	/** Whether the peek filter has been added, so a second copy does not add it twice. */
	peekRegistered: boolean;
	/** Whether the cross-frame open listener is installed. */
	listenerRegistered: boolean;
}

/** Reads the shared state, creating it on first use. */
export function state(): SharedState {
	const holder = window as unknown as { __lienzoDesktop?: SharedState };

	holder.__lienzoDesktop ??= {
		openers: new Set(),
		pending: 0,
		previewUrl: '',
		previewTitle: '',
		peekRegistered: false,
		listenerRegistered: false,
	};

	return holder.__lienzoDesktop;
}
