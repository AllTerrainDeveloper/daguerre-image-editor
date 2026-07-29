<?php
/**
 * Script and style registration.
 *
 * @package Daguerre
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', 'daguerre_register_assets' );

/**
 * Registers the editor bundle and stylesheet.
 *
 * Registration happens on `init` so that any surface which needs the editor -- the
 * admin page, the media modal, the block editor, a Desktop Mode native window --
 * can simply `wp_enqueue_script( 'daguerre' )` without caring who got there first.
 *
 * PixiJS is deliberately *not* registered as a dependency. It is vendored at
 * `assets/vendor/pixi.min.js` and injected at runtime by `src/engine/pixi-loader.ts`
 * only when `window.PIXI` is absent, because Desktop Mode ships its own copy and two
 * Pixi instances on one page corrupt each other's global resources.
 *
 * @since 0.1.0
 *
 * @return void
 */
function daguerre_register_assets() {
	$suffix = ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) ? '' : '.min';

	wp_register_script(
		'daguerre',
		DAGUERRE_URL . 'assets/js/daguerre' . $suffix . '.js',
		array( 'wp-i18n' ),
		DAGUERRE_VERSION,
		true
	);

	wp_set_script_translations( 'daguerre', 'daguerre', DAGUERRE_DIR . 'languages' );

	wp_register_style(
		'daguerre',
		DAGUERRE_URL . 'assets/css/daguerre.css',
		array( 'dashicons' ),
		DAGUERRE_VERSION
	);
}

/**
 * Enqueues the editor bundle and hands it its runtime configuration.
 *
 * Safe to call more than once per request; the second call is a no-op because the
 * inline script is only added the first time the handle is enqueued.
 *
 * The config goes out as JSON via `wp_add_inline_script()` rather than through
 * `wp_localize_script()`, which casts every scalar to a string on its way to the
 * browser -- `true` arrives as `'1'` and `false` as `''`. That is fine for text and
 * quietly wrong for a flag: a strict check against `true` fails, and the JavaScript
 * concludes Desktop Mode is off while PHP is saying it is on. Booleans and numbers now
 * arrive as booleans and numbers.
 *
 * @since 0.1.0
 *
 * @return void
 */
function daguerre_enqueue_editor() {
	if ( wp_script_is( 'daguerre', 'enqueued' ) ) {
		return;
	}

	wp_enqueue_script( 'daguerre' );
	wp_enqueue_style( 'daguerre' );

	wp_add_inline_script(
		'daguerre',
		'window.daguerreConfig = ' . wp_json_encode( daguerre_get_config() ) . ';',
		'before'
	);
}

/**
 * Builds the configuration blob handed to the browser as `window.daguerreConfig`.
 *
 * @since 0.1.0
 *
 * @return array Configuration array, JSON-encodable.
 */
function daguerre_get_config() {
	$config = array(
		'version'         => DAGUERRE_VERSION,
		'restUrl'         => esc_url_raw( trailingslashit( rest_url( DAGUERRE_REST_NAMESPACE ) ) ),
		'restNonce'       => wp_create_nonce( 'wp_rest' ),
		'pluginUrl'       => esc_url_raw( DAGUERRE_URL ),
		'pixiUrl'         => esc_url_raw( DAGUERRE_URL . 'assets/vendor/pixi.min.js' ),
		'mediaUrl'        => esc_url_raw( rest_url( 'wp/v2/media' ) ),
		'supportedMimes'  => daguerre_supported_mime_types(),
		'maxRenderPixels' => daguerre_max_render_pixels(),
		'canUpload'       => current_user_can( 'upload_files' ),
		'desktopMode'     => daguerre_is_desktop_mode_active(),
		'schema'          => daguerre_op_schema(),
	);

	/**
	 * Filters the editor's runtime configuration blob.
	 *
	 * @since 0.1.0
	 *
	 * @param array $config Configuration handed to the browser.
	 */
	return (array) apply_filters( 'daguerre_config', $config );
}
