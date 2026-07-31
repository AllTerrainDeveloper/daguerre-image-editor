/**
 * The configuration PHP localizes onto the page.
 */

import type { LienzoConfig } from '../types';

/**
 * Reads the configuration PHP localized onto the page.
 *
 * Throws rather than defaulting. A missing config means the bundle was enqueued
 * without `lienzo_enqueue_editor()`, and every REST call would fail on a bad root
 * and a missing nonce -- so failing here, once, with the reason, beats failing
 * later, repeatedly, without one.
 *
 * @throws {Error} When the bundle was loaded without its configuration.
 */
export function readConfig(): LienzoConfig {
	const config = ( window as unknown as { lienzoConfig?: LienzoConfig } )
		.lienzoConfig;

	if ( ! config ) {
		throw new Error(
			'Lienzo configuration is missing. The editor script was loaded without lienzo_enqueue_editor().'
		);
	}

	return config;
}
