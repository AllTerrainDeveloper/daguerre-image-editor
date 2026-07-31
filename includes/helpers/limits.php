<?php
/**
 * What this site will let the editor allocate and upload.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Returns the maximum size, in bytes, Lienzo will accept for a rendered upload.
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
function lienzo_max_upload_bytes() {
	$limit = min( (int) wp_max_upload_size(), 64 * MB_IN_BYTES );

	/**
	 * Filters the maximum accepted size of a rendered image upload.
	 *
	 * @since 0.1.0
	 *
	 * @param int $limit Maximum size in bytes.
	 */
	return (int) apply_filters( 'lienzo_max_upload_bytes', $limit );
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
function lienzo_max_render_pixels() {
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
	return (int) apply_filters( 'lienzo_max_render_pixels', 80000000 );
}
