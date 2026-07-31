<?php
/**
 * Route registration.
 *
 * Every route in one table, so the whole REST surface can be read at a glance and the
 * argument schemas sit next to the callbacks they guard.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

add_action( 'rest_api_init', 'lienzo_register_rest_routes' );

/**
 * Registers every Lienzo REST route.
 *
 * Routes are registered unconditionally, whether or not Desktop Mode is present.
 * The editor is reachable from four standalone admin surfaces and they all speak
 * to these endpoints.
 *
 * @since 0.1.0
 *
 * @return void
 */
function lienzo_register_rest_routes() {
	register_rest_route(
		LIENZO_REST_NAMESPACE,
		'/media/(?P<id>[\d]+)',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => lienzo_rest_handler( 'lienzo_rest_get_media' ),
			'permission_callback' => 'lienzo_rest_permission',
			'args'                => array(
				'id' => array(
					'description'       => __( 'Attachment ID to open in the editor.', 'lienzo' ),
					'type'              => 'integer',
					'required'          => true,
					'sanitize_callback' => 'absint',
				),
			),
		)
	);

	register_rest_route(
		LIENZO_REST_NAMESPACE,
		'/media/(?P<id>[\d]+)/render',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => lienzo_rest_handler( 'lienzo_rest_render' ),
			'permission_callback' => 'lienzo_rest_save_permission',
			'args'                => array(
				'id'     => array(
					'description'       => __( 'Attachment the edit was rendered from.', 'lienzo' ),
					'type'              => 'integer',
					'required'          => true,
					'sanitize_callback' => 'absint',
				),
				'recipe' => array(
					'description' => __( 'The edit recipe, JSON encoded.', 'lienzo' ),
					'type'        => 'string',
					'required'    => true,
				),
			),
		)
	);

	register_rest_route(
		LIENZO_REST_NAMESPACE,
		'/presets',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => lienzo_rest_handler( 'lienzo_rest_get_presets' ),
				'permission_callback' => 'lienzo_rest_presets_permission',
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => lienzo_rest_handler( 'lienzo_rest_create_preset' ),
				'permission_callback' => 'lienzo_rest_presets_permission',
				'args'                => array(
					'name'   => array(
						'description' => __( 'Display name for the preset.', 'lienzo' ),
						'type'        => 'string',
						'required'    => true,
					),
					'recipe' => array(
						'description' => __( 'The edit to derive the preset from, JSON encoded.', 'lienzo' ),
						'type'        => 'string',
						'required'    => true,
					),
				),
			),
		)
	);

	register_rest_route(
		LIENZO_REST_NAMESPACE,
		'/presets/(?P<preset>[A-Za-z0-9-]+)',
		array(
			'methods'             => WP_REST_Server::DELETABLE,
			'callback'            => lienzo_rest_handler( 'lienzo_rest_delete_preset' ),
			'permission_callback' => 'lienzo_rest_presets_permission',
		)
	);

	register_rest_route(
		LIENZO_REST_NAMESPACE,
		'/media/(?P<id>[\d]+)/source',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => lienzo_rest_handler( 'lienzo_rest_get_source' ),
			'permission_callback' => 'lienzo_rest_permission',
			'args'                => array(
				'id' => array(
					'description'       => __( 'Attachment ID whose original bytes to stream.', 'lienzo' ),
					'type'              => 'integer',
					'required'          => true,
					'sanitize_callback' => 'absint',
				),
			),
		)
	);
}
