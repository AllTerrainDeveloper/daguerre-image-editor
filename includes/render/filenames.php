<?php
/**
 * Naming the file a render is stored as.
 *
 * A saved copy sits next to its original in the uploads directory, so the name has to
 * say what it is without colliding with anything already there.
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
