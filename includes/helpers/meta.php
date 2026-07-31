<?php
/**
 * Reading Lienzo\'s post meta, including under its former key.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads a plugin meta value, falling back to the key it used before the rename.
 *
 * Only ever reads the legacy key; saving always writes the current one, so an edit
 * re-saved under the new name quietly migrates itself.
 *
 * @since 0.1.0
 *
 * @param int    $attachment_id Attachment to read.
 * @param string $key           Current meta key.
 * @param string $legacy        Key used before the plugin was renamed.
 * @return mixed The stored value, or an empty string when neither key is set.
 */
function lienzo_get_meta( $attachment_id, $key, $legacy ) {
	$value = get_post_meta( (int) $attachment_id, $key, true );

	if ( '' !== $value && null !== $value && false !== $value ) {
		return $value;
	}

	return get_post_meta( (int) $attachment_id, $legacy, true );
}
