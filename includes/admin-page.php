<?php
/**
 * The full-screen editor admin page.
 *
 * Reachable at `upload.php?page=daguerre&attachment=<id>`. This is the simplest of
 * the editor's hosts and the one every other host is validated against: if mounting
 * works here it works in the media modal, the block editor and a Desktop Mode
 * native window, because all four call the same `daguerre.mount()`.
 *
 * @package Daguerre
 */

defined( 'ABSPATH' ) || exit;

add_action( 'admin_menu', 'daguerre_register_admin_page' );

/**
 * Registers the editor page under the Media menu.
 *
 * @since 0.1.0
 *
 * @return void
 */
function daguerre_register_admin_page() {
	$hook = add_submenu_page(
		'upload.php',
		__( 'Daguerre Image Editor', 'daguerre' ),
		__( 'Edit Photos', 'daguerre' ),
		'upload_files',
		'daguerre',
		'daguerre_render_admin_page'
	);

	if ( $hook ) {
		add_action( 'load-' . $hook, 'daguerre_load_admin_page' );
	}
}

/**
 * Prepares the editor page: enqueues assets and widens the screen.
 *
 * @since 0.1.0
 *
 * @return void
 */
function daguerre_load_admin_page() {
	daguerre_enqueue_editor();

	add_filter( 'admin_body_class', 'daguerre_admin_body_class' );
}

/**
 * Adds a body class the stylesheet uses to collapse the admin chrome.
 *
 * @since 0.1.0
 *
 * @param string $classes Space-separated body classes.
 * @return string Filtered body classes.
 */
function daguerre_admin_body_class( $classes ) {
	return $classes . ' daguerre-page';
}

/**
 * Renders the editor page.
 *
 * Emits a mount point and nothing else. The bundle reads the `attachment` query
 * argument and decides whether to open that image or show the library picker.
 *
 * @since 0.1.0
 *
 * @return void
 */
function daguerre_render_admin_page() {
	if ( ! current_user_can( 'upload_files' ) ) {
		wp_die( esc_html__( 'You are not allowed to edit images.', 'daguerre' ), '', array( 'response' => 403 ) );
	}

	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only navigation argument; the REST layer authorises the actual load.
	$attachment_id = isset( $_GET['attachment'] ) ? absint( $_GET['attachment'] ) : 0;

	printf(
		'<div class="daguerre-root" data-daguerre-root data-attachment="%d" data-host="page"></div>',
		(int) $attachment_id
	);
}
