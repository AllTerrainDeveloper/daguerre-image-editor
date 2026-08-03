<?php
/**
 * The Desktop Mode requirement.
 *
 * Lienzo is a Desktop Mode application, not a standalone plugin that happens to
 * integrate with one. It renders into the shell's own DOM, borrows the shell's PixiJS
 * and its `<wpd-*>` components, and opens as a native window. None of that has a
 * meaningful fallback: an editor with no Pixi cannot draw a pixel.
 *
 * So the requirement is checked once, early, and the rest of the plugin only loads
 * when it is satisfied. `Requires Plugins` in the plugin header covers installation;
 * this covers the case where Desktop Mode is installed but deactivated afterwards,
 * which WordPress permits.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether Desktop Mode is present and able to host a native window.
 *
 * Tested by capability rather than by plugin slug: what matters is that the functions
 * being called exist, not what the directory holding them is named. A fork, a rename
 * or a bundled copy all work; a Desktop Mode too old to register native windows
 * correctly does not, and says so.
 *
 * @since 0.1.0
 *
 * @return bool True when the plugin can run.
 */
function lienzo_requirements_met() {
	return lienzo_shell_has( 'register_window' ) && lienzo_shell_has( 'is_enabled' );
}

add_action( 'admin_notices', 'lienzo_requirements_notice' );

/**
 * Explains why nothing happened, on the plugins screen.
 *
 * Only on that screen: a notice on every admin page would be nagging, and the plugins
 * screen is where someone who just activated Lienzo is standing.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_requirements_notice() {
	$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;

	if ( ! $screen || 'plugins' !== $screen->id || lienzo_requirements_met() ) {
		return;
	}

	if ( ! current_user_can( 'activate_plugins' ) ) {
		return;
	}

	printf(
		'<div class="notice notice-warning"><p><strong>%1$s</strong> %2$s</p></div>',
		esc_html__( 'Lienzo needs Desktop Mode.', 'lienzo' ),
		esc_html__(
			'The image editor runs as a desktop window and uses the desktop shell to render. Activate Desktop Mode to use it.',
			'lienzo'
		)
	);
}
