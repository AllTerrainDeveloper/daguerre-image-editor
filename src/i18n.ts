/**
 * Translation helper.
 *
 * The bundle declares `wp-i18n` as a dependency, but the editor can also be mounted
 * by code paths that loaded it directly, so the global is feature-detected rather
 * than assumed. Falling back to the untranslated string keeps the UI working in
 * English instead of throwing.
 */

/**
 * Translates a string in the `lienzo` text domain.
 *
 * @param text Untranslated string.
 */
export function __( text: string ): string {
	return window.wp?.i18n?.__?.( text, 'lienzo' ) ?? text;
}

/**
 * Translates and interpolates.
 *
 * @param text Untranslated string containing printf placeholders.
 * @param args Values to interpolate.
 */
export function sprintf( text: string, ...args: unknown[] ): string {
	const translated = __( text );
	const impl = window.wp?.i18n?.sprintf;

	if ( impl ) {
		return impl( translated, ...args );
	}

	// Minimal fallback covering the %s and %d this plugin actually uses.
	let index = 0;

	return translated.replace( /%[sd]/g, () => String( args[ index++ ] ?? '' ) );
}
