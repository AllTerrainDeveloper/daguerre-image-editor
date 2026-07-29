<?php
/**
 * The save pipeline.
 *
 * @package Daguerre
 */

/**
 * Tests for includes/render.php and the render route.
 *
 * @group daguerre
 * @group daguerre-render
 */
class Tests_Daguerre_Render extends WP_UnitTestCase {

	/**
	 * Administrator user ID.
	 *
	 * @var int
	 */
	private $admin;

	/**
	 * Files copied into the uploads directory, cleaned up after each test.
	 *
	 * @var string[]
	 */
	private $temp_files = array();

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
	 * Removes any staged upload temp files.
	 *
	 * @return void
	 */
	public function tear_down() {
		foreach ( $this->temp_files as $file ) {
			if ( file_exists( $file ) ) {
				wp_delete_file( $file );
			}
		}

		$this->temp_files = array();

		parent::tear_down();
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
	 * Stages a file the way PHP would present an upload.
	 *
	 * `wp_handle_sideload()` moves the file, so each test needs its own copy.
	 *
	 * @param string $source Path to copy.
	 * @param string $name   Filename the client claims.
	 * @return array Upload array.
	 */
	private function staged_upload( $source, $name ) {
		$tmp = wp_tempnam( $name );
		copy( $source, $tmp );

		$this->temp_files[] = $tmp;

		return array(
			'tmp_name' => $tmp,
			'name'     => $name,
			'type'     => 'image/jpeg',
			'size'     => filesize( $tmp ),
			'error'    => 0,
		);
	}

	/**
	 * Builds a valid recipe for a source attachment.
	 *
	 * @param int $source_id Source attachment.
	 * @return array Recipe.
	 */
	private function recipe( $source_id ) {
		return array(
			'version' => DAGUERRE_RECIPE_VERSION,
			'source'  => $source_id,
			'ops'     => array(
				array(
					'type' => 'contrast',
					'v'    => 0.3,
				),
			),
			'output'  => array(
				'format'  => 'image/jpeg',
				'quality' => 0.9,
			),
		);
	}

	/**
	 * Saving creates a new attachment and leaves the original untouched.
	 *
	 * This is the whole promise of the plugin, so it is asserted on the bytes: the
	 * source file's path and modification time must both survive a save.
	 *
	 * @covers ::daguerre_store_render
	 */
	public function test_save_creates_new_attachment_and_preserves_original() {
		wp_set_current_user( $this->admin );

		$source_id   = $this->make_image();
		$source_path = get_attached_file( $source_id );
		$before      = filemtime( $source_path );

		$new_id = daguerre_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertNotWPError( $new_id );
		$this->assertNotSame( $source_id, $new_id );

		clearstatcache();
		$this->assertFileExists( $source_path );
		$this->assertSame( $before, filemtime( $source_path ) );
		$this->assertSame( $source_path, get_attached_file( $source_id ) );
	}

	/**
	 * The recipe and the source pointer are stored on the new attachment.
	 *
	 * @covers ::daguerre_store_render
	 */
	public function test_save_stores_recipe_and_source() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$new_id    = daguerre_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertSame( $source_id, (int) get_post_meta( $new_id, DAGUERRE_SOURCE_META, true ) );

		$stored = daguerre_get_recipe( $new_id );

		$this->assertIsArray( $stored );
		$this->assertSame( 'contrast', $stored['ops'][0]['type'] );
	}

	/**
	 * Re-opening a saved image resolves back to the original's pixels.
	 *
	 * @covers ::daguerre_resolve_source_id
	 */
	public function test_saved_image_reopens_against_the_original() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$new_id    = daguerre_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$data = rest_do_request( new WP_REST_Request( 'GET', '/daguerre/v1/media/' . $new_id ) )->get_data();

		$this->assertSame( $new_id, $data['id'] );
		$this->assertSame( $source_id, $data['sourceId'] );
		$this->assertSame( 'contrast', $data['recipe']['ops'][0]['type'] );
	}

	/**
	 * Alt text follows the image to its rendered copy.
	 *
	 * @covers ::daguerre_store_render
	 */
	public function test_save_copies_alt_text() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		update_post_meta( $source_id, '_wp_attachment_image_alt', 'A field of canola' );

		$new_id = daguerre_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertSame(
			'A field of canola',
			get_post_meta( $new_id, '_wp_attachment_image_alt', true )
		);
	}

	/**
	 * Core's provenance metadata is recorded alongside our own pointer.
	 *
	 * @covers ::daguerre_store_render
	 */
	public function test_save_records_parent_image() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();
		$new_id    = daguerre_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$metadata = wp_get_attachment_metadata( $new_id );

		$this->assertSame( $source_id, $metadata['parent_image']['attachment_id'] );
	}

	/**
	 * The saved action fires with the new and source IDs.
	 *
	 * @covers ::daguerre_store_render
	 */
	public function test_save_fires_action() {
		wp_set_current_user( $this->admin );

		$seen = array();

		add_action(
			'daguerre_image_saved',
			static function ( $new_id, $source_id ) use ( &$seen ) {
				$seen = array( $new_id, $source_id );
			},
			10,
			3
		);

		$source_id = $this->make_image();
		$new_id    = daguerre_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertSame( array( $new_id, $source_id ), $seen );
	}

	/**
	 * A disguised PHP file is rejected rather than becoming an attachment.
	 *
	 * The endpoint takes arbitrary bytes from an authenticated client, so the MIME
	 * re-check after sideloading is load-bearing security, not belt and braces.
	 *
	 * @covers ::daguerre_store_render
	 */
	public function test_save_rejects_disguised_php() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();

		$tmp = wp_tempnam( 'evil.jpg' );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Staging a hostile payload on disk; WP_Filesystem would sanitise what this test needs raw.
		file_put_contents( $tmp, "<?php echo 'pwned'; ?>" );
		$this->temp_files[] = $tmp;

		$result = daguerre_store_render(
			array(
				'tmp_name' => $tmp,
				'name'     => 'evil.jpg',
				'type'     => 'image/jpeg',
				'size'     => filesize( $tmp ),
				'error'    => 0,
			),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertWPError( $result );
	}

	/**
	 * A render larger than the site's ceiling is refused.
	 *
	 * @covers ::daguerre_store_render
	 */
	public function test_save_rejects_oversized_render() {
		wp_set_current_user( $this->admin );

		$source_id = $this->make_image();

		add_filter( 'daguerre_max_upload_bytes', static fn() => 10 );

		$result = daguerre_store_render(
			$this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ),
			$source_id,
			$this->recipe( $source_id )
		);

		$this->assertWPError( $result );
		$this->assertSame( 'daguerre_render_too_large', $result->get_error_code() );
	}

	/**
	 * The route refuses a recipe belonging to a different image.
	 *
	 * @covers ::daguerre_rest_render
	 */
	public function test_route_rejects_mismatched_recipe() {
		wp_set_current_user( $this->admin );

		$a = $this->make_image();
		$b = $this->make_image();

		$request = new WP_REST_Request( 'POST', '/daguerre/v1/media/' . $a . '/render' );
		$request->set_param( 'recipe', wp_json_encode( $this->recipe( $b ) ) );
		$request->set_file_params(
			array( 'file' => $this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ) )
		);

		$response = rest_do_request( $request );

		$this->assertSame( 400, $response->get_status() );
		$this->assertSame( 'daguerre_recipe_source_mismatch', $response->get_data()['code'] );
	}

	/**
	 * The route refuses a request with no file.
	 *
	 * @covers ::daguerre_rest_render
	 */
	public function test_route_rejects_missing_file() {
		wp_set_current_user( $this->admin );

		$id      = $this->make_image();
		$request = new WP_REST_Request( 'POST', '/daguerre/v1/media/' . $id . '/render' );
		$request->set_param( 'recipe', wp_json_encode( $this->recipe( $id ) ) );

		$response = rest_do_request( $request );

		$this->assertSame( 400, $response->get_status() );
		$this->assertSame( 'daguerre_render_missing_file', $response->get_data()['code'] );
	}

	/**
	 * A user who may edit the image but not upload cannot save.
	 *
	 * @covers ::daguerre_rest_save_permission
	 */
	public function test_route_requires_upload_capability() {
		$author = self::factory()->user->create( array( 'role' => 'author' ) );

		wp_set_current_user( $author );
		$id = $this->make_image();

		// Keep edit_post but revoke upload_files -- the exact split the callback
		// guards. Done through the capability filter rather than WP_User::add_cap(),
		// because the latter edits a fresh user object while the global current-user
		// object keeps its already-resolved capabilities.
		add_filter(
			'user_has_cap',
			static function ( $allcaps ) {
				$allcaps['upload_files'] = false;

				return $allcaps;
			}
		);

		$request = new WP_REST_Request( 'POST', '/daguerre/v1/media/' . $id . '/render' );
		$request->set_param( 'recipe', wp_json_encode( $this->recipe( $id ) ) );

		$response = rest_do_request( $request );

		$this->assertSame( 403, $response->get_status() );
		$this->assertSame( 'daguerre_cannot_upload', $response->get_data()['code'] );
	}

	/**
	 * The route round-trips: a saved render comes back with a 201 and its new ID.
	 *
	 * @covers ::daguerre_rest_render
	 */
	public function test_route_saves_and_reports_stored_dimensions() {
		wp_set_current_user( $this->admin );

		$id      = $this->make_image();
		$request = new WP_REST_Request( 'POST', '/daguerre/v1/media/' . $id . '/render' );
		$request->set_param( 'recipe', wp_json_encode( $this->recipe( $id ) ) );
		$request->set_file_params(
			array( 'file' => $this->staged_upload( DIR_TESTDATA . '/images/canola.jpg', 'canola.jpg' ) )
		);

		$response = rest_do_request( $request );
		$data     = $response->get_data();

		$this->assertSame( 201, $response->get_status() );
		$this->assertGreaterThan( 0, $data['id'] );
		$this->assertSame( $id, $data['sourceId'] );
		// Reported from stored metadata, not from what the client claimed.
		$this->assertGreaterThan( 0, $data['width'] );
		$this->assertGreaterThan( 0, $data['height'] );
		$this->assertStringContainsString( 'page=daguerre', $data['editUrl'] );
	}
}
