<?php
/**
 * The edit recipe: schema, defaults and validation.
 *
 * A recipe is the complete, resolution-independent description of an edit. It is
 * produced by the browser, validated here, stored as post meta on the rendered
 * attachment, and served back so re-opening the editor restores every slider.
 *
 * This file is one half of a contract. `src/model/recipe.ts` is the other half and
 * the two op tables must agree exactly. When you add an op, add it in both places
 * and add a case to `src/engine/color-matrix.ts`.
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

/**
 * Validates a layer stack.
 *
 * A document always has at least one layer, so an unusable stack falls back to a single
 * image layer rather than to nothing -- the pixels are still there either way, and an
 * empty stack would render a blank canvas over them.
 *
 * Only the *description* of a layer is stored. A raster layer's pixels live in a GPU
 * texture and nowhere else, which is why re-opening a saved edit restores adjustments
 * and geometry but not painted strokes; the flattened result is what was saved.
 *
 * @since 0.1.0
 *
 * @param array $raw Candidate recipe.
 * @return array Validated layer stack, never empty.
 */
function lienzo_validate_layers( $raw ) {
	$candidates = isset( $raw['layers'] ) && is_array( $raw['layers'] ) ? $raw['layers'] : array();
	$layers     = array();

	foreach ( $candidates as $candidate ) {
		if ( ! is_array( $candidate ) ) {
			continue;
		}

		$id   = isset( $candidate['id'] ) && is_string( $candidate['id'] ) && '' !== $candidate['id']
			? $candidate['id']
			: LIENZO_BASE_LAYER_ID;
		$kind = isset( $candidate['kind'] ) && 'raster' === $candidate['kind'] ? 'raster' : 'image';

		$layers[] = array(
			'id'        => $id,
			'name'      => isset( $candidate['name'] ) && is_string( $candidate['name'] )
				? sanitize_text_field( $candidate['name'] )
				: 'Image',
			'kind'      => $kind,
			'transform' => lienzo_validate_layer(
				isset( $candidate['transform'] ) ? $candidate['transform'] : null
			),
			'visible'   => ! isset( $candidate['visible'] ) || (bool) $candidate['visible'],
			'opacity'   => isset( $candidate['opacity'] ) && is_numeric( $candidate['opacity'] )
				? min( 1.0, max( 0.0, (float) $candidate['opacity'] ) )
				: 1.0,
		);
	}

	if ( empty( $layers ) ) {
		// A pre-v5 recipe carries one transform under `layer`; anything else falls back
		// to an untransformed base image.
		$layers[] = array_merge(
			lienzo_default_layer_entry(),
			array(
				'transform' => lienzo_validate_layer(
					isset( $raw['layer'] ) ? $raw['layer'] : null
				),
			)
		);
	}

	return $layers;
}

/**
 * Validates a canvas size.
 *
 * Zero means "not sized yet" and is legitimate: a freshly migrated recipe has no
 * canvas until the editor opens the image and fills it in.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Candidate canvas.
 * @return array Normalised canvas size.
 */
function lienzo_validate_canvas( $raw ) {
	$canvas = array(
		'width'  => 0,
		'height' => 0,
	);

	if ( ! is_array( $raw ) ) {
		return $canvas;
	}

	$width  = isset( $raw['width'] ) ? (int) $raw['width'] : 0;
	$height = isset( $raw['height'] ) ? (int) $raw['height'] : 0;

	if ( $width <= 0 || $height <= 0 ) {
		return $canvas;
	}

	return array(
		'width'  => max( 16, $width ),
		'height' => max( 16, $height ),
	);
}

/**
 * Validates a layer transform.
 *
 * Position is deliberately unclamped: a layer may hang off the edge of the canvas,
 * which is exactly what happens when one is scaled up to fill a frame.
 *
 * @since 0.1.0
 *
 * @param mixed $raw Candidate transform.
 * @return array Normalised layer transform.
 */
function lienzo_validate_layer( $raw ) {
	$layer = lienzo_default_layer();

	if ( ! is_array( $raw ) ) {
		return $layer;
	}

	foreach ( array( 'x', 'y' ) as $axis ) {
		if ( isset( $raw[ $axis ] ) && is_numeric( $raw[ $axis ] ) ) {
			$layer[ $axis ] = (float) $raw[ $axis ];
		}
	}

	// A pre-v4 layer carried one `scale` for both axes.
	$uniform = isset( $raw['scale'] ) && is_numeric( $raw['scale'] )
		? (float) $raw['scale']
		: 1.0;

	foreach ( array( 'scaleX', 'scaleY' ) as $axis ) {
		$value          = isset( $raw[ $axis ] ) && is_numeric( $raw[ $axis ] )
			? (float) $raw[ $axis ]
			: $uniform;
		$layer[ $axis ] = min( 20.0, max( 0.02, $value ) );
	}

	if ( isset( $raw['rotation'] ) && is_numeric( $raw['rotation'] ) ) {
		$rotation = fmod( (float) $raw['rotation'], 360.0 );

		if ( $rotation > 180.0 ) {
			$rotation -= 360.0;
		}

		if ( $rotation <= -180.0 ) {
			$rotation += 360.0;
		}

		$layer['rotation'] = $rotation;
	}

	$layer['flipH'] = ! empty( $raw['flipH'] );
	$layer['flipV'] = ! empty( $raw['flipV'] );

	return $layer;
}

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

	$ops_raw = isset( $raw['ops'] ) ? $raw['ops'] : array();

	if ( ! is_array( $ops_raw ) ) {
		return new WP_Error(
			'lienzo_recipe_bad_ops',
			__( 'The edit recipe operations must be a list.', 'lienzo' ),
			array( 'status' => 400 )
		);
	}

	$schema = lienzo_op_schema();
	$ops    = array();
	$seen   = array();

	foreach ( $ops_raw as $op ) {
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

	$output  = isset( $raw['output'] ) && is_array( $raw['output'] ) ? $raw['output'] : array();
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
