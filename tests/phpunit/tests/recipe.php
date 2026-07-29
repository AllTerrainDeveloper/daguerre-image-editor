<?php
/**
 * Recipe schema and validation.
 *
 * @package Daguerre
 */

/**
 * Tests for daguerre_validate_recipe() and friends.
 *
 * @group daguerre
 * @group daguerre-recipe
 */
class Tests_Daguerre_Recipe extends WP_UnitTestCase {

	/**
	 * Builds a minimal valid recipe with the given ops.
	 *
	 * @param array $ops Op list.
	 * @return array Recipe.
	 */
	private function recipe( $ops = array() ) {
		$recipe        = daguerre_default_recipe( 42 );
		$recipe['ops'] = $ops;

		return $recipe;
	}

	/**
	 * A well-formed recipe survives validation unchanged.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_valid_recipe_round_trips() {
		$recipe = $this->recipe(
			array(
				array(
					'type' => 'exposure',
					'v'    => 0.25,
				),
			)
		);
		$result = daguerre_validate_recipe( $recipe );

		$this->assertNotWPError( $result );
		$this->assertSame( DAGUERRE_RECIPE_VERSION, $result['version'] );
		$this->assertSame( 42, $result['source'] );
		$this->assertCount( 1, $result['ops'] );
		$this->assertSame( 'exposure', $result['ops'][0]['type'] );
		$this->assertEqualsWithDelta( 0.25, $result['ops'][0]['v'], 1e-9 );
	}

	/**
	 * A JSON string is accepted as readily as a decoded array.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_accepts_json_string() {
		$result = daguerre_validate_recipe( wp_json_encode( $this->recipe() ) );

		$this->assertNotWPError( $result );
		$this->assertSame( 42, $result['source'] );
	}

	/**
	 * Malformed JSON is rejected rather than silently treated as empty.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_malformed_json() {
		$result = daguerre_validate_recipe( '{ not json' );

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_invalid_json', $result->get_error_code() );
	}

	/**
	 * A recipe from a newer schema than this site understands is rejected.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_future_version() {
		$recipe            = $this->recipe();
		$recipe['version'] = DAGUERRE_RECIPE_VERSION + 1;

		$result = daguerre_validate_recipe( $recipe );

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_bad_version', $result->get_error_code() );
	}

	/**
	 * An op type nothing knows how to render is rejected, not dropped.
	 *
	 * A dropped op would produce a recipe that re-opens showing sliders which do not
	 * match the pixels on screen, so this has to be loud.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_unknown_op() {
		$result = daguerre_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'teleport',
						'v'    => 1,
					),
				)
			)
		);

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_unknown_op', $result->get_error_code() );
		$this->assertSame( 'teleport', $result->get_error_data()['op'] );
	}

	/**
	 * Values outside an op's declared range are rejected.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_out_of_range_value() {
		$result = daguerre_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'exposure',
						'v'    => 4,
					),
				)
			)
		);

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_value_out_of_range', $result->get_error_code() );
	}

	/**
	 * Hue accepts the full degree range that exposure would reject.
	 *
	 * Guards against a regression where every op shares one hardcoded -1..1 bound.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_hue_uses_its_own_range() {
		$result = daguerre_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'hue',
						'v'    => 175,
					),
				)
			)
		);

		$this->assertNotWPError( $result );
		$this->assertEqualsWithDelta( 175.0, $result['ops'][0]['v'], 1e-9 );
	}

	/**
	 * The same op twice is rejected; last-wins would be ambiguous.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_duplicate_op() {
		$result = daguerre_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'contrast',
						'v'    => 0.1,
					),
					array(
						'type' => 'contrast',
						'v'    => 0.2,
					),
				)
			)
		);

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_duplicate_op', $result->get_error_code() );
	}

	/**
	 * An op sitting at its default is dropped so stored recipes stay minimal.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_drops_no_op_adjustments() {
		$result = daguerre_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'exposure',
						'v'    => 0,
					),
					array(
						'type' => 'contrast',
						'v'    => 0.3,
					),
				)
			)
		);

		$this->assertNotWPError( $result );
		$this->assertCount( 1, $result['ops'] );
		$this->assertSame( 'contrast', $result['ops'][0]['type'] );
	}

	/**
	 * A non-numeric value is rejected rather than coerced to zero.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_non_numeric_value() {
		$result = daguerre_validate_recipe(
			$this->recipe(
				array(
					array(
						'type' => 'exposure',
						'v'    => 'bright',
					),
				)
			)
		);

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_bad_value', $result->get_error_code() );
	}

	/**
	 * An output format the browser cannot encode is rejected.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_unsupported_output_format() {
		$recipe                     = $this->recipe();
		$recipe['output']['format'] = 'image/gif';

		$result = daguerre_validate_recipe( $recipe );

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_bad_format', $result->get_error_code() );
	}

	/**
	 * Quality outside 0.1..1.0 is rejected.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_bad_quality() {
		$recipe                      = $this->recipe();
		$recipe['output']['quality'] = 2.5;

		$result = daguerre_validate_recipe( $recipe );

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_bad_quality', $result->get_error_code() );
	}

	/**
	 * A recipe with no source attachment is rejected.
	 *
	 * @covers ::daguerre_validate_recipe
	 */
	public function test_rejects_missing_source() {
		$recipe           = $this->recipe();
		$recipe['source'] = 0;

		$result = daguerre_validate_recipe( $recipe );

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_recipe_bad_source', $result->get_error_code() );
	}

	/**
	 * Every op in the schema declares a range that contains its default.
	 *
	 * Cheap guard against a typo in the table that would make an op impossible to
	 * leave at rest.
	 *
	 * @covers ::daguerre_op_schema
	 */
	public function test_schema_defaults_are_in_range() {
		foreach ( daguerre_op_schema() as $type => $spec ) {
			$this->assertGreaterThanOrEqual( $spec['min'], $spec['default'], $type );
			$this->assertLessThanOrEqual( $spec['max'], $spec['default'], $type );
		}
	}

	/**
	 * A stored recipe that no longer validates reads back as absent, not fatal.
	 *
	 * @covers ::daguerre_get_recipe
	 */
	public function test_get_recipe_ignores_corrupt_meta() {
		$post_id = self::factory()->post->create();
		update_post_meta( $post_id, DAGUERRE_RECIPE_META, '{ broken' );

		$this->assertNull( daguerre_get_recipe( $post_id ) );
	}
}
