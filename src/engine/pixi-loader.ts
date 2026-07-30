/**
 * Gets PixiJS from Desktop Mode.
 *
 * Lienzo does not ship Pixi. Desktop Mode already vendors a copy and registers it in
 * its module registry as `pixijs`, so asking for it there is both smaller and safer
 * than carrying a second one: two Pixi 8 instances on a page share GPU resource
 * registries through globals, and tearing one down can invalidate textures belonging to
 * the other. There is no version to keep in step and no second copy to go stale.
 *
 * `wp.desktop.loadModules()` is idempotent and de-duplicates concurrent callers, so
 * several windows opening at once still load one script.
 */

import type * as PixiNamespace from 'pixi.js';

/** The Pixi module namespace, as exposed on `window.PIXI` by the UMD build. */
export type Pixi = typeof PixiNamespace;

/** The id Desktop Mode registers its Pixi build under. */
const MODULE_ID = 'pixijs';

/** The narrow part of the shell API this file needs. */
interface DesktopModules {
	loadModules?: ( ids: string[] ) => Promise< void >;
}

/**
 * Reads Desktop Mode's module loader, if the shell is on this page.
 */
function shell(): DesktopModules | undefined {
	return ( window as unknown as { wp?: { desktop?: DesktopModules } } ).wp?.desktop;
}

/**
 * Resolves with a usable Pixi namespace.
 *
 * @return The Pixi namespace.
 * @throws {Error} When Desktop Mode is absent, or its module fails to define the global.
 */
export async function loadPixi(): Promise< Pixi > {
	if ( window.PIXI ) {
		return window.PIXI;
	}

	const desktop = shell();

	if ( ! desktop?.loadModules ) {
		throw new Error(
			'Lienzo needs Desktop Mode: PixiJS comes from the desktop shell, which is not on this page.'
		);
	}

	await desktop.loadModules( [ MODULE_ID ] );

	if ( ! window.PIXI ) {
		throw new Error(
			'Desktop Mode loaded its PixiJS module but window.PIXI is still undefined.'
		);
	}

	return window.PIXI;
}
