/**
 * Gets PixiJS from Desktop Mode.
 *
 * Lienzo does not ship Pixi. Desktop Mode already vendors a copy and registers it in
 * its module registry as `pixijs`, so asking for it there is both smaller and safer
 * than carrying a second one: two Pixi 8 instances on a page share GPU resource
 * registries through globals, and tearing one down can invalidate textures belonging to
 * the other. There is no version to keep in step and no second copy to go stale.
 *
 * `loadModules()` is idempotent and de-duplicates concurrent callers, so several
 * windows opening at once still load one script.
 *
 * Both spellings of the namespace are read, for the reason set out in `platform.ts`:
 * OpenStation 0.9.9 renamed `wp.desktop` to `wp.os` and Lienzo ships to sites running
 * either version. This file used to read only `wp.desktop`, which meant that on a
 * current shell the loader looked exactly like a page with no shell at all and every
 * canvas failed to open with "Lienzo needs Desktop Mode".
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
 *
 * Deliberately NOT gated on `isActive()` the way `platform.ts` gates its adapters:
 * that flag answers "should this look like a desktop app", and the module registry
 * works whenever the shell bundle is present. Gating here would refuse to load Pixi
 * on a page where it is perfectly loadable.
 */
function shell(): DesktopModules | undefined {
	const wp = window.wp as
		| { os?: DesktopModules; desktop?: DesktopModules }
		| undefined;

	return wp?.os ?? wp?.desktop;
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
