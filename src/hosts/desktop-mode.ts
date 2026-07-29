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
interface DesktopApi {
	isActive?: () => boolean;
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

/**
 * The attachment a pending open is for.
 *
 * The file-opener handler and the window's render callback are separate events: the
 * handler asks the shell to open the window, and the render callback runs later
 * with no argument. Desktop Mode's `kind: 'window'` handler was built to carry a
 * config across that gap, but its documentation records that the config is dropped
 * before it reaches the window -- so the attachment id is parked here instead, and
 * the handler uses `kind: 'js'`.
 */
let pendingAttachment = 0;

/** Consumes the pending attachment id, if any. */
function takePending(): number {
	const id = pendingAttachment;
	pendingAttachment = 0;

	return id;
}

/**
 * Registers the native window renderer and the desktop integrations.
 *
 * Safe to call anywhere; no-ops without Desktop Mode.
 */
export function bootDesktopMode(): void {
	registerNativeWindow();

	if ( ! desktop() ) {
		return;
	}

	registerFileOpener();
}

/**
 * Installs the render callback the shell calls when the window opens.
 *
 * Registered unconditionally, because the shell may load after this bundle and will
 * look the callback up by id when it does.
 */
function registerNativeWindow(): void {
	const registry = ( ( window as unknown as {
		desktopModeNativeWindows?: Record< string, unknown >;
	} ).desktopModeNativeWindows ??= {} ) as Record<
		string,
		( body: HTMLElement, ctx?: unknown ) => void | ( () => void )
	>;

	registry[ WINDOW_ID ] = ( body ) => renderWindow( body );
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
function renderWindow( body: HTMLElement ): () => void {
	const root =
		body.querySelector< HTMLElement >( '[data-daguerre-root]' ) ?? body;
	const config = window.daguerreConfig;

	let editor: EditorInstance | null = null;
	let releaseDrop: ( () => void ) | null = null;

	const open = ( attachmentId: number ) => {
		editor?.destroy();
		root.replaceChildren();

		editor = mount( root, {
			attachmentId,
			host: 'window',
			onSave: ( result ) => attachDragOut( root, result ),
		} );
	};

	const attachmentId = takePending();

	if ( attachmentId ) {
		open( attachmentId );
	} else if ( config ) {
		// No file was double-clicked, so the window opened from the dock or an icon.
		// Show the picker, but intercept its links -- following one would navigate
		// the whole shell away from the desktop.
		void renderPicker( root, config, ( id ) => open( id ) );
	}

	releaseDrop = registerDropTarget( root, open );

	return () => {
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
	const register = desktop()?.dragManager?.registerDropTarget;

	if ( ! register ) {
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

	return register( {
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
	const register = desktop()?.files?.registerOpener;

	if ( ! register ) {
		return;
	}

	register( {
		id: 'daguerre',
		label: __( 'Edit in Daguerre' ),
		types: [ 'attachment' ],
		isDefault: false,
		sort: 15,
		handler: {
			kind: 'js',
			open: ( file ) => {
				pendingAttachment = Number( file.ref() ) || 0;
				desktop()?.openWindow?.( WINDOW_ID, { source: 'file-opener' } );
			},
		},
	} );
}
