/**
 * Host adapters.
 *
 * Daguerre runs in two worlds: a plain WordPress admin, and inside the Desktop Mode
 * shell. Rather than scatter `if ( desktopMode )` through the codebase, every
 * capability that differs between the two is funnelled through this module. The
 * rest of the plugin imports from here and never asks which world it is in.
 *
 * Nothing here hard-depends on Desktop Mode. Each adapter feature-detects the exact
 * method it wants and falls back to a plain-DOM implementation, so removing Desktop
 * Mode degrades the experience without breaking it.
 */

import type { WpDesktopLike } from './globals';

/** Returns the Desktop Mode API when the shell is actually mounted on this page. */
function desktop(): WpDesktopLike | undefined {
	const api = window.wp?.desktop;

	return api?.isActive?.() ? api : undefined;
}

/**
 * Whether the Desktop Mode shell is running.
 *
 * Used for presentation decisions only. Never gate a capability on this -- gate on
 * the specific method being present, so a Desktop Mode version that lacks one
 * feature still gets every other.
 */
export function isDesktopMode(): boolean {
	return desktop() !== undefined;
}

/**
 * Whether Desktop Mode is switched on for this user.
 *
 * Distinct from `isDesktopMode()`, which only reports whether the shell's JavaScript
 * happens to be on the page. This reads the flag PHP put in the config, which comes
 * from `desktop_mode_is_enabled()` -- a per-user preference. It is the honest answer
 * to "should this look like a desktop app", and it is true even inside a chromeless
 * iframe, where the shell's own script is deliberately absent.
 */
export function isDesktopModeEnabled(): boolean {
	const config = (
		window as unknown as { daguerreConfig?: { desktopMode?: unknown } }
	).daguerreConfig;
	const flag = config?.desktopMode;

	// Tolerant of `'1'` as well as `true`: the config now travels as JSON, but a site
	// filtering `daguerre_config` can still put a stringified boolean in there, and a
	// flag that reads as false when PHP says true is a bug that hides rather than
	// announces itself.
	return flag === true || flag === '1' || flag === 1 || isDesktopMode();
}

/**
 * Picks the first registered tag from a list of candidates.
 *
 * Components register lazily: the shell defines a core subset eagerly and the rest
 * only when a bundle importing them loads, so on any given page some are there and
 * some are not. `wpd-number-field` in particular is usually absent while
 * `wpd-text-field` is present -- and a text field in numeric mode is a far better
 * answer than dropping straight to a bare input, because it is still the shell's own
 * control with the shell's own styling.
 *
 * @param tags Candidates, best first.
 * @return The first registered tag, or null when none of them are.
 */
export function pickComponent( tags: string[] ): string | null {
	for ( const tag of tags ) {
		if ( hasComponent( tag ) ) {
			return tag;
		}
	}

	return null;
}

/**
 * Whether a Desktop Mode web component has been registered on this page.
 *
 * The shell registers a core subset of `<wpd-*>` eagerly and the rest only when a
 * bundle that imports them loads, so presence has to be checked per tag at the
 * moment the UI is built. An unregistered tag renders as inert markup, which is why
 * this is a hard gate rather than an optimistic one.
 *
 * @param tag Custom element tag name, e.g. `wpd-range-field`.
 */
export function hasComponent( tag: string ): boolean {
	return (
		typeof customElements !== 'undefined' &&
		customElements.get( tag ) !== undefined
	);
}

/**
 * Performs an HTTP request.
 *
 * Routed through Desktop Mode's `fetch` when available so the shell can show
 * in-flight activity on the window's title bar. Falls back to the platform fetch.
 *
 * @param input Request target.
 * @param init  Request options.
 */
export function request(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise< Response > {
	const api = desktop();

	if ( api?.fetch ) {
		return api.fetch( input, init );
	}

	return window.fetch( input, init );
}

/** Toast severity. */
export type ToastType = 'info' | 'success' | 'error';

/**
 * Shows a transient message.
 *
 * @param message Text to show.
 * @param type    Severity.
 */
export function toast( message: string, type: ToastType = 'info' ): void {
	const api = desktop();

	if ( api?.showToast ) {
		api.showToast( { message, type } );
		return;
	}

	fallbackToast( message, type );
}

/** Container for the fallback toasts, created lazily. */
let toastHost: HTMLElement | null = null;

/**
 * Minimal toast for installs without Desktop Mode.
 *
 * @param message Text to show.
 * @param type    Severity.
 */
function fallbackToast( message: string, type: ToastType ): void {
	if ( ! toastHost || ! toastHost.isConnected ) {
		toastHost = document.createElement( 'div' );
		toastHost.className = 'dg-toasts';
		toastHost.setAttribute( 'role', 'status' );
		toastHost.setAttribute( 'aria-live', 'polite' );
		document.body.appendChild( toastHost );
	}

	const node = document.createElement( 'div' );
	node.className = `dg-toast dg-toast--${ type }`;
	node.textContent = message;
	toastHost.appendChild( node );

	window.setTimeout( () => {
		node.classList.add( 'is-leaving' );
		window.setTimeout( () => node.remove(), 300 );
	}, type === 'error' ? 6000 : 3500 );
}

/**
 * Asks the user to confirm something.
 *
 * @param opts Prompt copy.
 * @return Whether the user confirmed.
 */
export function confirmAction( opts: {
	title: string;
	message: string;
	confirmLabel?: string;
	destructive?: boolean;
} ): Promise< boolean > {
	const api = desktop();

	if ( api?.confirm ) {
		return api.confirm( opts );
	}

	// eslint-disable-next-line no-alert
	return Promise.resolve( window.confirm( `${ opts.title }\n\n${ opts.message }` ) );
}
