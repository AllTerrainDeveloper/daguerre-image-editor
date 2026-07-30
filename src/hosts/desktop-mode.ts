/**
 * The Desktop Mode host.
 *
 * Renders the editor as a native Desktop Mode window -- in the parent shell's DOM
 * rather than a chromeless iframe -- and wires it into the desktop's own idioms:
 * double-clicking a photo on the wallpaper opens it here, a photo can be dragged
 * onto the window to load it, and a saved result can be dragged back out into a
 * Gutenberg window.
 *
 * Everything is feature-detected. This module also loads on plain WordPress admin
 * screens where none of these APIs exist, so every entry point must be a silent
 * no-op rather than a console error.
 *
 * The `wp.desktop` types here are hand-written on purpose. Taking the
 * `desktop-mode` npm package as a dependency would mean Daguerre could not build
 * with Desktop Mode absent from disk, and a standalone plugin has to.
 */

import { mount } from '../api';
import type { EditorInstance } from '../api';
import { __ } from '../i18n';
import { renderPicker } from '../ui/picker';
import type { SaveResult } from '../types';

/** Window id registered by `daguerre_register_desktop_window()`. */
const WINDOW_ID = 'daguerre';

/** The `wp.desktop` surface this module uses. */
/**
 * The parts of the shell's native render context this file uses.
 *
 * Declared here rather than imported: Daguerre builds without Desktop Mode present on
 * disk, so its types are described narrowly at the point of use.
 */
interface NativeRenderContext {
	/** Puts the window body back into its loading state. */
	markLoading?: () => void;
	/** Tells the shell the body is ready, which hides the spinner. */
	markReady?: () => void;
}

interface DesktopApi {
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
			onDrop: ( session: { payload: DragPayloadLike } ) => void;
			acceptLabel?: string;
		} ) => () => void;
	};
	dragBridge?: {
		start?: ( payload: Record< string, unknown > ) => void;
		end?: () => void;
	};
}

/** A file on the Desktop Mode desktop. */
interface DesktopFileLike {
	ref: () => string;
	type?: () => string;
}

/** A Desktop Mode drag payload. */
interface DragPayloadLike {
	type: string;
	data?: Record< string, unknown >;
}

/** Returns the Desktop Mode API when the shell is actually mounted. */
function desktop(): DesktopApi | undefined {
	const api = ( window.wp as { desktop?: DesktopApi } | undefined )?.desktop;

	return api?.isActive?.() ? api : undefined;
}


/** Consumes the pending attachment id, if any. */
function takePending(): number {
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
 * two variables: `window.daguerre` belongs to whichever copy ran last, the render
 * callback to whichever registered last, and a request to open an image reached a set
 * of window loaders that the live window had never been added to. It reported success
 * and did nothing.
 *
 * Hanging the mutable state off one global makes the duplicate harmless. Everything
 * here is state that must be singular no matter how many times this file runs.
 */
interface SharedState {
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
function state(): SharedState {
	const holder = window as unknown as { __daguerreDesktop?: SharedState };

	holder.__daguerreDesktop ??= {
		openers: new Set(),
		pending: 0,
		previewUrl: '',
		previewTitle: '',
		peekRegistered: false,
		listenerRegistered: false,
	};

	return holder.__daguerreDesktop;
}


/** The message an iframe sends to ask the shell to open an image. */
const OPEN_MESSAGE = 'daguerre-open';

/**
 * Opens an image in the desktop window, from anywhere on the page.
 *
 * Callable from the shell itself or from inside a chromeless iframe: the shell's
 * window manager only exists in the top frame, so a request from an iframe is posted
 * up to the listener installed by `bootDesktopMode()`.
 *
 * @param attachmentId Attachment to edit.
 * @return True when the request was handled or forwarded.
 */
export function openInDesktop( attachmentId: number ): boolean {
	const id = Number( attachmentId ) || 0;

	if ( ! id ) {
		return false;
	}

	if ( desktop()?.openWindow ) {
		// The most recently rendered window is the one on screen. Load into it rather
		// than focusing a window showing something else and leaving the id parked.
		const live = [ ...state().openers ].pop();

		if ( live ) {
			live( id );
		} else {
			state().pending = id;
		}

		desktop()?.openWindow?.( WINDOW_ID, { source: 'daguerre' } );

		return true;
	}

	if ( window.parent && window.parent !== window ) {
		window.parent.postMessage(
			{ type: OPEN_MESSAGE, attachmentId: id },
			window.location.origin
		);

		return true;
	}

	return false;
}

/**
 * Listens for open requests posted up from chromeless iframes.
 *
 * Same-origin only, and the payload is one integer -- an iframe on this page is our
 * own admin, but the check costs nothing and the alternative is trusting whatever
 * else might be embedded.
 */
function listenForOpenRequests(): void {
	if ( state().listenerRegistered ) {
		return;
	}

	state().listenerRegistered = true;

	window.addEventListener( 'message', ( event: MessageEvent ) => {
		if ( event.origin !== window.location.origin ) {
			return;
		}

		const data = event.data as { type?: string; attachmentId?: number } | null;

		if ( ! data || data.type !== OPEN_MESSAGE ) {
			return;
		}

		openInDesktop( Number( data.attachmentId ) || 0 );
	} );
}

/**
 * Registers the native window renderer and the desktop integrations.
 *
 * Safe to call anywhere; no-ops without Desktop Mode.
 */
export function bootDesktopMode(): void {
	if ( ! desktop() ) {
		return;
	}

	registerPeekThumbnail();

	try {
		registerFileOpener();
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.warn( '[daguerre] file opener unavailable:', error );
	}

	listenForOpenRequests();
}

/**
 * Shows the photo being edited on the dock's hover-peek card.
 *
 * The peek exists to answer "which one is this?" without focusing the window, and for
 * a photo editor the only answer worth giving is the photo. Desktop Mode's default
 * card shows a tinted placeholder body, so the filter swaps in the image's own
 * thumbnail -- which is already downloaded and cached by the media library, so the
 * peek costs nothing to draw.
 */
function registerPeekThumbnail(): void {
	const hooks = ( window as unknown as {
		wp?: { hooks?: { addFilter?: ( ...args: unknown[] ) => void } };
	} ).wp?.hooks;

	if ( ! hooks?.addFilter || state().peekRegistered ) {
		return;
	}

	state().peekRegistered = true;

	hooks.addFilter(
		'desktop-mode.dock.peek-card-content',
		'daguerre/thumbnail',
		( body: unknown, context: unknown ) => {
			const win = ( context as { window?: { id?: string } } | undefined )
				?.window;

			// Only our own cards, and only once an image is actually open.
			const shared = state();

			if ( ! win?.id?.startsWith( WINDOW_ID ) || ! shared.previewUrl ) {
				return body;
			}

			const image = document.createElement( 'img' );

			image.className = 'dg-peek-thumb';
			image.src = shared.previewUrl;
			image.alt = shared.previewTitle;
			image.loading = 'lazy';
			image.decoding = 'async';

			return image;
		}
	);
}

/**
 * Installs the render callback the shell calls when the window opens.
 *
 * Called at module scope rather than from `boot()`: `boot()` waits for
 * `DOMContentLoaded`, and the shell may restore a saved window before then, find no
 * callback registered under this id, and leave the body blank.
 *
 * Registration is the whole fix. An earlier version also swept the DOM for empty roots
 * and rendered into them, which looked like cheap insurance and was not: the shell
 * renders into that same root a moment later, so the window ended up with two live
 * closures over one element and `openInDesktop()` drove the stale one -- it reported
 * success and changed nothing.
 */
function registerNativeWindow(): void {
	const registry = ( ( window as unknown as {
		desktopModeNativeWindows?: Record< string, unknown >;
	} ).desktopModeNativeWindows ??= {} ) as Record<
		string,
		( body: HTMLElement, ctx?: unknown ) => void | ( () => void )
	>;

	registry[ WINDOW_ID ] = ( body, ctx ) =>
		renderWindow( body, ctx as NativeRenderContext | undefined );
}

/**
 * Renders the editor into a native window body.
 *
 * The shell clones the registered `<template>` into the body before calling this,
 * so the mount point is already there to be found rather than created.
 *
 * @param body Window body element.
 * @return Teardown, captured by the shell and run on close.
 */
function renderWindow(
	body: HTMLElement,
	ctx?: NativeRenderContext
): () => void {
	const root =
		body.querySelector< HTMLElement >( '[data-daguerre-root]' ) ?? body;
	const config = window.daguerreConfig;

	let editor: EditorInstance | null = null;
	let releaseDrop: ( () => void ) | null = null;

	// Bumped whenever the root is taken over, so a picker fetch that resolves later
	// knows it is writing into someone else's element.
	let session = 0;

	const open = ( attachmentId: number ) => {
		session++;
		editor?.destroy();
		root.replaceChildren();

		// The shell covers the body with a spinner until it is told the content is
		// ready. It does that automatically for a render callback that returns a
		// promise -- but this one returns a teardown function synchronously while the
		// editor loads in the background, so without saying so the spinner stays up
		// over a working editor and dims the whole window.
		ctx?.markLoading?.();

		editor = mount( root, {
			attachmentId,
			host: 'window',
			onSave: ( result ) => {
				attachDragOut( root, result );
				// The peek should show what the window shows, and after a save that is
				// the copy that was just written.
				state().previewUrl = result.url;
			},
			onReady: ( payload ) => {
				state().previewUrl = payload?.url ?? '';
				state().previewTitle = payload?.title ?? '';
				ctx?.markReady?.();
			},
		} );
	};

	state().openers.add( open );

	const attachmentId = takePending();

	if ( attachmentId ) {
		open( attachmentId );
	} else if ( config ) {
		// No file was double-clicked, so the window opened from the dock or an icon.
		// Show the picker, but intercept its links -- following one would navigate
		// the whole shell away from the desktop.
		const mine = session;

		void renderPicker(
			root,
			config,
			( id ) => open( id ),
			() => session !== mine
		);
	}

	// Guarded because it is an enhancement, not the feature. Drag-and-drop failing
	// should cost drag-and-drop; an exception here happens *inside* the shell's render
	// callback, so it takes the whole window with it and the editor never appears --
	// which is exactly what an unbound call to the shell's own method did.
	try {
		releaseDrop = registerDropTarget( root, open );
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.warn( '[daguerre] drag-and-drop unavailable:', error );
	}

	return () => {
		// Only this render's own loader, so a teardown arriving after a newer render
		// cannot leave the live window unreachable.
		state().openers.delete( open );
		state().previewUrl = '';
		state().previewTitle = '';
		releaseDrop?.();
		editor?.destroy();
	};
}

/**
 * Lets a photo be dragged from the desktop onto the editor to open it.
 *
 * @param element Drop area.
 * @param open    Called with the dropped attachment id.
 * @return Unregister function, or null when drag support is unavailable.
 */
function registerDropTarget(
	element: HTMLElement,
	open: ( id: number ) => void
): ( () => void ) | null {
	const manager = desktop()?.dragManager;

	if ( ! manager?.registerDropTarget ) {
		return null;
	}

	const attachmentOf = ( payload: DragPayloadLike ): number => {
		const bridge = payload.data?.bridgePayload as
			| { kind?: string; id?: number; mime?: string }
			| undefined;

		if ( bridge?.kind !== 'attachment' ) {
			return 0;
		}

		// A video or a PDF is a perfectly valid thing to drag; it is just not
		// something this window can do anything with.
		if ( bridge.mime && ! window.daguerreConfig?.supportedMimes.includes( bridge.mime ) ) {
			return 0;
		}

		return Number( bridge.id ?? 0 );
	};

	// Called on the manager, never pulled off it. The shell's method reads its own
	// `this`, so a detached reference throws `Cannot read properties of undefined` --
	// and it throws inside a render callback, which takes the whole window down with it.
	return manager.registerDropTarget( {
		id: 'daguerre-window',
		element,
		accept: ( payload ) => attachmentOf( payload ) > 0,
		acceptLabel: __( 'Open in Daguerre' ),
		onDrop: ( session ) => {
			const id = attachmentOf( session.payload );

			if ( id ) {
				open( id );
			}
		},
	} );
}

/**
 * Makes the saved-copy banner draggable into other desktop windows.
 *
 * The point of a desktop metaphor is that a result is an object you can pick up. A
 * photo edited here should be draggable straight into a Gutenberg window, where the
 * shell's own drop receiver turns it into a `core/image` block.
 *
 * @param root   Editor root, which holds the banner.
 * @param result The attachment that was just created.
 */
function attachDragOut( root: HTMLElement, result: SaveResult ): void {
	const bridge = desktop()?.dragBridge;

	if ( ! bridge?.start ) {
		return;
	}

	const banner = root.querySelector< HTMLElement >( '.dg-saved a' );

	if ( ! banner ) {
		return;
	}

	banner.draggable = true;
	banner.title = __( 'Drag into another window to insert it' );

	banner.addEventListener( 'dragstart', () => {
		bridge.start?.( {
			kind: 'attachment',
			id: result.id,
			url: result.url,
			title: __( 'Edited image' ),
			alt: '',
			mime: result.mime,
			thumbnailUrl: result.url,
		} );
	} );

	banner.addEventListener( 'dragend', () => bridge.end?.() );
}

/**
 * Offers Daguerre as a way to open image files on the desktop.
 *
 * Registered with `isDefault: false` so it appears alongside the built-in media
 * editor rather than silently replacing it; a user who wants it as the default sets
 * that in Desktop Mode's own file associations.
 */
function registerFileOpener(): void {
	const files = desktop()?.files;

	if ( ! files?.registerOpener ) {
		return;
	}

	// On the object, for the same reason the drop target is.
	files.registerOpener( {
		id: 'daguerre',
		label: __( 'Edit in Daguerre' ),
		types: [ 'attachment' ],
		isDefault: false,
		sort: 15,
		handler: {
			kind: 'js',
			open: ( file ) => openInDesktop( Number( file.ref() ) || 0 ),
		},
	} );
}

// Registered here, at module scope, so the callback exists the instant this bundle
// parses -- before the shell gets round to restoring last session's windows.
registerNativeWindow();
