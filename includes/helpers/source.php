<?php
/**
 * Finding the pixels behind an attachment.
 *
 * A saved copy records the attachment it was edited from, so re-opening one edits the
 * original\'s pixels rather than a re-render of a re-render.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Resolves the attachment whose pixels should be loaded into the editor.
 *
 * Lienzo never edits already-rendered output. When an attachment carries a
 * `_lienzo_source` pointer it was produced by a previous save, so re-opening it
 * loads the *original* instead. That is what keeps repeated edits first-generation
 * rather than compounding quantisation loss on every round trip.
 *
 * Falls back to the passed ID when the pointer is missing or the target has since
 * been deleted.
 *
 * @since 0.1.0
 *
 * @param int $attachment_id Attachment post ID the user asked to edit.
 * @return int Attachment ID to load pixels from.
 */
function lienzo_resolve_source_id( $attachment_id ) {
	$attachment_id = (int) $attachment_id;
	$source_id     = (int) lienzo_get_meta( $attachment_id, LIENZO_SOURCE_META, LIENZO_LEGACY_SOURCE_META );

	if ( $source_id > 0 && $source_id !== $attachment_id ) {
		$source = get_post( $source_id );

		if ( $source instanceof WP_Post && 'attachment' === $source->post_type ) {
			return $source_id;
		}
	}

	return $attachment_id;
}

/**
 * Returns an absolute filesystem path to the full-size original of an attachment.
 *
 * Prefers `wp_get_original_image_path()` so edits always start from the
 * pre-`big_image_size_threshold` pixels rather than the `-scaled` derivative.
 *
 * @since 0.1.0
 *
 * @param int $attachment_id Attachment post ID.
 * @return string|WP_Error Absolute readable path, or WP_Error on failure.
 */
function lienzo_get_source_path( $attachment_id ) {
	$attachment_id = (int) $attachment_id;

	$path = wp_get_original_image_path( $attachment_id );

	if ( ! $path ) {
		$path = get_attached_file( $attachment_id );
	}

	if ( ! $path || ! is_string( $path ) ) {
		return new WP_Error(
			'lienzo_no_source_file',
			__( 'The original image file for this attachment could not be located.', 'lienzo' ),
			array( 'status' => 404 )
		);
	}

	if ( ! file_exists( $path ) || ! is_readable( $path ) ) {
		return new WP_Error(
			'lienzo_source_unreadable',
			__( 'The original image file exists in the database but is not readable on disk.', 'lienzo' ),
			array( 'status' => 404 )
		);
	}

	return $path;
}
