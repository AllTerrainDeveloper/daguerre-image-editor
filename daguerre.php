<?php
/**
 * Plugin Name:       Daguerre
 * Plugin URI:        https://github.com/dlopezalcazaba/daguerre
 * Description:       A modern, non-destructive image editor for the WordPress media library. Exposure, colour and tone adjustments rendered on the GPU, in the browser.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Daniel Lopez
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       daguerre
 * Domain Path:       /languages
 *
 * Daguerre is a standalone plugin. It works on any WordPress install and does not
 * require Desktop Mode. When Desktop Mode is active it registers a native window,
 * a desktop icon and a media file opener, but every one of those registrations sits
 * behind a `function_exists()` guard in includes/desktop-mode.php.
 *
 * @package Daguerre
 */

defined( 'ABSPATH' ) || exit;

define( 'DAGUERRE_VERSION', '0.1.0' );
define( 'DAGUERRE_FILE', __FILE__ );
define( 'DAGUERRE_DIR', plugin_dir_path( __FILE__ ) );
define( 'DAGUERRE_URL', plugin_dir_url( __FILE__ ) );
define( 'DAGUERRE_REST_NAMESPACE', 'daguerre/v1' );

/**
 * Post meta key holding the serialized edit recipe on a rendered attachment.
 */
define( 'DAGUERRE_RECIPE_META', '_daguerre_recipe' );

/**
 * Post meta key holding the ID of the attachment the pixels originally came from.
 */
define( 'DAGUERRE_SOURCE_META', '_daguerre_source' );

require_once DAGUERRE_DIR . 'includes/helpers.php';
require_once DAGUERRE_DIR . 'includes/recipe.php';
require_once DAGUERRE_DIR . 'includes/presets.php';
require_once DAGUERRE_DIR . 'includes/render.php';
require_once DAGUERRE_DIR . 'includes/rest.php';
require_once DAGUERRE_DIR . 'includes/assets.php';
require_once DAGUERRE_DIR . 'includes/admin-page.php';
require_once DAGUERRE_DIR . 'includes/media-actions.php';
require_once DAGUERRE_DIR . 'includes/desktop-mode.php';
