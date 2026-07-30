<?php
/**
 * PHPUnit bootstrap.
 *
 * Locates a WordPress test library, then loads Lienzo as a must-use plugin so its
 * hooks are registered before the test suite's own `init` runs.
 *
 * Lienzo requires Desktop Mode and refuses to load without it, so the two functions
 * that requirement is tested against are stubbed here. Stubbing rather than installing
 * Desktop Mode is deliberate: these tests are about Lienzo's PHP, and the plugin
 * checks for *capability* -- do the functions I am about to call exist -- rather than
 * for a plugin slug, so satisfying the check honestly means defining them.
 *
 * Point WP_TESTS_DIR (or WP_PHPUNIT__DIR) at a WordPress develop checkout's
 * tests/phpunit directory before running.
 *
 * @package Lienzo
 */

$lienzo_tests_dir = getenv( 'WP_TESTS_DIR' );

if ( ! $lienzo_tests_dir ) {
	$lienzo_tests_dir = getenv( 'WP_PHPUNIT__DIR' );
}

if ( ! $lienzo_tests_dir ) {
	// Conventional locations: wp-env's tests container, then the classic install script's.
	foreach ( array( '/wordpress-phpunit', '/tmp/wordpress-tests-lib' ) as $lienzo_candidate ) {
		if ( file_exists( $lienzo_candidate . '/includes/functions.php' ) ) {
			$lienzo_tests_dir = $lienzo_candidate;
			break;
		}
	}
}

if ( ! $lienzo_tests_dir || ! file_exists( $lienzo_tests_dir . '/includes/functions.php' ) ) {
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- WordPress is not loaded yet, so WP_Filesystem does not exist; this is a CLI diagnostic on STDERR.
	fwrite(
		STDERR,
		"Could not find the WordPress test library.\n" .
		"Set WP_TESTS_DIR to a WordPress develop checkout's tests/phpunit directory, e.g.\n\n" .
		"  WP_TESTS_DIR=../wordpress-develop/tests/phpunit npm run test:php\n\n"
	);
	exit( 1 );
}

require_once $lienzo_tests_dir . '/includes/functions.php';

/*
 * Stand-ins for the parts of Desktop Mode that Lienzo requires.
 *
 * Declared at file scope so they exist before the plugin loads, and deliberately
 * unprefixed: they impersonate another plugin's public API, and prefixing them would
 * defeat the entire point.
 *
 * phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound
 */

if ( ! function_exists( 'desktop_mode_register_window' ) ) {
	/**
	 * Accepts a native window registration.
	 *
	 * @param string $id   Window id.
	 * @param array  $args Window arguments.
	 * @return bool Always true.
	 */
	function desktop_mode_register_window( $id, $args = array() ) {
		unset( $id, $args );

		return true;
	}
}

if ( ! function_exists( 'desktop_mode_is_enabled' ) ) {
	/**
	 * Whether the current user is in desktop mode.
	 *
	 * True in tests, so the entry points that only appear inside the shell are
	 * exercised rather than skipped.
	 *
	 * @return bool Always true.
	 */
	function desktop_mode_is_enabled() {
		return true;
	}
}

// phpcs:enable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound

/**
 * Loads the plugin under test.
 *
 * @return void
 */
function lienzo_manually_load_plugin() {
	require dirname( __DIR__, 2 ) . '/lienzo.php';
}

tests_add_filter( 'muplugins_loaded', 'lienzo_manually_load_plugin' );

require $lienzo_tests_dir . '/includes/bootstrap.php';
