<?php
/**
 * Entry points into the editor from the Media Library.
 *
 * These are the cheap, PHP-only routes: a row action in list mode and a button on
 * the attachment edit screen. Both simply link to the full-screen editor page.
 *
 * The richer surfaces -- a button inside the grid modal and one on the block
 * editor's image toolbar -- need JavaScript to patch Backbone views and register a
 * block filter, and land in Phase 3.
 *
 * @package Daguerre
 */

defined( 'ABSPATH' ) || exit;

add_filter( 'media_row_actions', 'daguerre_media_row_action', 10, 2 );
add_action( 'attachment_submitbox_misc_actions', 'daguerre_attachment_edit_button', 20 );
add_action( 'admin_enqueue_scripts', 'daguerre_enqueue_on_media_screens' );
add_action( 'enqueue_block_editor_assets', 'daguerre_enqueue_for_block_editor' );

/**
 * Loads the editor on screens where the media modal can appear.
 *
 * The modal is reachable from the media library, the post editors, and the
 * customizer, but not from most of wp-admin -- loading a 28KB bundle on Settings
 * pages to add a button that can never render would be careless.
 *
 * @since 0.1.0
 *
 * @param string $hook_suffix Current admin page.
 * @return void
 */
function daguerre_enqueue_on_media_screens( $hook_suffix ) {
	if ( ! current_user_can( 'upload_files' ) ) {
		return;
	}

	$screens = array( 'upload.php', 'post.php', 'post-new.php' );

	/**
	 * Filters the admin screens the editor bundle loads on.
	 *
	 * Add a screen here if a plugin surfaces the media modal somewhere unusual.
	 *
	 * @since 0.1.0
	 *
	 * @param string[] $screens     Admin page hook suffixes.
	 * @param string   $hook_suffix Current admin page.
	 */
	$screens = (array) apply_filters( 'daguerre_media_screens', $screens, $hook_suffix );

	if ( ! in_array( $hook_suffix, $screens, true ) ) {
		return;
	}

	daguerre_enqueue_editor();
}

/**
 * Loads the editor in the block editor, for the image block's toolbar button.
 *
 * @since 0.1.0
 *
 * @return void
 */
function daguerre_enqueue_for_block_editor() {
	if ( ! current_user_can( 'upload_files' ) ) {
		return;
	}

	daguerre_enqueue_editor();

	// The toolbar button is built with wp.element rather than JSX, so these are
	// runtime globals rather than bundled imports -- but they still have to be on
	// the page before our bundle runs.
	wp_enqueue_script( 'wp-block-editor' );
	wp_enqueue_script( 'wp-components' );
	wp_enqueue_script( 'wp-hooks' );
	wp_enqueue_script( 'wp-element' );
}

/**
 * Adds "Edit with Daguerre" to the Media Library list-table row actions.
 *
 * Only appears for images Daguerre can actually open, so the link is never a
 * promise the editor cannot keep.
 *
 * @since 0.1.0
 *
 * @param string[] $actions Row action links keyed by action name.
 * @param WP_Post  $post    Attachment being listed.
 * @return string[] Filtered row actions.
 */
function daguerre_media_row_action( $actions, $post ) {
	if ( ! daguerre_can_edit( $post->ID ) ) {
		return $actions;
	}

	$actions['daguerre'] = sprintf(
		'<a href="%s">%s</a>',
		esc_url( daguerre_editor_url( $post->ID ) ),
		esc_html__( 'Edit with Daguerre', 'daguerre' )
	);

	return $actions;
}

/**
 * Adds an "Edit with Daguerre" button to the attachment edit screen.
 *
 * Sits in the Publish box beside core's own actions, which is where someone
 * already looking at a single attachment expects to find things to do to it.
 *
 * @since 0.1.0
 *
 * @param WP_Post $post Attachment being edited.
 * @return void
 */
function daguerre_attachment_edit_button( $post ) {
	if ( ! daguerre_can_edit( $post->ID ) ) {
		return;
	}

	printf(
		'<div class="misc-pub-section misc-pub-daguerre"><a class="button" href="%s">%s</a></div>',
		esc_url( daguerre_editor_url( $post->ID ) ),
		esc_html__( 'Edit with Daguerre', 'daguerre' )
	);
}
