<?php
/**
 * REST routes under lienzo/v1.
 *
 * @package Lienzo
 */

/**
 * Tests for includes/rest.php.
 *
 * @group lienzo
 * @group lienzo-rest
 */
class Tests_Lienzo_Rest extends WP_UnitTestCase {

	/**
	 * Administrator user ID.
	 *
	 * @var int
	 */
	private $admin;

	/**
	 * Subscriber user ID.
	 *
	 * @var int
	 */
	private $subscriber;

	/**
	 * Spins up the REST server for each test.
	 *
	 * @return void
	 */
	public function set_up() {
		parent::set_up();

		$this->admin      = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$this->subscriber = self::factory()->user->create( array( 'role' => 'subscriber' ) );

		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		do_action( 'rest_api_init', $wp_rest_server );
	}

	/**
	 * Creates an image attachment from the test suite's sample JPEG.
	 *
	 * @return int Attachment ID.
	 */
	private function make_image() {
		return self::factory()->attachment->create_upload_object( DIR_TESTDATA . '/images/canola.jpg' );
	}

	/**
	 * Both routes are registered.
	 *
	 * @covers ::lienzo_register_rest_routes
	 */
	public function test_routes_are_registered() {
		$routes = rest_get_server()->get_routes();

		$this->assertArrayHasKey( '/lienzo/v1/media/(?P<id>[\d]+)', $routes );
		$this->assertArrayHasKey( '/lienzo/v1/media/(?P<id>[\d]+)/source', $routes );
	}

	/**
	 * An anonymous request is a 401, distinguishable from a permission failure.
	 *
	 * @covers ::lienzo_rest_permission
	 */
	public function test_anonymous_request_is_unauthorized() {
		$id = $this->make_image();
		wp_set_current_user( 0 );

		$response = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $id ) );

		$this->assertSame( 401, $response->get_status() );
		$this->assertSame( 'lienzo_not_logged_in', $response->get_data()['code'] );
	}

	/**
	 * A logged-in user without the capability is a 403.
	 *
	 * @covers ::lienzo_rest_permission
	 */
	public function test_subscriber_is_forbidden() {
		$id = $this->make_image();
		wp_set_current_user( $this->subscriber );

		$response = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $id ) );

		$this->assertSame( 403, $response->get_status() );
		$this->assertSame( 'lienzo_cannot_edit', $response->get_data()['code'] );
	}

	/**
	 * An administrator gets the payload the editor needs to open an image.
	 *
	 * @covers ::lienzo_rest_get_media
	 */
	public function test_get_media_returns_editor_payload() {
		$id = $this->make_image();
		wp_set_current_user( $this->admin );

		$response = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $id ) );
		$data     = $response->get_data();

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( $id, $data['id'] );
		$this->assertSame( $id, $data['sourceId'] );
		$this->assertSame( 'image/jpeg', $data['mime'] );
		$this->assertGreaterThan( 0, $data['width'] );
		$this->assertGreaterThan( 0, $data['height'] );
		$this->assertNotEmpty( $data['url'] );
		$this->assertStringContainsString( '/source', $data['sourceUrl'] );
		$this->assertTrue( $data['canSave'] );
		$this->assertArrayHasKey( 'exposure', $data['schema'] );
	}

	/**
	 * With no prior edit the payload carries an empty default recipe.
	 *
	 * @covers ::lienzo_rest_get_media
	 */
	public function test_get_media_returns_default_recipe() {
		$id = $this->make_image();
		wp_set_current_user( $this->admin );

		$data = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $id ) )->get_data();

		$this->assertSame( LIENZO_RECIPE_VERSION, $data['recipe']['version'] );
		$this->assertSame( array(), $data['recipe']['ops'] );
	}

	/**
	 * A stored recipe comes back so re-opening restores every slider.
	 *
	 * @covers ::lienzo_rest_get_media
	 */
	public function test_get_media_returns_stored_recipe() {
		$id = $this->make_image();
		update_post_meta(
			$id,
			LIENZO_RECIPE_META,
			wp_json_encode(
				array(
					'version' => 1,
					'source'  => $id,
					'ops'     => array(
						array(
							'type' => 'contrast',
							'v'    => 0.4,
						),
					),
					'output'  => array(
						'format'  => 'image/jpeg',
						'quality' => 0.9,
					),
				)
			)
		);

		wp_set_current_user( $this->admin );
		$data = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $id ) )->get_data();

		$this->assertCount( 1, $data['recipe']['ops'] );
		$this->assertSame( 'contrast', $data['recipe']['ops'][0]['type'] );
	}

	/**
	 * Opening a rendered image serves the pixels of the original it came from.
	 *
	 * @covers ::lienzo_rest_get_media
	 */
	public function test_get_media_follows_source_pointer() {
		$original = $this->make_image();
		$derived  = $this->make_image();
		update_post_meta( $derived, LIENZO_SOURCE_META, $original );

		wp_set_current_user( $this->admin );
		$data = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $derived ) )->get_data();

		$this->assertSame( $derived, $data['id'] );
		$this->assertSame( $original, $data['sourceId'] );
	}

	/**
	 * A non-image attachment is refused before any file work happens.
	 *
	 * @covers ::lienzo_rest_permission
	 */
	public function test_non_image_attachment_is_forbidden() {
		$id = self::factory()->attachment->create_object(
			array(
				'file'           => 'notes.txt',
				'post_mime_type' => 'text/plain',
			)
		);

		wp_set_current_user( $this->admin );
		$response = rest_do_request( new WP_REST_Request( 'GET', '/lienzo/v1/media/' . $id ) );

		$this->assertSame( 403, $response->get_status() );
	}

	/**
	 * The config blob handed to the browser carries the routes and the op schema.
	 *
	 * @covers ::lienzo_get_config
	 */
	public function test_config_blob_shape() {
		wp_set_current_user( $this->admin );
		$config = lienzo_get_config();

		$this->assertStringContainsString( 'lienzo/v1', $config['restUrl'] );
		$this->assertNotEmpty( $config['restNonce'] );
		// No Pixi URL: the shell's module registry supplies it, so shipping one would
		// mean a second Pixi 8 on the page fighting the first over GPU resources.
		$this->assertArrayNotHasKey( 'pixiUrl', $config );
		$this->assertTrue( $config['desktopMode'] );
		$this->assertGreaterThan( 0, $config['maxRenderPixels'] );
		$this->assertTrue( $config['canUpload'] );
		$this->assertArrayHasKey( 'hue', $config['schema'] );
	}
}
