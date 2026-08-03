/**
 * Host adapters.
 *
 * Lienzo runs in two worlds: a plain WordPress admin, and inside the shell that is
 * now called OpenStation. Rather than scatter `if ( shell )` through the codebase,
 * every capability that differs between the two is funnelled through this module.
 * The rest of the plugin imports from here and never asks which world it is in.
 *
 * Nothing here hard-depends on the shell. Each adapter feature-detects the exact
 * method it wants and falls back to a plain-DOM implementation, so removing the
 * shell degrades the experience without breaking it.
 *
 * ## Two spellings of everything
 *
 * OpenStation 0.9.9 renamed the whole surface -- `wp.desktop` became `wp.os`,
 * `<wpd-*>` became `<os-*>`, and every event with it. Lienzo ships to sites running
 * either version and cannot know which, so it asks for capabilities by bare name and
 * this module resolves the spelling. That is why nothing outside here writes a
 * prefix: a hardcoded `wpd-button` is a control that silently renders as inert
 * markup on a current shell, and a hardcoded `os-button` is the same bug in reverse.
 */

import type { WpDesktopLike } from './globals';

/**
 * Namespace prefixes to try, current first.
 *
 * Ordered so a site running both -- which happens mid-upgrade, when an old bundle is
 * still cached -- gets the current spelling rather than whichever was defined first.
 */
const PREFIXES = [ 'os', 'wpd' ];

/** Returns the shell API when it is actually mounted on this page. */
function desktop(): WpDesktopLike | undefined {
	const wp = window.wp as
		| { os?: WpDesktopLike; desktop?: WpDesktopLike }
		| undefined;
	const api = wp?.os ?? wp?.desktop;

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
		window as unknown as { lienzoConfig?: { desktopMode?: unknown } }
	).lienzoConfig;
	const flag = config?.desktopMode;

	// Tolerant of `'1'` as well as `true`: the config now travels as JSON, but a site
	// filtering `lienzo_config` can still put a stringified boolean in there, and a
	// flag that reads as false when PHP says true is a bug that hides rather than
	// announces itself.
	return flag === true || flag === '1' || flag === 1 || isDesktopMode();
}

/**
 * Picks the first registered component from a list of candidates.
 *
 * Components register lazily: the shell defines a core subset eagerly and the rest
 * only when a bundle importing them loads, so on any given page some are there and
 * some are not. `number-field` in particular is usually absent while `text-field` is
 * present -- and a text field in numeric mode is a far better answer than dropping
 * straight to a bare input, because it is still the shell's own control with the
 * shell's own styling.
 *
 * @param names Bare component names, best first, e.g. `[ 'number-field', 'text-field' ]`.
 * @return The registered tag *including its prefix*, or null when none are.
 */
export function pickComponent( names: string[] ): string | null {
	for ( const name of names ) {
		const tag = componentTag( name );

		if ( tag ) {
			return tag;
		}
	}

	return null;
}

/**
 * The registered tag for a component, whichever spelling this shell uses.
 *
 * @param name Bare component name, e.g. `range-field`.
 * @return The tag to create, or null when no shell defines it.
 */
export function componentTag( name: string ): string | null {
	if ( 'undefined' === typeof customElements ) {
		return null;
	}

	for ( const prefix of PREFIXES ) {
		const tag = `${ prefix }-${ name }`;

		if ( customElements.get( tag ) !== undefined ) {
			return tag;
		}
	}

	return null;
}

/**
 * Whether the shell has registered a component on this page.
 *
 * Presence has to be checked per component at the moment the UI is built, because an
 * unregistered tag renders as inert markup with no error -- which is why this is a
 * hard gate rather than an optimistic one.
 *
 * @param name Bare component name, e.g. `range-field`.
 */
export function hasComponent( name: string ): boolean {
	return null !== componentTag( name );
}

/**
 * Every spelling of one shell event.
 *
 * Listeners are bound to all of them rather than to the one matching the resolved
 * component prefix. The two are not reliably in step: a shell mid-upgrade can define
 * `os-range-field` while a cached bundle still emits `wpd-range-change`, and a
 * control that listened for only one spelling would render perfectly and do nothing.
 *
 * @param name Bare event name, e.g. `range-change`.
 */
export function shellEvents( name: string ): string[] {
	return PREFIXES.map( ( prefix ) => `${ prefix }-${ name }` );
}

/**
 * Binds a handler to every spelling of a shell event.
 *
 * @param el      Element to listen on.
 * @param name    Bare event name, e.g. `pick`.
 * @param handler Listener.
 * @return Detach function.
 */
export function onShellEvent(
	el: Element,
	name: string,
	handler: ( event: Event ) => void
): () => void {
	const names = shellEvents( name );

	for ( const event of names ) {
		el.addEventListener( event, handler );
	}

	return () => {
		for ( const event of names ) {
			el.removeEventListener( event, handler );
		}
	};
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
		toastHost.className = 'lz-toasts';
		toastHost.setAttribute( 'role', 'status' );
		toastHost.setAttribute( 'aria-live', 'polite' );
		document.body.appendChild( toastHost );
	}

	const node = document.createElement( 'div' );
	node.className = `lz-toast lz-toast--${ type }`;
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
