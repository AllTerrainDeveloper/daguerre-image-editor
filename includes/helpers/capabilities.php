<?php
/**
 * Who may edit which image.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Determines whether an attachment can be opened in the editor by a given user.
 *
 * Checks, in order: the post exists and is an attachment, its MIME type is
 * supported, and the user has `edit_post` on it. `edit_post` is the meta
 * capability WordPress maps for attachments, and is what core's own image editor
 * checks in `wp_ajax_image_editor()`.
 *
 * @since 0.1.0
 *
 * @param int $attachment_id Attachment post ID.
 * @param int $user_id       Optional. User ID. Default 0, meaning the current user.
 * @return bool True when the user may edit this image.
 */
function lienzo_can_edit( $attachment_id, $user_id = 0 ) {
	$attachment_id = (int) $attachment_id;
	$post          = get_post( $attachment_id );

	if ( ! $post instanceof WP_Post || 'attachment' !== $post->post_type ) {
		return false;
	}

	if ( ! lienzo_is_supported_mime( $post->post_mime_type ) ) {
		return false;
	}

	$user_id = (int) $user_id;

	if ( $user_id > 0 ) {
		return user_can( $user_id, 'edit_post', $attachment_id );
	}

	return current_user_can( 'edit_post', $attachment_id );
}
