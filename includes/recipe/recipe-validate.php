<?php
/**
 * The top-level recipe validator.
 *
 * Strict by design. An unknown op type or an out-of-range value is an error rather
 * than something to silently drop or clamp: a recipe that quietly loses an op would
 * re-open showing sliders that do not match the pixels the user is looking at.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Validates and normalises a recipe.
 *
 * Strict by design. An unknown op type or an out-of-range value is an error rather
 * than something to silently drop or clamp: a recipe that quietly loses an op would
 * re-open showing sliders that do not match the pixels the user is looking at.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Recipe as decoded from JSON, or a JSON string.
 * @return array|WP_Error Normalised recipe, or WP_Error describing the first problem found.
 */
function lienzo_validate_recipe( $raw ) {
	if ( is_string( $raw ) ) {
		$raw = json_decode( $raw, true );

		if ( null === $raw ) {
			return new WP_Error(
				'lienzo_recipe_invalid_json',
				__( 'The edit recipe was not valid JSON.', 'lienzo' ),
				array( 'status' => 400 )
			);
		}
	}

	if ( ! is_array( $raw ) ) {
		return new WP_Error(
			'lienzo_recipe_not_object',
			__( 'The edit recipe must be an object.', 'lienzo' ),
			array( 'status' => 400 )
		);
	}

	$version = isset( $raw['version'] ) ? (int) $raw['version'] : 0;

	if ( $version < 1 || $version > LIENZO_RECIPE_VERSION ) {
		return new WP_Error(
			'lienzo_recipe_bad_version',
			sprintf(
				/* translators: 1: submitted schema version, 2: highest supported schema version. */
				__( 'Unsupported recipe version %1$d. This site understands up to version %2$d.', 'lienzo' ),
				$version,
				LIENZO_RECIPE_VERSION
			),
			array( 'status' => 400 )
		);
	}

	$raw = lienzo_migrate_recipe( $raw );

	$source_id = isset( $raw['source'] ) ? (int) $raw['source'] : 0;

	if ( $source_id <= 0 ) {
		return new WP_Error(
			'lienzo_recipe_bad_source',
			__( 'The edit recipe must name the attachment its pixels came from.', 'lienzo' ),
			array( 'status' => 400 )
		);
	}

	$ops = lienzo_validate_ops( isset( $raw['ops'] ) ? $raw['ops'] : array() );

	if ( is_wp_error( $ops ) ) {
		return $ops;
	}

	$output = lienzo_validate_output( isset( $raw['output'] ) ? $raw['output'] : array() );

	if ( is_wp_error( $output ) ) {
		return $output;
	}

	$format  = $output['format'];
	$quality = $output['quality'];

	$curves = lienzo_validate_curves( isset( $raw['curves'] ) ? $raw['curves'] : array() );

	if ( is_wp_error( $curves ) ) {
		return $curves;
	}

	$layers          = lienzo_validate_layers( $raw );
	$active_layer_id = LIENZO_BASE_LAYER_ID;

	if ( isset( $raw['activeLayerId'] ) && is_string( $raw['activeLayerId'] ) ) {
		foreach ( $layers as $layer ) {
			if ( $layer['id'] === $raw['activeLayerId'] ) {
				$active_layer_id = $raw['activeLayerId'];
				break;
			}
		}
	}

	return array(
		'version'       => LIENZO_RECIPE_VERSION,
		'source'        => $source_id,
		'ops'           => $ops,
		'canvas'        => lienzo_validate_canvas( isset( $raw['canvas'] ) ? $raw['canvas'] : null ),
		'layers'        => $layers,
		'activeLayerId' => $active_layer_id,
		'curves'        => $curves,
		'levels'        => lienzo_validate_levels( isset( $raw['levels'] ) ? $raw['levels'] : null ),
		'output'        => array(
			'format'  => $format,
			'quality' => $quality,
		),
	);
}
