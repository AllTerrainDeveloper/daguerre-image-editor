<?php
/**
 * Bringing a stored recipe up to the current schema version.
 *
 * Mirrors `migrateRecipe()` in `src/model/recipe/migrate.ts`. A recipe stored by an
 * older release has to open without losing an edit, so every version bump that
 * changes the shape gets a step here.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Migrates a recipe from an older schema version to the current one.
 *
 * - v1 knew only scalar adjustments. Adding curves and levels at rest reproduces a
 *   v1 render exactly, so nothing is lost.
 * - v2 stored a `geometry` block that cropped the source directly. v3 replaced it
 *   with an independent canvas and a layer transform, because conflating the two
 *   made a transform drag resize the surface it was being measured against.
 * - v4 split the layer's `scale` into `scaleX` and `scaleY`. A v3 layer needs no
 *   rewriting: the validator reads a legacy uniform scale into both axes.
 *
 * No stored recipe needs re-saving; migration is applied on read.
 *
 * @since 0.1.0
 *
 * @param array $recipe Raw recipe array.
 * @return array Recipe at the current schema version.
 */
function lienzo_migrate_recipe( $recipe ) {
	$version = isset( $recipe['version'] ) ? (int) $recipe['version'] : 1;

	if ( $version < 2 ) {
		$recipe['curves'] = array();
		$recipe['levels'] = lienzo_default_levels();
	}

	if ( $version < 3 ) {
		$geometry = isset( $recipe['geometry'] ) && is_array( $recipe['geometry'] )
			? $recipe['geometry']
			: array();

		$rotate     = isset( $geometry['rotate'] ) ? (float) $geometry['rotate'] : 0.0;
		$straighten = isset( $geometry['straighten'] ) ? (float) $geometry['straighten'] : 0.0;

		// The canvas is left unsized for the editor to fill from the image. Sizing
		// it here would need the source dimensions, which validation does not have;
		// the rotation and flips -- the parts a user would notice losing -- carry
		// across exactly.
		$recipe['canvas'] = array(
			'width'  => 0,
			'height' => 0,
		);
		$recipe['layer']  = array_merge(
			lienzo_default_layer(),
			array(
				'rotation' => $rotate + $straighten,
				'flipH'    => ! empty( $geometry['flipH'] ),
				'flipV'    => ! empty( $geometry['flipV'] ),
			)
		);

		unset( $recipe['geometry'] );
	}

	// v4 -> v5 wrapped the single transform in a one-layer stack, so that a paste, a
	// dropped photo or a line of text can be an object of its own.
	if ( $version < 5 ) {
		$transform = isset( $recipe['layer'] ) ? $recipe['layer'] : null;

		$recipe['layers']        = array(
			array_merge(
				lienzo_default_layer_entry(),
				array( 'transform' => lienzo_validate_layer( $transform ) )
			),
		);
		$recipe['activeLayerId'] = LIENZO_BASE_LAYER_ID;

		unset( $recipe['layer'] );
	}

	$recipe['version'] = LIENZO_RECIPE_VERSION;

	return $recipe;
}

/**
 * Returns the base image layer every document starts with.
 *
 * @since 0.1.0
 *
 * @return array Layer entry.
 */
function lienzo_default_layer_entry() {
	return array(
		'id'        => LIENZO_BASE_LAYER_ID,
		'name'      => 'Image',
		'kind'      => 'image',
		'transform' => lienzo_default_layer(),
		'visible'   => true,
		'opacity'   => 1.0,
	);
}
