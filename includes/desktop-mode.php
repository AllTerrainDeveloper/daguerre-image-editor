<?php
/**
 * Desktop Mode integration.
 *
 * Every registration in this file is additive and sits behind a `function_exists()`
 * gate. Lienzo is a standalone plugin: with Desktop Mode absent, nothing here
 * runs and all four standalone hosts continue to work untouched. There is
 * deliberately no `Requires Plugins: desktop-mode` header on the bootstrap.
 *
 * The window, icon, file opener and drag targets land in Phase 4. What exists now
 * is the detection helper the rest of the plugin uses to decide whether to offer
 * desktop affordances.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Determines whether Desktop Mode is installed and switched on for the current user.
 *
 * Two separate questions, and both matter. `function_exists()` answers "is the
 * plugin active"; `openstation_is_enabled()` answers "has this particular user
 * opted in", since Desktop Mode is a per-user preference rather than a site-wide
 * one. Only when both hold should Lienzo present itself as a desktop app.
 *
 * @since 0.1.0
 *
 * @return bool True when Desktop Mode is active for the current user.
 */
function lienzo_is_desktop_mode_active() {
	if ( ! lienzo_shell_has( 'register_window' ) || ! lienzo_shell_has( 'is_enabled' ) ) {
		return false;
	}

	return (bool) lienzo_shell_call( 'is_enabled' );
}

add_action( 'plugins_loaded', 'lienzo_maybe_init_desktop_mode', 20 );

/**
 * Wires up the Desktop Mode integrations, if Desktop Mode is there to wire into.
 *
 * The gate is on the registration function rather than on a version constant, so a
 * Desktop Mode release that renames itself or drops the API degrades to "no desktop
 * integration" instead of a fatal error on every request.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_maybe_init_desktop_mode() {
	if ( ! lienzo_shell_has( 'register_window' ) ) {
		return;
	}

	add_action( 'init', 'lienzo_register_desktop_window', 20 );

	// Registered against both spellings. Which one fires depends on the shell's
	// version, and a listener for a hook that never fires costs nothing.
	foreach ( lienzo_shell_hooks( 'mode_init' ) as $hook ) {
		add_action( $hook, 'lienzo_enqueue_in_shell' );
	}

	foreach ( lienzo_shell_hooks( 'my_wordpress_preview_actions' ) as $hook ) {
		add_filter( $hook, 'lienzo_my_wordpress_action' );
	}
}

/**
 * Registers the native window, its wallpaper icon, and the file opener.
 *
 * A *native* window rather than an iframe: rendering into the shell's own DOM is
 * what gives the editor access to the desktop's drag bridge, so a photo can be
 * dragged onto it and a saved result dragged back out into a Gutenberg window.
 * Neither is possible across an iframe boundary.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_register_desktop_window() {
	$registered = lienzo_shell_call(
		'register_window',
		'lienzo',
		array(
			'title'        => __( 'Lienzo.', 'lienzo' ),
			'icon'         => 'dashicons-format-image',
			'template'     => 'lienzo_render_desktop_template',
			'script'       => 'lienzo',
			'style'        => 'lienzo',
			'width'        => 1100,
			'height'       => 720,
			'min_width'    => 640,
			'min_height'   => 480,
			'placement'    => 'dock',
			'capabilities' => array( 'upload_files' ),
		)
	);

	if ( is_wp_error( $registered ) ) {
		return;
	}

	if ( lienzo_shell_has( 'register_icon' ) ) {
		lienzo_shell_call(
			'register_icon',
			'lienzo',
			array(
				'title'        => __( 'Lienzo.', 'lienzo' ),
				'icon'         => 'dashicons-format-image',
				'window'       => 'lienzo',
				'position'     => 30,
				'capabilities' => array( 'upload_files' ),
			)
		);
	}

	if ( lienzo_shell_has( 'register_file_opener' ) ) {
		lienzo_shell_call(
			'register_file_opener',
			'lienzo',
			array(
				'label'        => __( 'Edit in Lienzo', 'lienzo' ),
				'types'        => array( 'attachment' ),
				'is_default'   => false,
				'sort'         => 15,
				'script'       => 'lienzo',
				'capabilities' => array( 'upload_files' ),
			)
		);
	}
}

/**
 * Emits the native window's body markup.
 *
 * The shell clones this into the window before calling the JavaScript render
 * callback, so the callback enhances existing markup rather than building from
 * nothing -- which means the window paints something immediately instead of
 * flashing empty while the bundle boots.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_render_desktop_template() {
	echo '<div class="lienzo-root" data-lienzo-root data-host="window"></div>';
}

/**
 * Loads the editor assets into the Desktop Mode shell.
 *
 * `openstation_mode_init` fires while the shell itself is rendering, which is the
 * documented place for a plugin to enqueue shell-level code. Registering the script
 * handle on the window is not enough on its own: the shell enqueues the handle but
 * never runs our `wp_localize_script()`, so the bundle would boot without its
 * configuration.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_enqueue_in_shell() {
	if ( ! current_user_can( 'upload_files' ) ) {
		return;
	}

	lienzo_enqueue_editor();
}

/**
 * Adds "Edit in Lienzo" to the My WordPress media preview rail.
 *
 * @since 0.1.0
 *
 * @param array $actions Registered preview actions.
 * @return array Filtered actions.
 */
function lienzo_my_wordpress_action( $actions ) {
	$actions[] = array(
		'id'         => 'lienzo',
		'label'      => __( 'Edit in Lienzo', 'lienzo' ),
		'icon'       => 'dashicons-format-image',
		'capability' => 'upload_files',
		'mime'       => '^image/',
		'sections'   => array( 'media' ),
		'script'     => 'lienzo',
	);

	return $actions;
}

/**
 * Determines whether the current request is rendering inside a Desktop Mode window.
 *
 * Chromeless requests are the admin page loaded inside a window iframe, with the
 * admin bar and menu suppressed. The editor uses this to drop its own page chrome
 * and fill the window body.
 *
 * @since 0.1.0
 *
 * @return bool True when rendering inside a Desktop Mode window iframe.
 */
function lienzo_is_desktop_mode_chromeless() {
	if ( ! lienzo_shell_has( 'is_chromeless_request' ) ) {
		return false;
	}

	return (bool) lienzo_shell_call( 'is_chromeless_request' );
}
