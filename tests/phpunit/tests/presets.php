<?php
/**
 * User presets.
 *
 * @package Lienzo
 */

/**
 * Tests for includes/presets.php and the preset routes.
 *
 * @group lienzo
 * @group lienzo-presets
 */
class Tests_Lienzo_Presets extends WP_UnitTestCase {

	/**
	 * Administrator user ID.
	 *
	 * @var int
	 */
	private $admin;

	/**
	 * Spins up the REST server.
	 *
	 * @return void
	 */
	public function set_up() {
		parent::set_up();

		$this->admin = self::factory()->user->create( array( 'role' => 'administrator' ) );

		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		do_action( 'rest_api_init', $wp_rest_server );
	}

	/**
	 * A recipe with something in every section.
	 *
	 * @return array Recipe.
	 */
	private function recipe() {
		$recipe           = lienzo_default_recipe( 7 );
		$recipe['ops']    = array(
			array(
				'type' => 'saturation',
				'v'    => -1.0,
			),
		);
		$recipe['levels'] = array(
			'black' => 12,
			'white' => 240,
			'gamma' => 1.2,
		);
		$recipe['canvas'] = array(
			'width'  => 800,
			'height' => 600,
		);
		$recipe['layer']  = array(
			'x'        => 0.4,
			'y'        => 0.6,
			'scale'    => 1.5,
			'rotation' => 12.0,
			'flipH'    => true,
			'flipV'    => false,
		);
		$recipe['curves'] = array(
			'rgb' => array( array( 0, 0 ), array( 128, 200 ), array( 255, 255 ) ),
		);

		return $recipe;
	}

	/**
	 * A preset keeps the look and drops the crop.
	 *
	 * A crop is a statement about one particular frame. Carrying it into a preset
	 * would silently re-crop every image the look was applied to.
	 *
	 * @covers ::lienzo_recipe_to_preset
	 */
	public function test_preset_strips_geometry_and_source() {
		$preset = lienzo_recipe_to_preset( $this->recipe() );

		$this->assertArrayNotHasKey( 'canvas', $preset );
		$this->assertArrayNotHasKey( 'layer', $preset );
		$this->assertArrayNotHasKey( 'source', $preset );
		$this->assertSame( 'saturation', $preset['ops'][0]['type'] );
		$this->assertSame( 12, $preset['levels']['black'] );
		$this->assertArrayHasKey( 'rgb', $preset['curves'] );
	}

	/**
	 * Saving and listing round-trips.
	 *
	 * @covers ::lienzo_save_preset
	 * @covers ::lienzo_get_presets
	 */
	public function test_save_and_list() {
		wp_set_current_user( $this->admin );

		$preset = lienzo_save_preset( 'Mono', $this->recipe() );

		$this->assertNotWPError( $preset );
		$this->assertSame( 'Mono', $preset['name'] );
		$this->assertNotEmpty( $preset['id'] );

		$presets = lienzo_get_presets();

		$this->assertCount( 1, $presets );
		$this->assertSame( 'Mono', $presets[0]['name'] );
	}

	/**
	 * Presets belong to one user and are invisible to another.
	 *
	 * @covers ::lienzo_get_presets
	 */
	public function test_presets_are_per_user() {
		$other = self::factory()->user->create( array( 'role' => 'administrator' ) );

		wp_set_current_user( $this->admin );
		lienzo_save_preset( 'Mine', $this->recipe() );

		wp_set_current_user( $other );

		$this->assertSame( array(), lienzo_get_presets() );
	}

	/**
	 * An unnamed preset is rejected.
	 *
	 * @covers ::lienzo_save_preset
	 */
	public function test_rejects_empty_name() {
		wp_set_current_user( $this->admin );

		$result = lienzo_save_preset( '   ', $this->recipe() );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_preset_no_name', $result->get_error_code() );
	}

	/**
	 * The per-user ceiling is enforced.
	 *
	 * Presets live in a single serialised meta row, so without a cap a script could
	 * grow it until every page load paid to unserialise it.
	 *
	 * @covers ::lienzo_save_preset
	 */
	public function test_enforces_the_ceiling() {
		wp_set_current_user( $this->admin );

		add_filter( 'lienzo_max_presets', static fn() => 2 );

		$this->assertNotWPError( lienzo_save_preset( 'One', $this->recipe() ) );
		$this->assertNotWPError( lienzo_save_preset( 'Two', $this->recipe() ) );

		$result = lienzo_save_preset( 'Three', $this->recipe() );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_too_many_presets', $result->get_error_code() );
	}

	/**
	 * A name is sanitised rather than stored raw.
	 *
	 * @covers ::lienzo_save_preset
	 */
	public function test_sanitises_the_name() {
		wp_set_current_user( $this->admin );

		$preset = lienzo_save_preset( '<script>alert(1)</script>Warm', $this->recipe() );

		$this->assertStringNotContainsString( '<script>', $preset['name'] );
	}

	/**
	 * Deleting removes only the named preset.
	 *
	 * @covers ::lienzo_delete_preset
	 */
	public function test_delete() {
		wp_set_current_user( $this->admin );

		$keep   = lienzo_save_preset( 'Keep', $this->recipe() );
		$remove = lienzo_save_preset( 'Remove', $this->recipe() );

		$this->assertTrue( lienzo_delete_preset( $remove['id'] ) );

		$presets = lienzo_get_presets();

		$this->assertCount( 1, $presets );
		$this->assertSame( $keep['id'], $presets[0]['id'] );
	}

	/**
	 * Deleting something that is not there is an error, not a silent success.
	 *
	 * @covers ::lienzo_delete_preset
	 */
	public function test_delete_missing() {
		wp_set_current_user( $this->admin );

		$result = lienzo_delete_preset( 'nope' );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_preset_not_found', $result->get_error_code() );
	}

	/**
	 * The routes are registered and round-trip.
	 *
	 * @covers ::lienzo_rest_create_preset
	 * @covers ::lienzo_rest_get_presets
	 */
	public function test_routes_round_trip() {
		wp_set_current_user( $this->admin );

		$create = new WP_REST_Request( 'POST', '/lienzo/v1/presets' );
		$create->set_param( 'name', 'Faded' );
		$create->set_param( 'recipe', wp_json_encode( $this->recipe() ) );

		$response = rest_do_request( $create );

		$this->assertSame( 201, $response->get_status() );

		$listed = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/presets' ) );

		$this->assertCount( 1, $listed->get_data() );
		$this->assertSame( 'Faded', $listed->get_data()[0]['name'] );
	}

	/**
	 * An anonymous request cannot read or write presets.
	 *
	 * @covers ::lienzo_rest_presets_permission
	 */
	public function test_routes_require_a_user() {
		wp_set_current_user( 0 );

		$response = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/presets' ) );

		$this->assertSame( 401, $response->get_status() );
	}

	/**
	 * A subscriber is refused.
	 *
	 * @covers ::lienzo_rest_presets_permission
	 */
	public function test_routes_require_upload_capability() {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$response = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/presets' ) );

		$this->assertSame( 403, $response->get_status() );
	}
}
