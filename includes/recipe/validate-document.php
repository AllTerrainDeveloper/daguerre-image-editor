<?php
/**
 * Validating the document: its canvas and its layer stack.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

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
