<?php
/**
 * Naming the shell.
 *
 * The desktop shell was called Desktop Mode and is now called OpenStation, and the
 * rename went all the way down: `desktop_mode_register_window()` became
 * `openstation_register_window()`, and every hook with it. Lienzo ships to sites
 * running either version and cannot know which, so it asks for a capability by its
 * bare name and this file resolves the spelling.
 *
 * Deliberately a lookup rather than a version check. A site mid-upgrade, a fork, or a
 * shell that renames itself again all degrade to "no desktop integration" instead of
 * a fatal error on every request -- which is the same promise the rest of the
 * integration makes.
 *
 * @package Lienzo
 */

defined( 'ABSPATH' ) || exit;

/**
 * Prefixes to try, current first.
 *
 * @since 0.2.0
 */
const LIENZO_SHELL_PREFIXES = array( 'openstation_', 'desktop_mode_' );

/**
 * Resolves a shell function to whichever name this install has.
 *
 * @since 0.2.0
 *
 * @param string $name Bare function name, e.g. `register_window`.
 * @return string The callable name, or an empty string when no shell provides it.
 */
function lienzo_shell_function( $name ) {
	foreach ( LIENZO_SHELL_PREFIXES as $prefix ) {
		if ( function_exists( $prefix . $name ) ) {
			return $prefix . $name;
		}
	}

	return '';
}

/**
 * Whether the shell offers a capability at all.
 *
 * @since 0.2.0
 *
 * @param string $name Bare function name.
 * @return bool True when some spelling of it exists.
 */
function lienzo_shell_has( $name ) {
	return '' !== lienzo_shell_function( $name );
}

/**
 * Calls a shell function by its bare name.
 *
 * @since 0.2.0
 *
 * @param string $name Bare function name.
 * @param mixed  ...$args Arguments to pass through.
 * @return mixed The return value, or null when no shell provides it.
 */
function lienzo_shell_call( $name, ...$args ) {
	$fn = lienzo_shell_function( $name );

	return $fn ? call_user_func_array( $fn, $args ) : null;
}

/**
 * Every spelling of a shell hook.
 *
 * Returned as a list so callers can register against all of them. Adding a listener
 * for a hook that never fires costs nothing, and it is far cheaper than deciding at
 * boot which shell is present -- the answer can change between `plugins_loaded` and
 * the hook actually firing.
 *
 * @since 0.2.0
 *
 * @param string $name Bare hook name, e.g. `mode_init`.
 * @return string[] Hook names.
 */
function lienzo_shell_hooks( $name ) {
	$hooks = array();

	foreach ( LIENZO_SHELL_PREFIXES as $prefix ) {
		$hooks[] = $prefix . $name;
	}

	return $hooks;
}
