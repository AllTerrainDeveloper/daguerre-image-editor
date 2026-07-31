<?php
/**
 * The op schema and the recipe defaults.
 *
 * This file is one half of a contract. `src/model/recipe/schema.ts` is the other
 * half and the two op tables must agree exactly. When you add an op, add it in both
 * places and add a case to `src/engine/color-matrix.ts`.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Current recipe schema version.
 *
 * Bump when the shape changes incompatibly, and add a migration in
 * `lienzo_migrate_recipe()` and its TypeScript counterpart.
 */
define( 'LIENZO_RECIPE_VERSION', 5 );

/**
 * Returns the table of adjustment operations Lienzo understands.
 *
 * Every op is a single scalar stored under the key `v`. Keeping the shape uniform
 * is what lets the validator, the UI slider factory and the colour-matrix composer
 * all be driven from this one table rather than a switch statement in each.
 *
 * Ranges are authored in "user" units: the UI shows -100..100 for the -1..1 ops and
 * degrees for hue.
 *
 * @since 0.1.0
 *
 * @return array<string, array{min: float, max: float, default: float}> Op table keyed by op type.
 */
function lienzo_op_schema() {
	$schema = array(
		'exposure'    => array(
			'min'     => -1.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'contrast'    => array(
			'min'     => -1.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'saturation'  => array(
			'min'     => -1.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'vibrance'    => array(
			'min'     => -1.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'temperature' => array(
			'min'     => -1.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'tint'        => array(
			'min'     => -1.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'hue'         => array(
			'min'     => -180.0,
			'max'     => 180.0,
			'default' => 0.0,
		),
		'sharpen'     => array(
			'min'     => 0.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'blur'        => array(
			'min'     => 0.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'vignette'    => array(
			'min'     => -1.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
		'grain'       => array(
			'min'     => 0.0,
			'max'     => 1.0,
			'default' => 0.0,
		),
	);

	/**
	 * Filters the adjustment operation table.
	 *
	 * Registering an op here makes the server accept and store it, but the browser
	 * still has to know how to render it. Pair any addition with a JavaScript
	 * implementation or the op will validate and then do nothing.
	 *
	 * @since 0.1.0
	 *
	 * @param array $schema Op table keyed by op type.
	 */
	return (array) apply_filters( 'lienzo_op_schema', $schema );
}

/**
 * Returns an empty recipe for a given source attachment.
 *
 * @since 0.1.0
 *
 * @param int $source_id Attachment ID the pixels come from.
 * @return array Recipe array.
 */
function lienzo_default_recipe( $source_id ) {
	return array(
		'version'       => LIENZO_RECIPE_VERSION,
		'source'        => (int) $source_id,
		'ops'           => array(),
		'canvas'        => array(
			'width'  => 0,
			'height' => 0,
		),
		'layers'        => array( lienzo_default_layer_entry() ),
		'activeLayerId' => LIENZO_BASE_LAYER_ID,
		'curves'        => array(),
		'levels'        => lienzo_default_levels(),
		'output'        => array(
			'format'  => 'image/jpeg',
			'quality' => 0.92,
		),
	);
}

/**
 * A layer sitting centred and unscaled on the canvas.
 *
 * @since 0.1.0
 *
 * @return array Identity layer transform.
 */
function lienzo_default_layer() {
	return array(
		'x'        => 0.5,
		'y'        => 0.5,
		'scaleX'   => 1.0,
		'scaleY'   => 1.0,
		'rotation' => 0.0,
		'flipH'    => false,
		'flipV'    => false,
	);
}

/**
 * Levels that leave the image alone.
 *
 * @since 0.1.0
 *
 * @return array Identity levels.
 */
function lienzo_default_levels() {
	return array(
		'black' => 0,
		'white' => 255,
		'gamma' => 1.0,
	);
}
