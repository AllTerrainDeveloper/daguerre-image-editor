<?php
/**
 * Shared helpers.
 *
 * @package Daguerre
 */

defined( 'ABSPATH' ) || exit;

/**
 * Returns the image MIME types Daguerre can open and write.
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
function daguerre_supported_mime_types() {
	/**
	 * Filters the image MIME types Daguerre will open.
	 *
	 * Adding a type here does not make the browser able to decode it. Only add
	 * types you have verified round-trip through a canvas on your target browsers.
	 *
	 * @since 0.1.0
	 *
	 * @param string[] $mime_types Supported MIME types.
	 */
	return (array) apply_filters(
		'daguerre_supported_mime_types',
		array( 'image/jpeg', 'image/png', 'image/webp', 'image/avif' )
	);
}

/**
 * Determines whether a MIME type is one Daguerre can edit.
 *
 * @since 0.1.0
 *
 * @param string $mime_type MIME type to test.
 * @return bool True when the type is supported.
 */
function daguerre_is_supported_mime( $mime_type ) {
	return in_array( (string) $mime_type, daguerre_supported_mime_types(), true );
}

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
function daguerre_can_edit( $attachment_id, $user_id = 0 ) {
	$attachment_id = (int) $attachment_id;
	$post          = get_post( $attachment_id );

	if ( ! $post instanceof WP_Post || 'attachment' !== $post->post_type ) {
		return false;
	}

	if ( ! daguerre_is_supported_mime( $post->post_mime_type ) ) {
		return false;
	}

	$user_id = (int) $user_id;

	if ( $user_id > 0 ) {
		return user_can( $user_id, 'edit_post', $attachment_id );
	}

	return current_user_can( 'edit_post', $attachment_id );
}

/**
 * Resolves the attachment whose pixels should be loaded into the editor.
 *
 * Daguerre never edits already-rendered output. When an attachment carries a
 * `_daguerre_source` pointer it was produced by a previous save, so re-opening it
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
function daguerre_resolve_source_id( $attachment_id ) {
	$attachment_id = (int) $attachment_id;
	$source_id     = (int) get_post_meta( $attachment_id, DAGUERRE_SOURCE_META, true );

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
function daguerre_get_source_path( $attachment_id ) {
	$attachment_id = (int) $attachment_id;

	$path = wp_get_original_image_path( $attachment_id );

	if ( ! $path ) {
		$path = get_attached_file( $attachment_id );
	}

	if ( ! $path || ! is_string( $path ) ) {
		return new WP_Error(
			'daguerre_no_source_file',
			__( 'The original image file for this attachment could not be located.', 'daguerre' ),
			array( 'status' => 404 )
		);
	}

	if ( ! file_exists( $path ) || ! is_readable( $path ) ) {
		return new WP_Error(
			'daguerre_source_unreadable',
			__( 'The original image file exists in the database but is not readable on disk.', 'daguerre' ),
			array( 'status' => 404 )
		);
	}

	return $path;
}

/**
 * Returns the maximum size, in bytes, Daguerre will accept for a rendered upload.
 *
 * Defaults to the smaller of the PHP upload limit and 64MB. A full-resolution PNG
 * render of a 6000x4000 photograph can legitimately exceed 40MB, so this ceiling
 * needs headroom, but it must still bound what an authenticated user can push
 * through the render endpoint in a single request.
 *
 * @since 0.1.0
 *
 * @return int Maximum upload size in bytes.
 */
function daguerre_max_upload_bytes() {
	$limit = min( (int) wp_max_upload_size(), 64 * MB_IN_BYTES );

	/**
	 * Filters the maximum accepted size of a rendered image upload.
	 *
	 * @since 0.1.0
	 *
	 * @param int $limit Maximum size in bytes.
	 */
	return (int) apply_filters( 'daguerre_max_upload_bytes', $limit );
}

/**
 * Returns the largest image, in total pixels, the browser will try to render.
 *
 * Saving renders the edit at full resolution into a GPU render target, which costs
 * four bytes per pixel. A 100 megapixel image therefore wants a single 400MB
 * allocation and takes the browser tab down with it. The editor refuses past this
 * ceiling and says so, which is a great deal better than a crash after the user has
 * already done the work.
 *
 * The default of 80 megapixels comfortably covers any current full-frame camera.
 *
 * @since 0.1.0
 *
 * @return int Maximum pixels per render.
 */
function daguerre_max_render_pixels() {
	/**
	 * Filters the largest image the browser will try to render.
	 *
	 * Lower this on sites whose users are on memory-constrained devices; raise it
	 * only if you know the clients have the GPU memory to match.
	 *
	 * @since 0.1.0
	 *
	 * @param int $pixels Maximum pixels per render.
	 */
	return (int) apply_filters( 'daguerre_max_render_pixels', 80000000 );
}

/**
 * Builds the admin URL that opens an attachment in the full-screen editor page.
 *
 * @since 0.1.0
 *
 * @param int $attachment_id Attachment post ID.
 * @return string Escaped-safe admin URL.
 */
function daguerre_editor_url( $attachment_id ) {
	return add_query_arg(
		array(
			'page'       => 'daguerre',
			'attachment' => (int) $attachment_id,
		),
		admin_url( 'upload.php' )
	);
}
