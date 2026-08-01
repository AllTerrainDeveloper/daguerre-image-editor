<?php
/**
 * Putting an edited image back onto the post it came from.
 *
 * Never destructive. The edit is a *new* attachment -- Lienzo has no path that
 * rewrites an original, and this does not add one -- so "update the product" means
 * pointing the product at the copy and leaving the original in the library. That is
 * what makes the change reversible: the previous image is still there, and putting it
 * back is one more repoint.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Points a post's image at a different attachment.
 *
 * @since 0.2.0
 *
 * @param int    $post_id       Post to update.
 * @param int    $attachment_id Attachment to point at.
 * @param string $slot          Which image: 'thumbnail' or 'gallery'.
 * @param int    $replacing     Attachment being replaced. Required for a gallery
 *                              slot, which has no meaning without it.
 * @return true|WP_Error True on success.
 */
function lienzo_attach_to_post( $post_id, $attachment_id, $slot, $replacing = 0 ) {
	$post_id       = (int) $post_id;
	$attachment_id = (int) $attachment_id;
	$replacing     = (int) $replacing;

	if ( ! get_post( $post_id ) ) {
		return new WP_Error(
			'lienzo_attach_no_post',
			__( 'That post no longer exists.', 'lienzo' ),
			array( 'status' => 404 )
		);
	}

	if ( ! lienzo_is_editable_attachment( $attachment_id ) ) {
		return new WP_Error(
			'lienzo_attach_bad_image',
			__( 'That image cannot be attached to a post.', 'lienzo' ),
			array( 'status' => 400 )
		);
	}

	if ( 'gallery' === $slot ) {
		return lienzo_replace_in_gallery( $post_id, $attachment_id, $replacing );
	}

	$set = set_post_thumbnail( $post_id, $attachment_id );

	if ( ! $set ) {
		return new WP_Error(
			'lienzo_attach_failed',
			__( 'The image could not be set on that post.', 'lienzo' ),
			array( 'status' => 500 )
		);
	}

	/**
	 * Fires after Lienzo repoints a post's image.
	 *
	 * @since 0.2.0
	 *
	 * @param int    $post_id       Post that was updated.
	 * @param int    $attachment_id Attachment it now points at.
	 * @param string $slot          Which image was updated.
	 */
	do_action( 'lienzo_post_image_updated', $post_id, $attachment_id, 'thumbnail' );

	return true;
}

/**
 * Swaps one image for another in a product gallery, keeping its position.
 *
 * Position matters: a gallery is an ordered list a merchant arranged deliberately,
 * and appending the edit to the end while removing the original would silently
 * reshuffle the product page.
 *
 * @since 0.2.0
 *
 * @param int $post_id       Product to update.
 * @param int $attachment_id Attachment to put in.
 * @param int $replacing     Attachment to take out.
 * @return true|WP_Error True on success.
 */
function lienzo_replace_in_gallery( $post_id, $attachment_id, $replacing ) {
	$ids = lienzo_gallery_ids( $post_id );
	$at  = array_search( $replacing, $ids, true );

	if ( false === $at ) {
		return new WP_Error(
			'lienzo_attach_not_in_gallery',
			__( 'That image is no longer in the product gallery.', 'lienzo' ),
			array( 'status' => 409 )
		);
	}

	$ids[ $at ] = $attachment_id;

	update_post_meta( $post_id, LIENZO_WC_GALLERY_META, implode( ',', array_unique( $ids ) ) );

	/** This action is documented in includes/post-attach.php */
	do_action( 'lienzo_post_image_updated', $post_id, $attachment_id, 'gallery' );

	return true;
}

/**
 * Whether the current user may repoint a post's image.
 *
 * Two capabilities, and both matter: editing the post is what the change actually
 * does, and uploading files is what produced the image being pointed at.
 *
 * @since 0.2.0
 *
 * @param int $post_id Post to test.
 * @return bool True when the current user may update it.
 */
function lienzo_can_attach_to_post( $post_id ) {
	return current_user_can( 'upload_files' ) && current_user_can( 'edit_post', (int) $post_id );
}
