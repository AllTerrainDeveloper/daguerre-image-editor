<?php
/**
 * Which MIME types the uploader will accept from us.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Returns the MIME whitelist passed to `wp_handle_sideload()`.
 *
 * Deliberately narrower than the site's upload whitelist: this endpoint accepts
 * canvas output, and canvas output is only ever one of these.
 *
 * @since 0.1.0
 *
 * @return array<string, string> Extension pattern to MIME type.
 */
function lienzo_upload_mimes() {
	$mimes = array();

	foreach ( lienzo_supported_mime_types() as $mime_type ) {
		$extension = lienzo_extension_for_mime( $mime_type );

		if ( ! $extension ) {
			continue;
		}

		// JPEG has two accepted spellings on disk.
		$pattern = 'jpg' === $extension ? 'jpg|jpeg' : $extension;

		$mimes[ $pattern ] = $mime_type;
	}

	return $mimes;
}
