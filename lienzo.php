<?php
/**
 * Plugin Name:       Lienzo.
 * Plugin URI:        https://github.com/AllTerrainDeveloper/lienzo
 * Description:       A modern, non-destructive image editor for the WordPress media library. Exposure, colour and tone adjustments rendered on the GPU, in the browser.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Daniel Lopez
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       lienzo
 * Domain Path:       /languages
 * Requires Plugins:  desktop-mode
 *
 * Lienzo is a Desktop Mode application. It runs as a native window inside the
 * desktop shell -- rendering into the shell's own DOM rather than into an iframe --
 * and takes its PixiJS from the shell's module registry instead of shipping a second
 * copy. Two Pixi 8 instances on one page share GPU resource registries through
 * globals, so one is not merely smaller but safer.
 *
 * Running natively is what gives the editor the shell's `<wpd-*>` components, its
 * drag bridge and its window chrome. None of that is reachable from inside a
 * chromeless iframe, where no component is registered at all.
 *
 * Everything therefore sits behind `lienzo_can_run()`: with Desktop Mode absent or
 * switched off for the user, the plugin registers nothing but the notice explaining
 * why.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

define( 'LIENZO_VERSION', '0.1.0' );
define( 'LIENZO_FILE', __FILE__ );
define( 'LIENZO_DIR', plugin_dir_path( __FILE__ ) );
define( 'LIENZO_URL', plugin_dir_url( __FILE__ ) );
define( 'LIENZO_REST_NAMESPACE', 'lienzo/v1' );

/**
 * Id of the base image layer, shared with the TypeScript twin in `model/document.ts`.
 */
define( 'LIENZO_BASE_LAYER_ID', 'base' );

/**
 * Post meta key holding the serialized edit recipe on a rendered attachment.
 */
define( 'LIENZO_RECIPE_META', '_lienzo_recipe' );

/**
 * Post meta key holding the ID of the attachment the pixels originally came from.
 */
define( 'LIENZO_SOURCE_META', '_lienzo_source' );

/**
 * The keys these two were called before the plugin was renamed.
 *
 * Read as a fallback and never written. An image edited under the old name still holds
 * its recipe there, and a rename is no reason for someone's saved edit to stop
 * re-opening -- the pixels would still be theirs, but every slider would be back at
 * zero and the link to the original lost.
 */
define( 'LIENZO_LEGACY_RECIPE_META', '_daguerre_recipe' );
define( 'LIENZO_LEGACY_SOURCE_META', '_daguerre_source' );

require_once LIENZO_DIR . 'includes/requirements.php';

add_action( 'plugins_loaded', 'lienzo_boot', 5 );

/**
 * Loads the plugin, once it is known that Desktop Mode is there to host it.
 *
 * On `plugins_loaded` rather than at file scope, and that is not a detail: plugins are
 * loaded in alphabetical order, so `lienzo` runs *before* `desktop-mode` and none of
 * its functions exist yet when this file is first read. Checking then would fail every
 * time, on every site, and the plugin would silently never load. `Requires Plugins`
 * governs activation, not load order.
 *
 * Priority 5 leaves room for the Desktop Mode registrations at 20 to be added by an
 * include loaded here -- WordPress runs callbacks added to a hook that is already
 * firing, as long as they sit at a later priority.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_boot() {
	if ( ! lienzo_requirements_met() ) {
		// Nothing else loads. A half-registered plugin whose editor cannot open is
		// worse than one that says plainly what it needs.
		return;
	}

	require_once LIENZO_DIR . 'includes/helpers.php';
	require_once LIENZO_DIR . 'includes/recipe.php';
	require_once LIENZO_DIR . 'includes/presets.php';
	require_once LIENZO_DIR . 'includes/render.php';
	require_once LIENZO_DIR . 'includes/rest.php';
	require_once LIENZO_DIR . 'includes/assets.php';
	require_once LIENZO_DIR . 'includes/media-actions.php';
	require_once LIENZO_DIR . 'includes/desktop-mode.php';
}
