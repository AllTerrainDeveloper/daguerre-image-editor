<?php
/**
 * Media Library entry points.
 *
 * @package Lienzo
 */

/**
 * Tests for includes/media-actions.php.
 *
 * @group lienzo
 * @group lienzo-media-actions
 */
class Tests_Lienzo_Media_Actions extends WP_UnitTestCase {

	/**
	 * Creates an image attachment from the test suite's sample JPEG.
	 *
	 * @return int Attachment ID.
	 */
	private function make_image() {
		return self::factory()->attachment->create_upload_object( DIR_TESTDATA . '/images/canola.jpg' );
	}

	/**
	 * An administrator sees the row action, pointing at the editor.
	 *
	 * @covers ::lienzo_media_row_action
	 */
	public function test_row_action_added_for_editable_image() {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$id      = $this->make_image();
		$actions = lienzo_media_row_action( array(), get_post( $id ) );

		$this->assertArrayHasKey( 'lienzo', $actions );
		// A button carrying the id, not a link: the editor is a desktop window, and a
		// link would open the shell's iframe view of a page that no longer exists.
		$this->assertStringContainsString( '<button', $actions['lienzo'] );
		$this->assertStringContainsString(
			'data-lienzo-open="' . $id . '"',
			$actions['lienzo']
		);
		$this->assertStringNotContainsString( 'href', $actions['lienzo'] );
	}

	/**
	 * The row action is absent for a user who cannot edit the attachment.
	 *
	 * A link that leads to a permission error is worse than no link at all.
	 *
	 * @covers ::lienzo_media_row_action
	 */
	public function test_row_action_hidden_without_capability() {
		$id = $this->make_image();

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$this->assertSame( array(), lienzo_media_row_action( array(), get_post( $id ) ) );
	}

	/**
	 * The row action is absent for file types the editor cannot open.
	 *
	 * @covers ::lienzo_media_row_action
	 */
	public function test_row_action_hidden_for_unsupported_type() {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$id = self::factory()->attachment->create_object(
			array(
				'file'           => 'notes.txt',
				'post_mime_type' => 'text/plain',
			)
		);

		$this->assertSame( array(), lienzo_media_row_action( array(), get_post( $id ) ) );
	}

	/**
	 * Existing row actions are preserved rather than replaced.
	 *
	 * @covers ::lienzo_media_row_action
	 */
	public function test_row_action_preserves_existing() {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$id      = $this->make_image();
		$actions = lienzo_media_row_action( array( 'edit' => '<a href="#">Edit</a>' ), get_post( $id ) );

		$this->assertArrayHasKey( 'edit', $actions );
		$this->assertArrayHasKey( 'lienzo', $actions );
	}

	/**
	 * The attachment edit screen gets a button.
	 *
	 * @covers ::lienzo_attachment_edit_button
	 */
	public function test_submitbox_button_rendered() {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$id = $this->make_image();

		ob_start();
		lienzo_attachment_edit_button( get_post( $id ) );
		$html = ob_get_clean();

		$this->assertStringContainsString( 'data-lienzo-open="' . $id . '"', $html );
		$this->assertStringNotContainsString( 'href', $html );
	}

	/**
	 * The button is not rendered without the capability.
	 *
	 * @covers ::lienzo_attachment_edit_button
	 */
	public function test_submitbox_button_hidden_without_capability() {
		$id = $this->make_image();

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		ob_start();
		lienzo_attachment_edit_button( get_post( $id ) );

		$this->assertSame( '', ob_get_clean() );
	}

	/**
	 * The config carries what the picker needs to list the library.
	 *
	 * @covers ::lienzo_get_config
	 */
	public function test_config_exposes_picker_inputs() {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$config = lienzo_get_config();

		$this->assertStringContainsString( 'wp/v2/media', $config['mediaUrl'] );
		$this->assertContains( 'image/jpeg', $config['supportedMimes'] );
		$this->assertNotContains( 'image/gif', $config['supportedMimes'] );
	}
}
