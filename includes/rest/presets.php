<?php
/**
 * The preset endpoints.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * GET /lienzo/v1/presets
 *
 * @since 0.1.0
 *
 * @return WP_REST_Response The current user's presets.
 */
function lienzo_rest_get_presets() {
	return rest_ensure_response( lienzo_get_presets() );
}

/**
 * POST /lienzo/v1/presets
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error The stored preset, or an error.
 */
function lienzo_rest_create_preset( $request ) {
	$recipe = lienzo_validate_recipe( $request->get_param( 'recipe' ) );

	if ( is_wp_error( $recipe ) ) {
		return $recipe;
	}

	$preset = lienzo_save_preset( $request->get_param( 'name' ), $recipe );

	if ( is_wp_error( $preset ) ) {
		return $preset;
	}

	$response = rest_ensure_response( $preset );
	$response->set_status( 201 );

	return $response;
}

/**
 * DELETE /lienzo/v1/presets/<id>
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Confirmation, or an error.
 */
function lienzo_rest_delete_preset( $request ) {
	$deleted = lienzo_delete_preset( (string) $request['preset'] );

	if ( is_wp_error( $deleted ) ) {
		return $deleted;
	}

	return rest_ensure_response( array( 'deleted' => true ) );
}
