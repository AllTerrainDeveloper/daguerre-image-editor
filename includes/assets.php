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
 * Safe to call more than once per request; the second call is a no-op because
 * `wp_localize_script()` only attaches data the first time a handle is enqueued.
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

	wp_localize_script( 'daguerre', 'daguerreConfig', daguerre_get_config() );
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
