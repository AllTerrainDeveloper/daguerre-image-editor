<?php
/**
 * Filename derivation for rendered images.
 *
 * @package Lienzo
 */

/**
 * Filename derivation for rendered images.
 *
 * @group lienzo
 * @group lienzo-render
 */
class Tests_Lienzo_Edited_Filename extends WP_UnitTestCase {

	/**
	 * The suffix is appended and the extension follows the output format.
	 *
	 * @covers ::lienzo_edited_filename
	 */
	public function test_appends_suffix_and_extension() {
		$this->assertSame(
			'photo-edited.jpg',
			lienzo_edited_filename( '/uploads/photo.png', 'image/jpeg' )
		);
		$this->assertSame(
			'photo-edited.webp',
			lienzo_edited_filename( '/uploads/photo.jpg', 'image/webp' )
		);
	}

	/**
	 * Editing an already-edited image does not stack suffixes.
	 *
	 * Without this, repeated round trips grow the filename without bound.
	 *
	 * @covers ::lienzo_edited_filename
	 */
	public function test_collapses_repeated_suffixes() {
		$this->assertSame(
			'photo-edited.jpg',
			lienzo_edited_filename( '/uploads/photo-edited.jpg', 'image/jpeg' )
		);
		$this->assertSame(
			'photo-edited.jpg',
			lienzo_edited_filename( '/uploads/photo-edited-2.jpg', 'image/jpeg' )
		);
	}

	/**
	 * A name that is nothing but the suffix still yields a usable filename.
	 *
	 * @covers ::lienzo_edited_filename
	 */
	public function test_handles_degenerate_name() {
		$this->assertSame(
			'image-edited.jpg',
			lienzo_edited_filename( '/uploads/-edited.jpg', 'image/jpeg' )
		);
	}

	/**
	 * Every supported output type maps to an extension.
	 *
	 * @covers ::lienzo_extension_for_mime
	 */
	public function test_every_supported_type_has_an_extension() {
		foreach ( lienzo_supported_mime_types() as $mime_type ) {
			$this->assertNotSame( '', lienzo_extension_for_mime( $mime_type ), $mime_type );
		}
	}
}
