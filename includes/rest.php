<?php
/**
 * REST API routes under the `daguerre/v1` namespace.
 *
 * @package Daguerre
 */

defined( 'ABSPATH' ) || exit;

add_action( 'rest_api_init', 'daguerre_register_rest_routes' );

/**
 * Registers every Daguerre REST route.
 *
 * Routes are registered unconditionally, whether or not Desktop Mode is present.
 * The editor is reachable from four standalone admin surfaces and they all speak
 * to these endpoints.
 *
 * @since 0.1.0
 *
 * @return void
 */
function daguerre_register_rest_routes() {
	register_rest_route(
		DAGUERRE_REST_NAMESPACE,
		'/media/(?P<id>[\d]+)',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => daguerre_rest_handler( 'daguerre_rest_get_media' ),
			'permission_callback' => 'daguerre_rest_permission',
			'args'                => array(
				'id' => array(
					'description'       => __( 'Attachment ID to open in the editor.', 'daguerre' ),
					'type'              => 'integer',
					'required'          => true,
					'sanitize_callback' => 'absint',
				),
			),
		)
	);

	register_rest_route(
		DAGUERRE_REST_NAMESPACE,
		'/media/(?P<id>[\d]+)/render',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => daguerre_rest_handler( 'daguerre_rest_render' ),
			'permission_callback' => 'daguerre_rest_save_permission',
			'args'                => array(
				'id'     => array(
					'description'       => __( 'Attachment the edit was rendered from.', 'daguerre' ),
					'type'              => 'integer',
					'required'          => true,
					'sanitize_callback' => 'absint',
				),
				'recipe' => array(
					'description' => __( 'The edit recipe, JSON encoded.', 'daguerre' ),
					'type'        => 'string',
					'required'    => true,
				),
			),
		)
	);

	register_rest_route(
		DAGUERRE_REST_NAMESPACE,
		'/presets',
		array(
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => daguerre_rest_handler( 'daguerre_rest_get_presets' ),
				'permission_callback' => 'daguerre_rest_presets_permission',
			),
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => daguerre_rest_handler( 'daguerre_rest_create_preset' ),
				'permission_callback' => 'daguerre_rest_presets_permission',
				'args'                => array(
					'name'   => array(
						'description' => __( 'Display name for the preset.', 'daguerre' ),
						'type'        => 'string',
						'required'    => true,
					),
					'recipe' => array(
						'description' => __( 'The edit to derive the preset from, JSON encoded.', 'daguerre' ),
						'type'        => 'string',
						'required'    => true,
					),
				),
			),
		)
	);

	register_rest_route(
		DAGUERRE_REST_NAMESPACE,
		'/presets/(?P<preset>[A-Za-z0-9-]+)',
		array(
			'methods'             => WP_REST_Server::DELETABLE,
			'callback'            => daguerre_rest_handler( 'daguerre_rest_delete_preset' ),
			'permission_callback' => 'daguerre_rest_presets_permission',
		)
	);

	register_rest_route(
		DAGUERRE_REST_NAMESPACE,
		'/media/(?P<id>[\d]+)/source',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => daguerre_rest_handler( 'daguerre_rest_get_source' ),
			'permission_callback' => 'daguerre_rest_permission',
			'args'                => array(
				'id' => array(
					'description'       => __( 'Attachment ID whose original bytes to stream.', 'daguerre' ),
					'type'              => 'integer',
					'required'          => true,
					'sanitize_callback' => 'absint',
				),
			),
		)
	);
}

/**
 * Shared permission callback for every Daguerre route.
 *
 * Distinguishes "not logged in" (401) from "logged in but not allowed" (403) so the
 * client can tell a expired session apart from a genuine permission problem and
 * offer the right recovery.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return true|WP_Error True when allowed, WP_Error otherwise.
 */
function daguerre_rest_permission( $request ) {
	if ( ! is_user_logged_in() ) {
		return new WP_Error(
			'daguerre_not_logged_in',
			__( 'You must be logged in to edit images.', 'daguerre' ),
			array( 'status' => 401 )
		);
	}

	$attachment_id = (int) $request['id'];

	if ( ! daguerre_can_edit( $attachment_id ) ) {
		return new WP_Error(
			'daguerre_cannot_edit',
			__( 'You are not allowed to edit this image.', 'daguerre' ),
			array( 'status' => 403 )
		);
	}

	return true;
}

/**
 * Permission callback for routes that create an attachment.
 *
 * Requires `upload_files` *in addition to* the read permission. Saving does not
 * modify the source, but it does add a file to the media library, and that is a
 * separate capability -- an author who may edit one particular image is not
 * necessarily someone the site wants creating new uploads. Core's own image-edit
 * endpoint draws the line in the same place.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return true|WP_Error True when allowed, WP_Error otherwise.
 */
function daguerre_rest_save_permission( $request ) {
	$allowed = daguerre_rest_permission( $request );

	if ( is_wp_error( $allowed ) ) {
		return $allowed;
	}

	if ( ! current_user_can( 'upload_files' ) ) {
		return new WP_Error(
			'daguerre_cannot_upload',
			__( 'You are not allowed to add files to the media library.', 'daguerre' ),
			array( 'status' => 403 )
		);
	}

	return true;
}

/**
 * Permission callback for the preset routes.
 *
 * Presets are per-user and carry no image data, so the only question is whether
 * this is a real logged-in user who can use the editor at all. There is no
 * per-attachment check because a preset is not attached to anything.
 *
 * @since 0.1.0
 *
 * @return true|WP_Error True when allowed, WP_Error otherwise.
 */
function daguerre_rest_presets_permission() {
	if ( ! is_user_logged_in() ) {
		return new WP_Error(
			'daguerre_not_logged_in',
			__( 'You must be logged in to use presets.', 'daguerre' ),
			array( 'status' => 401 )
		);
	}

	if ( ! current_user_can( 'upload_files' ) ) {
		return new WP_Error(
			'daguerre_cannot_edit',
			__( 'You are not allowed to edit images.', 'daguerre' ),
			array( 'status' => 403 )
		);
	}

	return true;
}

/**
 * GET /daguerre/v1/presets
 *
 * @since 0.1.0
 *
 * @return WP_REST_Response The current user's presets.
 */
function daguerre_rest_get_presets() {
	return rest_ensure_response( daguerre_get_presets() );
}

/**
 * POST /daguerre/v1/presets
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error The stored preset, or an error.
 */
function daguerre_rest_create_preset( $request ) {
	$recipe = daguerre_validate_recipe( $request->get_param( 'recipe' ) );

	if ( is_wp_error( $recipe ) ) {
		return $recipe;
	}

	$preset = daguerre_save_preset( $request->get_param( 'name' ), $recipe );

	if ( is_wp_error( $preset ) ) {
		return $preset;
	}

	$response = rest_ensure_response( $preset );
	$response->set_status( 201 );

	return $response;
}

/**
 * DELETE /daguerre/v1/presets/<id>
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Confirmation, or an error.
 */
function daguerre_rest_delete_preset( $request ) {
	$deleted = daguerre_delete_preset( (string) $request['preset'] );

	if ( is_wp_error( $deleted ) ) {
		return $deleted;
	}

	return rest_ensure_response( array( 'deleted' => true ) );
}

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
function daguerre_rest_handler( $handler ) {
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

/**
 * GET /daguerre/v1/media/<id>
 *
 * Returns everything the editor needs to open an image: where to fetch the pixels,
 * how big they are, and any recipe from a previous edit.
 *
 * When the requested attachment was itself produced by Daguerre, the response
 * points at the *original* it was derived from. That is what makes a re-edit
 * first-generation rather than a re-render of already-baked pixels.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Response payload or error.
 */
function daguerre_rest_get_media( $request ) {
	$attachment_id = (int) $request['id'];
	$source_id     = daguerre_resolve_source_id( $attachment_id );

	// The pointer could name an attachment the current user cannot read.
	if ( $source_id !== $attachment_id && ! daguerre_can_edit( $source_id ) ) {
		$source_id = $attachment_id;
	}

	$path = daguerre_get_source_path( $source_id );

	if ( is_wp_error( $path ) ) {
		return $path;
	}

	$source_post = get_post( $source_id );
	$dimensions  = wp_getimagesize( $path );

	if ( ! $dimensions ) {
		return new WP_Error(
			'daguerre_unreadable_image',
			__( 'The image dimensions could not be read. The file may be corrupt.', 'daguerre' ),
			array( 'status' => 422 )
		);
	}

	$url = wp_get_original_image_url( $source_id );

	if ( ! $url ) {
		$url = wp_get_attachment_url( $source_id );
	}

	$recipe = daguerre_get_recipe( $attachment_id );

	if ( null === $recipe ) {
		$recipe = daguerre_default_recipe( $source_id );
	}

	$payload = array(
		'id'        => $attachment_id,
		'sourceId'  => $source_id,
		'mime'      => $source_post->post_mime_type,
		'url'       => $url,
		'sourceUrl' => rest_url( DAGUERRE_REST_NAMESPACE . '/media/' . $source_id . '/source' ),
		'width'     => (int) $dimensions[0],
		'height'    => (int) $dimensions[1],
		'title'     => $source_post->post_title,
		'alt'       => (string) get_post_meta( $source_id, '_wp_attachment_image_alt', true ),
		'recipe'    => $recipe,
		'canSave'   => current_user_can( 'upload_files' ),
		'schema'    => daguerre_op_schema(),
	);

	/**
	 * Filters the payload describing an image opened in the editor.
	 *
	 * @since 0.1.0
	 *
	 * @param array $payload       Response payload.
	 * @param int   $attachment_id Attachment the client asked for.
	 * @param int   $source_id     Attachment the pixels will be loaded from.
	 */
	$payload = apply_filters( 'daguerre_rest_media_payload', $payload, $attachment_id, $source_id );

	return rest_ensure_response( $payload );
}

/**
 * POST /daguerre/v1/media/<id>/render
 *
 * Accepts a rendered image and stores it as a new attachment.
 *
 * The response reports the dimensions actually stored rather than the ones sent.
 * WordPress applies `big_image_size_threshold` (2560px by default) to every upload,
 * so a 6000px render is silently downscaled and kept as a `-scaled` derivative.
 * Telling the user "saved at 6000px" when the site holds 2560px would be a lie the
 * editor is uniquely positioned to catch.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Response payload or error.
 */
function daguerre_rest_render( $request ) {
	$attachment_id = (int) $request['id'];
	$source_id     = daguerre_resolve_source_id( $attachment_id );

	if ( $source_id !== $attachment_id && ! daguerre_can_edit( $source_id ) ) {
		$source_id = $attachment_id;
	}

	$recipe = daguerre_validate_recipe( $request->get_param( 'recipe' ) );

	if ( is_wp_error( $recipe ) ) {
		return $recipe;
	}

	if ( $recipe['source'] !== $source_id ) {
		return new WP_Error(
			'daguerre_recipe_source_mismatch',
			__( 'The edit recipe does not belong to this image.', 'daguerre' ),
			array( 'status' => 400 )
		);
	}

	$files = $request->get_file_params();

	if ( empty( $files['file'] ) ) {
		return new WP_Error(
			'daguerre_render_missing_file',
			__( 'No rendered image was uploaded.', 'daguerre' ),
			array( 'status' => 400 )
		);
	}

	$new_id = daguerre_store_render( $files['file'], $source_id, $recipe );

	if ( is_wp_error( $new_id ) ) {
		return $new_id;
	}

	$metadata = wp_get_attachment_metadata( $new_id );

	$response = rest_ensure_response(
		array(
			'id'       => $new_id,
			'sourceId' => $source_id,
			'url'      => wp_get_attachment_url( $new_id ),
			'width'    => isset( $metadata['width'] ) ? (int) $metadata['width'] : 0,
			'height'   => isset( $metadata['height'] ) ? (int) $metadata['height'] : 0,
			'mime'     => get_post_mime_type( $new_id ),
			'recipe'   => $recipe,
		)
	);

	$response->set_status( 201 );
	$response->header( 'Location', rest_url( DAGUERRE_REST_NAMESPACE . '/media/' . $new_id ) );

	return $response;
}

/**
 * GET /daguerre/v1/media/<id>/source
 *
 * Streams the original image bytes from the same origin as wp-admin.
 *
 * This exists for one reason: WebGL taints a canvas when it samples a cross-origin
 * texture, and a tainted canvas makes both `extract.pixels()` (the histogram) and
 * `convertToBlob()` (the save) throw. Sites using a CDN or an offload plugin serve
 * uploads from another origin, so the client falls back to this route and loads the
 * bytes through a blob URL instead.
 *
 * @since 0.1.0
 *
 * @param WP_REST_Request $request Incoming request.
 * @return WP_REST_Response|WP_Error Streaming response, or error.
 */
function daguerre_rest_get_source( $request ) {
	$attachment_id = (int) $request['id'];
	$path          = daguerre_get_source_path( $attachment_id );

	if ( is_wp_error( $path ) ) {
		return $path;
	}

	$post = get_post( $attachment_id );
	$mime = $post->post_mime_type;
	$size = (int) filesize( $path );

	add_filter(
		'rest_pre_serve_request',
		static function ( $served ) use ( $path, $mime, $size ) {
			if ( $served ) {
				return $served;
			}

			nocache_headers();
			header( 'Content-Type: ' . $mime );
			header( 'Content-Length: ' . $size );
			header( 'X-Robots-Tag: noindex' );
			header( 'X-Content-Type-Options: nosniff' );

			readfile( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- Streaming a large binary; WP_Filesystem would buffer the whole file in memory.

			return true;
		},
		10,
		1
	);

	return new WP_REST_Response( null, 200 );
}
