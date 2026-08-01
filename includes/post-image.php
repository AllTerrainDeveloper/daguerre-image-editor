<?php
/**
 * Finding the image a post is "about".
 *
 * Dropping a product onto Lienzo should open the product's photo, not ask which of
 * the site's four thousand images you meant. Which image that is depends on the post
 * type, so the lookup is a filterable chain rather than a hardcoded featured-image
 * read: featured image, then WooCommerce's gallery, then anything an image is
 * attached to the post as.
 *
 * Deliberately generic over post type. WooCommerce is the first caller rather than a
 * special case -- a product's featured image is a featured image, and a plugin with
 * its own idea of "the post's image" hooks `lienzo_post_image_id` instead of asking
 * for a WooCommerce branch here.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Meta key WooCommerce stores the product gallery under.
 *
 * Read directly rather than through `wc_get_product()`, so the lookup works with
 * WooCommerce inactive and costs nothing when it is.
 */
const LIENZO_WC_GALLERY_META = '_product_image_gallery';

/**
 * Finds the editable image for a post.
 *
 * @since 0.2.0
 *
 * @param int $post_id Post to look at.
 * @return int Attachment ID, or 0 when the post has no editable image.
 */
function lienzo_post_image_id( $post_id ) {
	$post_id = (int) $post_id;
	$post    = $post_id > 0 ? get_post( $post_id ) : null;

	if ( ! $post ) {
		return 0;
	}

	$found = 0;

	foreach ( lienzo_post_image_candidates( $post ) as $candidate ) {
		if ( lienzo_is_editable_attachment( $candidate ) ) {
			$found = $candidate;
			break;
		}
	}

	/**
	 * Filters the image Lienzo opens for a post.
	 *
	 * Fires whether or not one was found, so a plugin can answer for a post type
	 * whose image lives somewhere Lienzo would never think to look.
	 *
	 * @since 0.2.0
	 *
	 * @param int     $found Attachment ID, or 0 when nothing was found.
	 * @param WP_Post $post  The post being opened.
	 */
	$found = (int) apply_filters( 'lienzo_post_image_id', $found, $post );

	return lienzo_is_editable_attachment( $found ) ? $found : 0;
}

/**
 * Every attachment worth considering for a post, best first.
 *
 * @since 0.2.0
 *
 * @param WP_Post $post Post to look at.
 * @return int[] Candidate attachment IDs, in preference order.
 */
function lienzo_post_image_candidates( $post ) {
	$candidates = array( (int) get_post_thumbnail_id( $post ) );

	// A product with no featured image but a populated gallery is common enough to
	// be worth the second look -- and the gallery's first image is the one the shop
	// falls back to displaying, so it is the one the merchant means.
	$gallery = get_post_meta( $post->ID, LIENZO_WC_GALLERY_META, true );

	if ( is_string( $gallery ) && '' !== $gallery ) {
		foreach ( explode( ',', $gallery ) as $id ) {
			$candidates[] = (int) trim( $id );
		}
	}

	// Anything uploaded to the post. Covers the older attach-to-post habit and post
	// types with no featured image support at all.
	$attached = get_children(
		array(
			'post_parent'    => $post->ID,
			'post_type'      => 'attachment',
			'post_mime_type' => 'image',
			'numberposts'    => 5,
			'orderby'        => 'menu_order ID',
			'order'          => 'ASC',
			'fields'         => 'ids',
		)
	);

	foreach ( (array) $attached as $id ) {
		$candidates[] = (int) $id;
	}

	/**
	 * Filters the candidate list before any of it is checked.
	 *
	 * @since 0.2.0
	 *
	 * @param int[]   $candidates Attachment IDs, in preference order.
	 * @param WP_Post $post       The post being opened.
	 */
	$candidates = (array) apply_filters( 'lienzo_post_image_candidates', $candidates, $post );

	return array_values( array_unique( array_filter( array_map( 'intval', $candidates ) ) ) );
}

/**
 * Whether an attachment exists and Lienzo can open it.
 *
 * @since 0.2.0
 *
 * @param int $attachment_id Attachment to test.
 * @return bool True when it is an image Lienzo supports.
 */
function lienzo_is_editable_attachment( $attachment_id ) {
	$attachment_id = (int) $attachment_id;

	if ( $attachment_id <= 0 || 'attachment' !== get_post_type( $attachment_id ) ) {
		return false;
	}

	return lienzo_is_supported_mime( get_post_mime_type( $attachment_id ) );
}

/**
 * Where an attachment sits in a post, so a save knows what to write back.
 *
 * A product's featured image and the third image of its gallery are both "the
 * product's image", but updating them is not the same operation. Recording which one
 * was opened is what lets the save put the edit back where it came from.
 *
 * @since 0.2.0
 *
 * @param int $post_id       Post the image belongs to.
 * @param int $attachment_id Attachment that was opened.
 * @return string One of 'thumbnail', 'gallery', or '' when it is neither.
 */
function lienzo_post_image_slot( $post_id, $attachment_id ) {
	$post_id       = (int) $post_id;
	$attachment_id = (int) $attachment_id;

	if ( (int) get_post_thumbnail_id( $post_id ) === $attachment_id ) {
		return 'thumbnail';
	}

	if ( in_array( $attachment_id, lienzo_gallery_ids( $post_id ), true ) ) {
		return 'gallery';
	}

	return '';
}

/**
 * The attachment IDs in a product's gallery.
 *
 * @since 0.2.0
 *
 * @param int $post_id Product to read.
 * @return int[] Attachment IDs, in gallery order.
 */
function lienzo_gallery_ids( $post_id ) {
	$gallery = get_post_meta( (int) $post_id, LIENZO_WC_GALLERY_META, true );

	if ( ! is_string( $gallery ) || '' === $gallery ) {
		return array();
	}

	$ids = array_map( 'intval', array_map( 'trim', explode( ',', $gallery ) ) );

	return array_values( array_filter( $ids ) );
}
