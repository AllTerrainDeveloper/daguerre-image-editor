<?php
/**
 * The REST API.
 *
 * This file is the loader. The work is split into the route table (`routes`), the
 * permission callbacks that guard it (`permissions`), and the handlers themselves,
 * grouped by what they act on (`presets`, `media`, `posts`, `render`).
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

require_once LIENZO_DIR . 'includes/rest/routes.php';
require_once LIENZO_DIR . 'includes/rest/permissions.php';
require_once LIENZO_DIR . 'includes/rest/handler.php';
require_once LIENZO_DIR . 'includes/rest/posts.php';
require_once LIENZO_DIR . 'includes/rest/presets.php';
require_once LIENZO_DIR . 'includes/rest/render.php';
require_once LIENZO_DIR . 'includes/rest/media.php';
