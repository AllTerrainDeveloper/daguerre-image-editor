<?php
/**
 * PHPUnit bootstrap.
 *
 * Locates a WordPress test library, then loads Daguerre as a must-use plugin so its
 * hooks are registered before the test suite's own `init` runs.
 *
 * Point WP_TESTS_DIR (or WP_PHPUNIT__DIR) at a WordPress develop checkout's
 * tests/phpunit directory before running.
 *
 * @package Daguerre
 */

$daguerre_tests_dir = getenv( 'WP_TESTS_DIR' );

if ( ! $daguerre_tests_dir ) {
	$daguerre_tests_dir = getenv( 'WP_PHPUNIT__DIR' );
}

if ( ! $daguerre_tests_dir ) {
	// Conventional locations: wp-env's tests container, then the classic install script's.
	foreach ( array( '/wordpress-phpunit', '/tmp/wordpress-tests-lib' ) as $daguerre_candidate ) {
		if ( file_exists( $daguerre_candidate . '/includes/functions.php' ) ) {
			$daguerre_tests_dir = $daguerre_candidate;
			break;
		}
	}
}

if ( ! $daguerre_tests_dir || ! file_exists( $daguerre_tests_dir . '/includes/functions.php' ) ) {
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- WordPress is not loaded yet, so WP_Filesystem does not exist; this is a CLI diagnostic on STDERR.
	fwrite(
		STDERR,
		"Could not find the WordPress test library.\n" .
		"Set WP_TESTS_DIR to a WordPress develop checkout's tests/phpunit directory, e.g.\n\n" .
		"  WP_TESTS_DIR=../wordpress-develop/tests/phpunit npm run test:php\n\n"
	);
	exit( 1 );
}

require_once $daguerre_tests_dir . '/includes/functions.php';

/**
 * Loads the plugin under test.
 *
 * @return void
 */
function daguerre_manually_load_plugin() {
	require dirname( __DIR__, 2 ) . '/daguerre.php';
}

tests_add_filter( 'muplugins_loaded', 'daguerre_manually_load_plugin' );

require $daguerre_tests_dir . '/includes/bootstrap.php';
