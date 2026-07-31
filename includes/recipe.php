<?php
/**
 * The edit recipe: schema, defaults, migration and validation.
 *
 * A recipe is the complete, resolution-independent description of an edit. It is
 * produced by the browser, validated here, stored as post meta on the rendered
 * attachment, and served back so re-opening the editor restores every slider.
 *
 * This file is the loader. The work is split by what each part answers: which ops
 * exist and what an empty edit looks like (`schema`), how to bring an old recipe
 * forward (`migrate`), how to trust each piece of one (`validate-document`, `validate-tone`), how to trust a
 * whole one (`recipe-validate`), and how to read one back off an attachment
 * (`storage`).
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

require_once LIENZO_DIR . 'includes/recipe/schema.php';
require_once LIENZO_DIR . 'includes/recipe/migrate.php';
require_once LIENZO_DIR . 'includes/recipe/validate-document.php';
require_once LIENZO_DIR . 'includes/recipe/validate-tone.php';
require_once LIENZO_DIR . 'includes/recipe/validate-ops.php';
require_once LIENZO_DIR . 'includes/recipe/recipe-validate.php';
require_once LIENZO_DIR . 'includes/recipe/storage.php';
