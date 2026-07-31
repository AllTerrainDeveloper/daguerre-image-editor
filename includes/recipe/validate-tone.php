<?php
/**
 * Validating the tone controls: curves and levels.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Validates a curve set.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Candidate curves.
 * @return array|WP_Error Normalised curves keyed by channel, or an error.
 */
function lienzo_validate_curves( $raw ) {
	if ( ! is_array( $raw ) ) {
		return array();
	}

	$out = array();

	foreach ( array( 'rgb', 'r', 'g', 'b' ) as $channel ) {
		if ( ! isset( $raw[ $channel ] ) || ! is_array( $raw[ $channel ] ) ) {
			continue;
		}

		$points = array();

		foreach ( $raw[ $channel ] as $point ) {
			if ( ! is_array( $point ) || count( $point ) < 2 ) {
				return new WP_Error(
					'lienzo_recipe_bad_curve',
					sprintf(
						/* translators: %s: curve channel name. */
						__( 'Curve "%s" contains a malformed control point.', 'lienzo' ),
						$channel
					),
					array( 'status' => 400 )
				);
			}

			$x = (float) $point[0];
			$y = (float) $point[1];

			if ( ! is_finite( $x ) || ! is_finite( $y ) || $x < 0 || $x > 255 || $y < 0 || $y > 255 ) {
				return new WP_Error(
					'lienzo_recipe_bad_curve',
					sprintf(
						/* translators: %s: curve channel name. */
						__( 'Curve "%s" has a control point outside 0-255.', 'lienzo' ),
						$channel
					),
					array( 'status' => 400 )
				);
			}

			$points[] = array( (int) round( $x ), (int) round( $y ) );
		}

		if ( count( $points ) < 2 ) {
			continue;
		}

		$out[ $channel ] = $points;
	}

	return $out;
}

/**
 * Validates a levels block.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Candidate levels.
 * @return array Normalised levels.
 */
function lienzo_validate_levels( $raw ) {
	$levels = lienzo_default_levels();

	if ( ! is_array( $raw ) ) {
		return $levels;
	}

	if ( isset( $raw['black'] ) && is_numeric( $raw['black'] ) ) {
		$levels['black'] = min( 254, max( 0, (int) $raw['black'] ) );
	}

	if ( isset( $raw['white'] ) && is_numeric( $raw['white'] ) ) {
		$levels['white'] = min( 255, max( $levels['black'] + 1, (int) $raw['white'] ) );
	}

	if ( isset( $raw['gamma'] ) && is_numeric( $raw['gamma'] ) ) {
		$levels['gamma'] = min( 10.0, max( 0.1, (float) $raw['gamma'] ) );
	}

	return $levels;
}
