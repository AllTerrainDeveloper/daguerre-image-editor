<?php
/**
 * Which image types Lienzo can open.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Returns the image MIME types Lienzo can open and write.
 *
 * The list is deliberately narrower than WordPress's own upload whitelist: every
 * entry here must be decodable by `Image.decode()` in a browser *and* encodable by
 * `canvas.convertToBlob()`. GIF is excluded because rendering it through a canvas
 * silently flattens animation to a single frame.
 *
 * @since 0.1.0
 *
 * @return string[] Array of MIME type strings.
 */
function lienzo_supported_mime_types() {
	/**
	 * Filters the image MIME types Lienzo will open.
	 *
	 * Adding a type here does not make the browser able to decode it. Only add
	 * types you have verified round-trip through a canvas on your target browsers.
	 *
	 * @since 0.1.0
	 *
	 * @param string[] $mime_types Supported MIME types.
	 */
	return (array) apply_filters(
		'lienzo_supported_mime_types',
		array( 'image/jpeg', 'image/png', 'image/webp', 'image/avif' )
	);
}

/**
 * Determines whether a MIME type is one Lienzo can edit.
 *
 * @since 0.1.0
 *
 * @param string $mime_type MIME type to test.
 * @return bool True when the type is supported.
 */
function lienzo_is_supported_mime( $mime_type ) {
	return in_array( (string) $mime_type, lienzo_supported_mime_types(), true );
}
