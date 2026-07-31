<?php
/**
 * Storing a render.
 *
 * This file is the loader: naming (`filenames`), the upload MIME allow-list (`mime`),
 * and the attachment write itself (`store`).
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

require_once LIENZO_DIR . 'includes/render/filenames.php';
require_once LIENZO_DIR . 'includes/render/mime.php';
require_once LIENZO_DIR . 'includes/render/store.php';
