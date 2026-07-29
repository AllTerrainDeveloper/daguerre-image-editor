<?php
/**
 * User presets.
 *
 * A preset is a recipe with its image-specific parts stripped: the adjustments,
 * curves and levels, but not the source attachment and not the geometry. Applying
 * someone's black-and-white look to a portrait should not also apply the crop they
 * used on a landscape.
 *
 * Stored as user meta rather than a custom table. Presets are per-user, small, and
 * only ever read all at once, which is exactly what user meta is for.
 *
 * @package Daguerre
 */

defined( 'ABSPATH' ) || exit;

/**
 * User meta key holding a user's presets.
 */
define( 'DAGUERRE_PRESETS_META', 'daguerre_presets' );

/**
 * Returns the most presets one user may keep.
 *
 * A ceiling exists because this is a single serialised meta row: without one, a
 * script could grow it until every page load paid to unserialise it.
 *
 * @since 0.1.0
 *
 * @return int Maximum presets per user.
 */
function daguerre_max_presets() {
	/**
	 * Filters the maximum number of presets a user may store.
	 *
	 * @since 0.1.0
	 *
	 * @param int $max Maximum presets.
	 */
	return (int) apply_filters( 'daguerre_max_presets', 100 );
}

/**
 * Reads a user's presets.
 *
 * @since 0.1.0
 *
 * @param int $user_id Optional. User ID. Default 0, meaning the current user.
 * @return array List of presets, each with `id`, `name` and `recipe`.
 */
function daguerre_get_presets( $user_id = 0 ) {
	$user_id = $user_id ? (int) $user_id : get_current_user_id();
	$stored  = get_user_meta( $user_id, DAGUERRE_PRESETS_META, true );

	if ( ! is_array( $stored ) ) {
		return array();
	}

	$presets = array();

	foreach ( $stored as $preset ) {
		if ( ! is_array( $preset ) || empty( $preset['id'] ) || ! isset( $preset['recipe'] ) ) {
			continue;
		}

		$presets[] = array(
			'id'     => (string) $preset['id'],
			'name'   => isset( $preset['name'] ) ? (string) $preset['name'] : '',
			'recipe' => $preset['recipe'],
		);
	}

	return $presets;
}

/**
 * Strips the parts of a recipe that belong to one particular photograph.
 *
 * The canvas and the layer transform are deliberately dropped: a crop and a scale
 * are statements about one particular frame, and carrying them into a preset would
 * silently re-crop and re-position every image it was applied to. Adjustments,
 * curves and levels are the parts that describe a *look*.
 *
 * @since 0.1.0
 *
 * @param array $recipe Validated recipe.
 * @return array Portable subset.
 */
function daguerre_recipe_to_preset( $recipe ) {
	return array(
		'version' => DAGUERRE_RECIPE_VERSION,
		'ops'     => isset( $recipe['ops'] ) ? $recipe['ops'] : array(),
		'curves'  => isset( $recipe['curves'] ) ? $recipe['curves'] : array(),
		'levels'  => isset( $recipe['levels'] ) ? $recipe['levels'] : daguerre_default_levels(),
	);
}

/**
 * Saves a preset for the current user.
 *
 * @since 0.1.0
 *
 * @param string $name   Display name.
 * @param array  $recipe Validated recipe to derive the preset from.
 * @return array|WP_Error The stored preset, or an error.
 */
function daguerre_save_preset( $name, $recipe ) {
	$user_id = get_current_user_id();

	if ( ! $user_id ) {
		return new WP_Error(
			'daguerre_not_logged_in',
			__( 'You must be logged in to save a preset.', 'daguerre' ),
			array( 'status' => 401 )
		);
	}

	$name = trim( sanitize_text_field( $name ) );

	if ( '' === $name ) {
		return new WP_Error(
			'daguerre_preset_no_name',
			__( 'A preset needs a name.', 'daguerre' ),
			array( 'status' => 400 )
		);
	}

	$presets = daguerre_get_presets( $user_id );

	if ( count( $presets ) >= daguerre_max_presets() ) {
		return new WP_Error(
			'daguerre_too_many_presets',
			__( 'You have reached the maximum number of presets. Delete one first.', 'daguerre' ),
			array( 'status' => 400 )
		);
	}

	$preset = array(
		'id'     => wp_generate_uuid4(),
		'name'   => $name,
		'recipe' => daguerre_recipe_to_preset( $recipe ),
	);

	$presets[] = $preset;

	update_user_meta( $user_id, DAGUERRE_PRESETS_META, $presets );

	/**
	 * Fires after a preset is saved.
	 *
	 * @since 0.1.0
	 *
	 * @param array $preset  The stored preset.
	 * @param int   $user_id Owner.
	 */
	do_action( 'daguerre_preset_saved', $preset, $user_id );

	return $preset;
}

/**
 * Deletes one of the current user's presets.
 *
 * @since 0.1.0
 *
 * @param string $preset_id Preset identifier.
 * @return true|WP_Error True on success, or an error.
 */
function daguerre_delete_preset( $preset_id ) {
	$user_id = get_current_user_id();
	$presets = daguerre_get_presets( $user_id );

	$remaining = array_values(
		array_filter(
			$presets,
			static function ( $preset ) use ( $preset_id ) {
				return $preset['id'] !== $preset_id;
			}
		)
	);

	if ( count( $remaining ) === count( $presets ) ) {
		return new WP_Error(
			'daguerre_preset_not_found',
			__( 'That preset no longer exists.', 'daguerre' ),
			array( 'status' => 404 )
		);
	}

	update_user_meta( $user_id, DAGUERRE_PRESETS_META, $remaining );

	return true;
}
