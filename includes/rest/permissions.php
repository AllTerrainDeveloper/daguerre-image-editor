<?php
/**
 * Who may call what.
 *
 * Split out because these are the security boundary: a permission callback that is
 * wrong is a permission callback nobody read closely enough, and they read more
 * closely together than scattered between the handlers they guard.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Shared permission callback for every Lienzo route.
 *
 * Distinguishes "not logged in" (401) from "logged in but not allowed" (403) so the
 * client can tell a expired session apart from a genuine permission problem and
 * offer the right recovery.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return true|WP_Error True when allowed, WP_Error otherwise.
 */
function lienzo_rest_permission( $request ) {
	if ( ! is_user_logged_in() ) {
		return new WP_Error(
			'lienzo_not_logged_in',
			__( 'You must be logged in to edit images.', 'lienzo' ),
			array( 'status' => 401 )
		);
	}

	$attachment_id = (int) $request['id'];

	if ( ! lienzo_can_edit( $attachment_id ) ) {
		return new WP_Error(
			'lienzo_cannot_edit',
			__( 'You are not allowed to edit this image.', 'lienzo' ),
			array( 'status' => 403 )
		);
	}

	return true;
}

/**
 * Permission callback for routes that create an attachment.
 *
 * Requires `upload_files` *in addition to* the read permission. Saving does not
 * modify the source, but it does add a file to the media library, and that is a
 * separate capability -- an author who may edit one particular image is not
 * necessarily someone the site wants creating new uploads. Core's own image-edit
 * endpoint draws the line in the same place.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return true|WP_Error True when allowed, WP_Error otherwise.
 */
function lienzo_rest_save_permission( $request ) {
	$allowed = lienzo_rest_permission( $request );

	if ( is_wp_error( $allowed ) ) {
		return $allowed;
	}

	if ( ! current_user_can( 'upload_files' ) ) {
		return new WP_Error(
			'lienzo_cannot_upload',
			__( 'You are not allowed to add files to the media library.', 'lienzo' ),
			array( 'status' => 403 )
		);
	}

	return true;
}

/**
 * Permission callback for the preset routes.
 *
 * Presets are per-user and carry no image data, so the only question is whether
 * this is a real logged-in user who can use the editor at all. There is no
 * per-attachment check because a preset is not attached to anything.
 *
 * @since 0.1.0
 *
 * @return true|WP_Error True when allowed, WP_Error otherwise.
 */
function lienzo_rest_presets_permission() {
	if ( ! is_user_logged_in() ) {
		return new WP_Error(
			'lienzo_not_logged_in',
			__( 'You must be logged in to use presets.', 'lienzo' ),
			array( 'status' => 401 )
		);
	}

	if ( ! current_user_can( 'upload_files' ) ) {
		return new WP_Error(
			'lienzo_cannot_edit',
			__( 'You are not allowed to edit images.', 'lienzo' ),
			array( 'status' => 403 )
		);
	}

	return true;
}
