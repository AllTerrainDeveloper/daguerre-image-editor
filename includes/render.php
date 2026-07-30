<?php
/**
 * Turning a rendered blob into an attachment.
 *
 * The browser does the pixels; this file does the bookkeeping. It never touches the
 * original -- a save always creates a new attachment, linked back to the source, so
 * the file a user uploaded is exactly the file that stays on disk.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Maps an output MIME type to the file extension WordPress expects.
 *
 * @since 0.1.0
 *
 * @param string $mime_type Output MIME type.
 * @return string Extension without a leading dot, or an empty string when unknown.
 */
function lienzo_extension_for_mime( $mime_type ) {
	$map = array(
		'image/jpeg' => 'jpg',
		'image/png'  => 'png',
		'image/webp' => 'webp',
		'image/avif' => 'avif',
	);

	return isset( $map[ $mime_type ] ) ? $map[ $mime_type ] : '';
}

/**
 * Builds the filename for a rendered image.
 *
 * Appends `-edited` to the source's basename, matching the convention core's own
 * REST image editor uses so the relationship is legible in the uploads directory.
 *
 * An already-edited name is *not* stacked: editing `photo-edited.jpg` again yields
 * `photo-edited.jpg`, not `photo-edited-edited.jpg`. Uniqueness is then WordPress's
 * job via `wp_unique_filename()`, which appends a counter. Without the collapse,
 * a user who re-edits a few times ends up with `photo-edited-edited-edited.jpg` and
 * a filename that grows without bound.
 *
 * @since 0.1.0
 *
 * @param string $source_path Absolute path of the source image.
 * @param string $mime_type   Output MIME type.
 * @return string Filename with extension.
 */
function lienzo_edited_filename( $source_path, $mime_type ) {
	$extension = lienzo_extension_for_mime( $mime_type );
	$basename  = pathinfo( $source_path, PATHINFO_FILENAME );

	// Strip a trailing "-edited" or "-edited-3" so repeats do not stack.
	$basename = preg_replace( '/-edited(-\d+)?$/', '', $basename );

	if ( '' === $basename ) {
		$basename = 'image';
	}

	/**
	 * Filters the suffix appended to a rendered image's filename.
	 *
	 * @since 0.1.0
	 *
	 * @param string $suffix      Suffix, without a separator.
	 * @param string $source_path Absolute path of the source image.
	 */
	$suffix = apply_filters( 'lienzo_edited_suffix', 'edited', $source_path );

	return $basename . '-' . $suffix . '.' . $extension;
}

/**
 * Stores a rendered image as a new attachment.
 *
 * @since 0.1.0
 *
 * @param array $file      Uploaded file array from `WP_REST_Request::get_file_params()`.
 * @param int   $source_id Attachment the pixels were rendered from.
 * @param array $recipe    Validated recipe.
 * @return int|WP_Error New attachment ID, or an error.
 */
function lienzo_store_render( $file, $source_id, $recipe ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';

	$source_path = lienzo_get_source_path( $source_id );

	if ( is_wp_error( $source_path ) ) {
		return $source_path;
	}

	$max = lienzo_max_upload_bytes();

	if ( isset( $file['size'] ) && (int) $file['size'] > $max ) {
		return new WP_Error(
			'lienzo_render_too_large',
			sprintf(
				/* translators: %s: maximum upload size, already formatted. */
				__( 'The rendered image is larger than the %s limit for this site.', 'lienzo' ),
				size_format( $max )
			),
			array( 'status' => 413 )
		);
	}

	// Name the file ourselves from the source and the requested format. The client
	// does not get to choose the extension, because the extension is what WordPress
	// keys its MIME check on.
	$file['name'] = lienzo_edited_filename( $source_path, $recipe['output']['format'] );

	$sideloaded = wp_handle_sideload(
		$file,
		array(
			'test_form' => false,
			'mimes'     => lienzo_upload_mimes(),
		)
	);

	if ( isset( $sideloaded['error'] ) ) {
		return new WP_Error(
			'lienzo_sideload_failed',
			$sideloaded['error'],
			array( 'status' => 400 )
		);
	}

	// wp_handle_sideload() sniffs the real content type rather than trusting the
	// name we just gave it. Re-check the answer: a file that arrives claiming to be
	// a PNG but is something else must not become an attachment.
	if ( ! lienzo_is_supported_mime( $sideloaded['type'] ) ) {
		wp_delete_file( $sideloaded['file'] );

		return new WP_Error(
			'lienzo_render_bad_type',
			__( 'The rendered image was not a supported image type.', 'lienzo' ),
			array( 'status' => 400 )
		);
	}

	$source_post = get_post( $source_id );

	$attachment_id = wp_insert_attachment(
		array(
			'post_mime_type' => $sideloaded['type'],
			'post_title'     => $source_post ? $source_post->post_title : '',
			'post_content'   => '',
			'post_status'    => 'inherit',
		),
		$sideloaded['file'],
		0,
		true
	);

	if ( is_wp_error( $attachment_id ) ) {
		wp_delete_file( $sideloaded['file'] );

		return $attachment_id;
	}

	$metadata = wp_generate_attachment_metadata( $attachment_id, $sideloaded['file'] );

	// Record where this came from, using core's own provenance convention alongside
	// our own pointer, so tools that already understand `parent_image` keep working.
	$metadata['parent_image'] = array(
		'attachment_id' => $source_id,
		'file'          => _wp_relative_upload_path( $source_path ),
	);

	/**
	 * Filters the metadata of a freshly rendered image.
	 *
	 * Mirrors core's filter of the same name from its REST image editor, so a
	 * plugin already listening for edited images sees Lienzo's output too.
	 *
	 * @since 0.1.0
	 *
	 * @param array $metadata      Attachment metadata.
	 * @param int   $attachment_id New attachment ID.
	 * @param int   $source_id     Attachment the pixels came from.
	 */
	// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Deliberately reuses core's hook name so listeners already handling edited images see ours too.
	$metadata = apply_filters( 'wp_edited_image_metadata', $metadata, $attachment_id, $source_id );

	wp_update_attachment_metadata( $attachment_id, $metadata );

	/*
	 * A save is only re-editable from the original when the recipe describes all of
	 * it. Adjustments, crops and transforms are instructions and replay exactly; a
	 * painted, pasted or dropped layer is pixels, and those live nowhere but in the
	 * flattened file just written.
	 *
	 * Pointing such a save back at the original told the editor to rebuild from pixels
	 * that never had the paint on them: the file in the library was right, and opening
	 * it showed the original with an empty layer where the painting had been. So a save
	 * carrying pixels of its own becomes its own origin, and re-opening it shows exactly
	 * what was saved.
	 */
	if ( lienzo_recipe_is_reproducible( $recipe ) ) {
		update_post_meta( $attachment_id, LIENZO_SOURCE_META, $source_id );
		update_post_meta( $attachment_id, LIENZO_RECIPE_META, wp_json_encode( $recipe ) );
	}

	$alt = get_post_meta( $source_id, '_wp_attachment_image_alt', true );

	if ( '' !== $alt ) {
		update_post_meta( $attachment_id, '_wp_attachment_image_alt', wp_slash( $alt ) );
	}

	/**
	 * Fires after a rendered image has been stored.
	 *
	 * @since 0.1.0
	 *
	 * @param int   $attachment_id New attachment ID.
	 * @param int   $source_id     Attachment the pixels came from.
	 * @param array $recipe        Validated recipe.
	 */
	do_action( 'lienzo_image_saved', $attachment_id, $source_id, $recipe );

	return $attachment_id;
}

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
