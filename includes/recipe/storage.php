<?php
/**
 * Reading a stored recipe back off an attachment.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads and validates the stored recipe for an attachment.
 *
 * A stored recipe that no longer validates (because an op was removed by a plugin
 * deactivation, say) is treated as absent rather than fatal, so the editor still
 * opens with the image intact and the sliders at zero.
 *
 * @since 0.1.0
 *
 * @param int $attachment_id Attachment post ID.
 * @return array|null Validated recipe, or null when there is none.
 */
function lienzo_get_recipe( $attachment_id ) {
	$stored = lienzo_get_meta(
		(int) $attachment_id,
		LIENZO_RECIPE_META,
		LIENZO_LEGACY_RECIPE_META
	);

	if ( empty( $stored ) ) {
		return null;
	}

	$recipe = lienzo_validate_recipe( $stored );

	return is_wp_error( $recipe ) ? null : $recipe;
}

/**
 * Whether a recipe describes everything about the image it produced.
 *
 * An adjustment, a crop and a transform are instructions: given the original pixels,
 * they can be replayed exactly. A painted, pasted or dropped layer is not. Those are
 * pixels, and they exist only in the texture the browser rendered them into and in the
 * flattened file that was saved.
 *
 * The distinction decides what re-opening a saved image should do, which is why it
 * lives here beside the recipe rather than being inferred at the call site.
 *
 * @since 0.1.0
 *
 * @param array $recipe Validated recipe.
 * @return bool True when replaying the recipe over the original reproduces the save.
 */
function lienzo_recipe_is_reproducible( $recipe ) {
	if ( ! isset( $recipe['layers'] ) || ! is_array( $recipe['layers'] ) ) {
		return true;
	}

	foreach ( $recipe['layers'] as $layer ) {
		if ( isset( $layer['kind'] ) && 'image' !== $layer['kind'] ) {
			return false;
		}
	}

	return true;
}
