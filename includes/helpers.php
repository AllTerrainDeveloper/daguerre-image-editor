<?php
/**
 * Shared helpers.
 *
 * This file is the loader: what Lienzo can open (`mime`), who may open it
 * (`capabilities`), where its pixels are (`source`), what this site will let us
 * allocate (`limits`), and how the stored meta is read (`meta`).
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

require_once LIENZO_DIR . 'includes/helpers/mime.php';
require_once LIENZO_DIR . 'includes/helpers/capabilities.php';
require_once LIENZO_DIR . 'includes/helpers/source.php';
require_once LIENZO_DIR . 'includes/helpers/limits.php';
require_once LIENZO_DIR . 'includes/helpers/meta.php';
