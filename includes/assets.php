<?php
/**
 * Script and style registration.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', 'lienzo_register_assets' );

/**
 * Registers the editor bundle and stylesheet.
 *
 * Registration happens on `init` so that any surface which needs the editor -- the
 * admin page, the media modal, the block editor, a Desktop Mode native window --
 * can simply `wp_enqueue_script( 'lienzo' )` without caring who got there first.
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
function lienzo_register_assets() {
	$suffix = ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) ? '' : '.min';
	$script = 'assets/js/lienzo' . $suffix . '.js';

	wp_register_script(
		'lienzo',
		LIENZO_URL . $script,
		array( 'wp-i18n' ),
		lienzo_asset_version( $script ),
		true
	);

	wp_set_script_translations( 'lienzo', 'lienzo', LIENZO_DIR . 'languages' );

	wp_register_style(
		'lienzo',
		LIENZO_URL . 'assets/css/lienzo.css',
		array( 'dashicons' ),
		lienzo_asset_version( 'assets/css/lienzo.css' )
	);
}

/**
 * Builds the cache-busting version for a bundled asset.
 *
 * The plugin version alone is not enough during development: it stays at 0.1.0 across
 * every rebuild, so the browser keeps serving the bundle it already has and a change
 * appears not to have worked. The file's modification time changes whenever the build
 * writes it, which is exactly the signal wanted. Falls back to the plugin version when
 * the file cannot be read, so a packaged install still gets a sensible value.
 *
 * @since 0.1.0
 *
 * @param string $relative Path within the plugin directory.
 * @return string Version string for `wp_register_script()`.
 */
function lienzo_asset_version( $relative ) {
	$path = LIENZO_DIR . $relative;

	if ( ! file_exists( $path ) ) {
		return LIENZO_VERSION;
	}

	$modified = filemtime( $path );

	return $modified ? LIENZO_VERSION . '.' . $modified : LIENZO_VERSION;
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
function lienzo_enqueue_editor() {
	if ( wp_script_is( 'lienzo', 'enqueued' ) ) {
		return;
	}

	wp_enqueue_script( 'lienzo' );
	wp_enqueue_style( 'lienzo' );

	wp_add_inline_script(
		'lienzo',
		'window.lienzoConfig = ' . wp_json_encode( lienzo_get_config() ) . ';',
		'before'
	);
}

/**
 * Builds the configuration blob handed to the browser as `window.lienzoConfig`.
 *
 * @since 0.1.0
 *
 * @return array Configuration array, JSON-encodable.
 */
function lienzo_get_config() {
	$config = array(
		'version'         => LIENZO_VERSION,
		'restUrl'         => esc_url_raw( trailingslashit( rest_url( LIENZO_REST_NAMESPACE ) ) ),
		'restNonce'       => wp_create_nonce( 'wp_rest' ),
		'pluginUrl'       => esc_url_raw( LIENZO_URL ),
		'mediaUrl'        => esc_url_raw( rest_url( 'wp/v2/media' ) ),
		'supportedMimes'  => lienzo_supported_mime_types(),
		'maxRenderPixels' => lienzo_max_render_pixels(),
		'canUpload'       => current_user_can( 'upload_files' ),
		'desktopMode'     => lienzo_is_desktop_mode_active(),
		'schema'          => lienzo_op_schema(),
	);

	/**
	 * Filters the editor's runtime configuration blob.
	 *
	 * @since 0.1.0
	 *
	 * @param array $config Configuration handed to the browser.
	 */
	return (array) apply_filters( 'lienzo_config', $config );
}
