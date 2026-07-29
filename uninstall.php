<?php
/**
 * Uninstall routine.
 *
 * Daguerre stores exactly two things outside its own files: the edit recipe and the
 * source pointer, both as post meta on attachments it created. Those attachments are
 * ordinary media items and are deliberately left alone -- deleting a user's photos
 * because they removed an editor would be indefensible. Only the metadata goes.
 *
 * @package Daguerre
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_post_meta_by_key( '_daguerre_recipe' );
delete_post_meta_by_key( '_daguerre_source' );
