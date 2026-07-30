<?php
/**
 * Capability and source-resolution helpers.
 *
 * @package Lienzo
 */

/**
 * Tests for includes/helpers.php.
 *
 * @group lienzo
 * @group lienzo-helpers
 */
class Tests_Lienzo_Helpers extends WP_UnitTestCase {

	/**
	 * Creates an image attachment from the test suite's sample JPEG.
	 *
	 * @param int $author_id Optional. Attachment author.
	 * @return int Attachment ID.
	 */
	private function make_image( $author_id = 0 ) {
		$file = DIR_TESTDATA . '/images/canola.jpg';
		$id   = self::factory()->attachment->create_upload_object( $file );

		if ( $author_id ) {
			wp_update_post(
				array(
					'ID'          => $id,
					'post_author' => $author_id,
				)
			);
		}

		return $id;
	}

	/**
	 * JPEG, PNG, WebP and AVIF are editable; GIF is not.
	 *
	 * GIF is excluded because rendering it through a canvas silently flattens
	 * animation to one frame, which would be a data-losing surprise.
	 *
	 * @covers ::lienzo_is_supported_mime
	 */
	public function test_supported_mime_types() {
		$this->assertTrue( lienzo_is_supported_mime( 'image/jpeg' ) );
		$this->assertTrue( lienzo_is_supported_mime( 'image/png' ) );
		$this->assertTrue( lienzo_is_supported_mime( 'image/webp' ) );
		$this->assertFalse( lienzo_is_supported_mime( 'image/gif' ) );
		$this->assertFalse( lienzo_is_supported_mime( 'application/pdf' ) );
		$this->assertFalse( lienzo_is_supported_mime( '' ) );
	}

	/**
	 * An administrator can edit an image attachment.
	 *
	 * @covers ::lienzo_can_edit
	 */
	public function test_admin_can_edit_image() {
		$admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$id    = $this->make_image();

		wp_set_current_user( $admin );

		$this->assertTrue( lienzo_can_edit( $id ) );
	}

	/**
	 * A subscriber cannot edit an image attachment.
	 *
	 * @covers ::lienzo_can_edit
	 */
	public function test_subscriber_cannot_edit_image() {
		$subscriber = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		$id         = $this->make_image();

		wp_set_current_user( $subscriber );

		$this->assertFalse( lienzo_can_edit( $id ) );
	}

	/**
	 * An author cannot edit another user's attachment.
	 *
	 * @covers ::lienzo_can_edit
	 */
	public function test_author_cannot_edit_someone_elses_image() {
		$owner = self::factory()->user->create( array( 'role' => 'author' ) );
		$other = self::factory()->user->create( array( 'role' => 'author' ) );
		$id    = $this->make_image( $owner );

		wp_set_current_user( $other );

		$this->assertFalse( lienzo_can_edit( $id ) );
	}

	/**
	 * A non-attachment post is never editable, whatever the capability.
	 *
	 * @covers ::lienzo_can_edit
	 */
	public function test_non_attachment_is_not_editable() {
		$admin   = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$post_id = self::factory()->post->create();

		wp_set_current_user( $admin );

		$this->assertFalse( lienzo_can_edit( $post_id ) );
		$this->assertFalse( lienzo_can_edit( 0 ) );
		$this->assertFalse( lienzo_can_edit( 999999 ) );
	}

	/**
	 * The capability check honours an explicit user ID.
	 *
	 * @covers ::lienzo_can_edit
	 */
	public function test_can_edit_accepts_explicit_user_id() {
		$admin      = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$subscriber = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		$id         = $this->make_image();

		wp_set_current_user( 0 );

		$this->assertTrue( lienzo_can_edit( $id, $admin ) );
		$this->assertFalse( lienzo_can_edit( $id, $subscriber ) );
	}

	/**
	 * An attachment with no source pointer resolves to itself.
	 *
	 * @covers ::lienzo_resolve_source_id
	 */
	public function test_resolve_source_defaults_to_self() {
		$id = $this->make_image();

		$this->assertSame( $id, lienzo_resolve_source_id( $id ) );
	}

	/**
	 * A rendered attachment resolves back to the original it came from.
	 *
	 * This is what keeps a re-edit first-generation instead of re-rendering
	 * already-baked pixels.
	 *
	 * @covers ::lienzo_resolve_source_id
	 */
	public function test_resolve_source_follows_pointer() {
		$original = $this->make_image();
		$derived  = $this->make_image();

		update_post_meta( $derived, LIENZO_SOURCE_META, $original );

		$this->assertSame( $original, lienzo_resolve_source_id( $derived ) );
	}

	/**
	 * A pointer at a deleted attachment falls back to the attachment itself.
	 *
	 * @covers ::lienzo_resolve_source_id
	 */
	public function test_resolve_source_survives_deleted_original() {
		$original = $this->make_image();
		$derived  = $this->make_image();

		update_post_meta( $derived, LIENZO_SOURCE_META, $original );
		wp_delete_attachment( $original, true );

		$this->assertSame( $derived, lienzo_resolve_source_id( $derived ) );
	}

	/**
	 * A self-referential pointer does not loop.
	 *
	 * @covers ::lienzo_resolve_source_id
	 */
	public function test_resolve_source_ignores_self_pointer() {
		$id = $this->make_image();
		update_post_meta( $id, LIENZO_SOURCE_META, $id );

		$this->assertSame( $id, lienzo_resolve_source_id( $id ) );
	}

	/**
	 * A real attachment yields a readable path on disk.
	 *
	 * @covers ::lienzo_get_source_path
	 */
	public function test_source_path_resolves() {
		$id   = $this->make_image();
		$path = lienzo_get_source_path( $id );

		$this->assertNotWPError( $path );
		$this->assertFileExists( $path );
	}

	/**
	 * A missing attachment yields an error rather than a bare false.
	 *
	 * @covers ::lienzo_get_source_path
	 */
	public function test_source_path_errors_for_missing_attachment() {
		$result = lienzo_get_source_path( 999999 );

		$this->assertWPError( $result );
		$this->assertSame( 'lienzo_no_source_file', $result->get_error_code() );
	}

	/**
	 * The plugin only loads when Desktop Mode can host it.
	 *
	 * The bootstrap stubs the two functions, so this asserts the shape of the check
	 * rather than the absent case -- which cannot be exercised in the same process,
	 * because a plugin that returned early defines nothing to call.
	 *
	 * @covers ::lienzo_requirements_met
	 */
	public function test_requirements_track_the_functions_being_called() {
		$this->assertTrue( function_exists( 'desktop_mode_register_window' ) );
		$this->assertTrue( function_exists( 'desktop_mode_is_enabled' ) );
		$this->assertTrue( lienzo_requirements_met() );
	}
}
