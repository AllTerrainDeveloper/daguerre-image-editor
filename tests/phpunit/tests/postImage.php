<?php
/**
 * Tests for resolving a post to the image it is about.
 *
 * @package Lienzo
 */

/**
 * @group lienzo
 * @group lienzo-post-image
 */
class Tests_Lienzo_Post_Image extends WP_UnitTestCase {

	/**
	 * Makes an attachment of a given type.
	 *
	 * @param string $mime MIME type.
	 * @param int    $parent Optional parent post.
	 * @return int Attachment ID.
	 */
	private function make_attachment( $mime = 'image/jpeg', $parent = 0 ) {
		return self::factory()->attachment->create_object(
			array(
				'file'           => 'lienzo-' . wp_generate_password( 6, false ) . '.jpg',
				'post_parent'    => $parent,
				'post_mime_type' => $mime,
				'post_type'      => 'attachment',
			)
		);
	}

	/**
	 * @covers ::lienzo_post_image_id
	 */
	public function test_prefers_the_featured_image() {
		$post  = self::factory()->post->create();
		$image = $this->make_attachment();

		set_post_thumbnail( $post, $image );

		$this->assertSame( $image, lienzo_post_image_id( $post ) );
	}

	/**
	 * @covers ::lienzo_post_image_id
	 */
	public function test_falls_back_to_the_product_gallery() {
		$post    = self::factory()->post->create();
		$first   = $this->make_attachment();
		$second  = $this->make_attachment();

		update_post_meta( $post, '_product_image_gallery', "$first,$second" );

		$this->assertSame( $first, lienzo_post_image_id( $post ) );
	}

	/**
	 * @covers ::lienzo_post_image_id
	 */
	public function test_falls_back_to_an_attached_image() {
		$post  = self::factory()->post->create();
		$image = $this->make_attachment( 'image/jpeg', $post );

		$this->assertSame( $image, lienzo_post_image_id( $post ) );
	}

	/**
	 * A featured image Lienzo cannot open should not stop the gallery being tried.
	 *
	 * @covers ::lienzo_post_image_id
	 */
	public function test_skips_an_unsupported_featured_image() {
		$post     = self::factory()->post->create();
		$gif      = $this->make_attachment( 'image/gif' );
		$editable = $this->make_attachment();

		set_post_thumbnail( $post, $gif );
		update_post_meta( $post, '_product_image_gallery', (string) $editable );

		$this->assertSame( $editable, lienzo_post_image_id( $post ) );
	}

	/**
	 * @covers ::lienzo_post_image_id
	 */
	public function test_reports_nothing_for_a_post_with_no_image() {
		$this->assertSame( 0, lienzo_post_image_id( self::factory()->post->create() ) );
	}

	/**
	 * @covers ::lienzo_post_image_id
	 */
	public function test_reports_nothing_for_a_post_that_does_not_exist() {
		$this->assertSame( 0, lienzo_post_image_id( 999999 ) );
	}

	/**
	 * @covers ::lienzo_post_image_id
	 */
	public function test_a_filter_can_answer_for_a_post_type_lienzo_cannot_read() {
		$post  = self::factory()->post->create();
		$image = $this->make_attachment();

		add_filter(
			'lienzo_post_image_id',
			static function () use ( $image ) {
				return $image;
			}
		);

		$this->assertSame( $image, lienzo_post_image_id( $post ) );
	}

	/**
	 * A filter must not be able to hand back something unopenable.
	 *
	 * @covers ::lienzo_post_image_id
	 */
	public function test_a_filter_cannot_force_an_unsupported_image() {
		$post = self::factory()->post->create();
		$gif  = $this->make_attachment( 'image/gif' );

		add_filter(
			'lienzo_post_image_id',
			static function () use ( $gif ) {
				return $gif;
			}
		);

		$this->assertSame( 0, lienzo_post_image_id( $post ) );
	}

	/**
	 * @covers ::lienzo_post_image_slot
	 */
	public function test_names_the_slot_an_image_occupies() {
		$post      = self::factory()->post->create();
		$featured  = $this->make_attachment();
		$galleried = $this->make_attachment();
		$stranger  = $this->make_attachment();

		set_post_thumbnail( $post, $featured );
		update_post_meta( $post, '_product_image_gallery', (string) $galleried );

		$this->assertSame( 'thumbnail', lienzo_post_image_slot( $post, $featured ) );
		$this->assertSame( 'gallery', lienzo_post_image_slot( $post, $galleried ) );
		$this->assertSame( '', lienzo_post_image_slot( $post, $stranger ) );
	}
}
