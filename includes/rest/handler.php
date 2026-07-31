<?php
/**
 * The wrapper every REST handler is filtered through.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Wraps a route callback so PHP output can never corrupt the JSON body.
 *
 * Under `WP_DEBUG` a stray notice from an unrelated plugin prints before the
 * response is serialised and turns valid JSON into a parse error on the client.
 * Buffering and discarding inside the callback keeps our responses well-formed
 * regardless of what else is loaded.
 *
 * @since 0.1.0
 *
 * @param callable $handler Route callback.
 * @return callable Wrapped callback.
 */
function lienzo_rest_handler( $handler ) {
	return static function ( $request ) use ( $handler ) {
		ob_start();

		try {
			$result = call_user_func( $handler, $request );
		} finally {
			ob_end_clean();
		}

		return $result;
	};
}
