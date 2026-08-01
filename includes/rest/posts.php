<?php
/**
 * The post endpoints: what image a post is about, and putting an edit back on it.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether the current user may read a post's image through this route.
 *
 * `edit_post` rather than `read_post`: the route exists so the image can be edited
 * and written back, and offering to open something the user could never save would
 * be a trap.
 *
 * @since 0.2.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return true|WP_Error True when allowed.
 */
function lienzo_rest_post_permission( $request ) {
	$post_id = (int) $request['id'];

	if ( ! get_post( $post_id ) ) {
		return new WP_Error(
			'lienzo_no_post',
			__( 'That post no longer exists.', 'lienzo' ),
			array( 'status' => 404 )
		);
	}

	if ( ! lienzo_can_attach_to_post( $post_id ) ) {
		return new WP_Error(
			'lienzo_cannot_edit_post',
			__( 'You are not allowed to edit that post.', 'lienzo' ),
			array( 'status' => rest_authorization_required_code() )
		);
	}

	return true;
}

/**
 * Answers which image a post is about.
 *
 * @since 0.2.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error The image and the post context, or an error.
 */
function lienzo_rest_get_post_image( $request ) {
	$post_id       = (int) $request['id'];
	$post          = get_post( $post_id );
	$attachment_id = lienzo_post_image_id( $post_id );

	if ( ! $attachment_id ) {
		return new WP_Error(
			'lienzo_post_no_image',
			__( 'That post has no image Lienzo can open.', 'lienzo' ),
			array( 'status' => 404 )
		);
	}

	$type = get_post_type_object( $post->post_type );

	return rest_ensure_response(
		array(
			'attachmentId' => $attachment_id,
			'postId'       => $post_id,
			'postTitle'    => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
			'postType'     => $post->post_type,
			// The singular label, so the editor can say "Update the product" rather
			// than guessing from a slug that might be `cpt-product` or `my_thing`.
			'postTypeLabel' => $type ? $type->labels->singular_name : $post->post_type,
			'slot'         => lienzo_post_image_slot( $post_id, $attachment_id ),
			'canAttach'    => lienzo_can_attach_to_post( $post_id ),
		)
	);
}

/**
 * Points a post's image at an attachment.
 *
 * @since 0.2.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error The updated slot, or an error.
 */
function lienzo_rest_attach_post_image( $request ) {
	$post_id = (int) $request['id'];
	$slot    = (string) $request['slot'];

	$attached = lienzo_attach_to_post(
		$post_id,
		(int) $request['attachmentId'],
		'' !== $slot ? $slot : 'thumbnail',
		(int) $request['replacing']
	);

	if ( is_wp_error( $attached ) ) {
		return $attached;
	}

	return rest_ensure_response(
		array(
			'postId'       => $post_id,
			'attachmentId' => (int) $request['attachmentId'],
			'slot'         => '' !== $slot ? $slot : 'thumbnail',
		)
	);
}
