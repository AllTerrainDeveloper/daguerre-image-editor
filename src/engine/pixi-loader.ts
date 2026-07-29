/**
 * Loads the vendored PixiJS build, reusing an existing one when there is one.
 *
 * Daguerre ships its own copy of Pixi at `assets/vendor/pixi.min.js` because
 * WordPress.org forbids loading code from a CDN. Desktop Mode also ships a copy and
 * exposes it as `window.PIXI`. Injecting a second Pixi 8 onto a page that already
 * has one is not merely wasteful -- the two instances share GPU resource registries
 * through globals, and tearing one down can invalidate textures belonging to the
 * other. So: check the global first, and only inject when nothing is there.
 */

import type * as PixiNamespace from 'pixi.js';

/** The Pixi module namespace, as exposed on `window.PIXI` by the UMD build. */
export type Pixi = typeof PixiNamespace;

/** In-flight or settled load, keyed by URL, so concurrent callers share one script tag. */
const pending = new Map< string, Promise< Pixi > >();

/**
 * Resolves with a usable Pixi namespace.
 *
 * @param url Absolute URL of the vendored Pixi build.
 * @return The Pixi namespace.
 * @throws {Error} When the script loads but does not define the global.
 */
export function loadPixi( url: string ): Promise< Pixi > {
	if ( window.PIXI ) {
		return Promise.resolve( window.PIXI );
	}

	const existing = pending.get( url );

	if ( existing ) {
		return existing;
	}

	const load = new Promise< Pixi >( ( resolve, reject ) => {
		// Another bundle may already have injected the same script and be waiting
		// on it; adopt that tag rather than racing a second one.
		const selector = `script[data-daguerre-vendor="${ CSS.escape( url ) }"]`;
		let script = document.querySelector< HTMLScriptElement >( selector );

		const settle = () => {
			if ( window.PIXI ) {
				resolve( window.PIXI );
			} else {
				reject(
					new Error(
						'PixiJS loaded but did not define window.PIXI. The vendored bundle may be corrupt.'
					)
				);
			}
		};

		if ( script ) {
			script.addEventListener( 'load', settle, { once: true } );
			script.addEventListener(
				'error',
				() => reject( new Error( `Could not load PixiJS from ${ url }` ) ),
				{ once: true }
			);
			return;
		}

		script = document.createElement( 'script' );
		script.src = url;
		script.async = true;
		script.dataset.daguerreVendor = url;
		script.addEventListener( 'load', settle, { once: true } );
		script.addEventListener(
			'error',
			() => reject( new Error( `Could not load PixiJS from ${ url }` ) ),
			{ once: true }
		);

		document.head.appendChild( script );
	} );

	// A failed load must not be cached, or a transient network error would poison
	// every later attempt for the lifetime of the page.
	load.catch( () => pending.delete( url ) );

	pending.set( url, load );

	return load;
}
