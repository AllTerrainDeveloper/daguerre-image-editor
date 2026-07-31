<?php
/**
 * Validating the op list and the output settings.
 *
 * Both are strict rather than forgiving. An unknown op type or an out-of-range value
 * is an error rather than something to silently drop or clamp: a recipe that quietly
 * loses an op would re-open showing sliders that do not match the pixels the user is
 * looking at.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Validates and normalises the adjustment list.
 *
 * Ops sitting at their default are dropped, so a stored recipe stays a description of
 * what was actually changed.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Ops as decoded from JSON.
 * @return array|WP_Error Normalised op list, or WP_Error describing the first problem.
 */
function lienzo_validate_ops( $raw ) {
	if ( ! is_array( $raw ) ) {
		return new WP_Error(
			'lienzo_recipe_bad_ops',
			__( 'The edit recipe operations must be a list.', 'lienzo' ),
			array( 'status' => 400 )
		);
	}

	$schema = lienzo_op_schema();
	$ops    = array();
	$seen   = array();

	foreach ( $raw as $op ) {
		if ( ! is_array( $op ) || ! isset( $op['type'] ) || ! is_string( $op['type'] ) ) {
			return new WP_Error(
				'lienzo_recipe_bad_op',
				__( 'Every recipe operation must be an object with a type.', 'lienzo' ),
				array( 'status' => 400 )
			);
		}

		$type = $op['type'];

		if ( ! isset( $schema[ $type ] ) ) {
			return new WP_Error(
				'lienzo_recipe_unknown_op',
				sprintf(
					/* translators: %s: the unrecognised operation type. */
					__( 'Unknown recipe operation "%s".', 'lienzo' ),
					$type
				),
				array(
					'status' => 400,
					'op'     => $type,
				)
			);
		}

		if ( isset( $seen[ $type ] ) ) {
			return new WP_Error(
				'lienzo_recipe_duplicate_op',
				sprintf(
					/* translators: %s: the duplicated operation type. */
					__( 'Recipe operation "%s" appears more than once.', 'lienzo' ),
					$type
				),
				array(
					'status' => 400,
					'op'     => $type,
				)
			);
		}

		if ( ! isset( $op['v'] ) || ! is_numeric( $op['v'] ) ) {
			return new WP_Error(
				'lienzo_recipe_bad_value',
				sprintf(
					/* translators: %s: the operation type missing a value. */
					__( 'Recipe operation "%s" is missing a numeric value.', 'lienzo' ),
					$type
				),
				array(
					'status' => 400,
					'op'     => $type,
				)
			);
		}

		$value = (float) $op['v'];

		if ( ! is_finite( $value ) || $value < $schema[ $type ]['min'] || $value > $schema[ $type ]['max'] ) {
			return new WP_Error(
				'lienzo_recipe_value_out_of_range',
				sprintf(
					/* translators: 1: operation type, 2: minimum allowed value, 3: maximum allowed value. */
					__( 'Recipe operation "%1$s" must be between %2$s and %3$s.', 'lienzo' ),
					$type,
					$schema[ $type ]['min'],
					$schema[ $type ]['max']
				),
				array(
					'status' => 400,
					'op'     => $type,
				)
			);
		}

		$seen[ $type ] = true;

		// Ops at their default are noise: drop them so stored recipes stay minimal.
		if ( abs( $value - $schema[ $type ]['default'] ) < 1e-9 ) {
			continue;
		}

		$ops[] = array(
			'type' => $type,
			'v'    => $value,
		);
	}

	return $ops;
}

/**
 * Validates and normalises the output encoding settings.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Output block as decoded from JSON.
 * @return array|WP_Error Normalised output settings, or WP_Error describing the problem.
 */
function lienzo_validate_output( $raw ) {
	$output  = is_array( $raw ) ? $raw : array();
	$format  = isset( $output['format'] ) ? (string) $output['format'] : 'image/jpeg';
	$quality = isset( $output['quality'] ) ? (float) $output['quality'] : 0.92;

	if ( ! lienzo_is_supported_mime( $format ) ) {
		return new WP_Error(
			'lienzo_recipe_bad_format',
			sprintf(
				/* translators: %s: the unsupported output MIME type. */
				__( 'Unsupported output format "%s".', 'lienzo' ),
				$format
			),
			array( 'status' => 400 )
		);
	}

	if ( ! is_finite( $quality ) || $quality < 0.1 || $quality > 1.0 ) {
		return new WP_Error(
			'lienzo_recipe_bad_quality',
			__( 'Output quality must be between 0.1 and 1.0.', 'lienzo' ),
			array( 'status' => 400 )
		);
	}

	return array(
		'format'  => $format,
		'quality' => $quality,
	);
}
