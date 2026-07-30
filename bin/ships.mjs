/**
 * What actually ships inside the plugin.
 *
 * One list, imported by both the local deploy and the release package, because the two
 * answering differently is how a zip ends up carrying `node_modules` or missing a file
 * the QA site has been running happily for weeks. If it is not here, it is development
 * scaffolding and stays in the repository.
 */

/** Directories and files that never reach a running site or a release. */
export const EXCLUDED = new Set( [
	// Dependency trees. `vendor/` is Composer's dev-only tooling: the plugin has no
	// runtime PHP dependencies.
	'node_modules',
	'vendor',

	// Version control and editor leftovers.
	'.git',
	'.gitignore',
	'.github',
	'.DS_Store',

	// The development environment.
	'.wp-env.json',
	'.wp-env.override.json',

	// Sources and the tools that turn them into the built bundles.
	'bin',
	'src',
	'tests',
	'package.json',
	'package-lock.json',
	'composer.json',
	'composer.lock',
	'phpcs.xml.dist',
	'vite.config.js',
	'tsconfig.json',

	// Developer documentation. `readme.txt` is the one users see, and it does ship.
	'README.md',

	// Directory-listing art for WordPress.org, which belongs in the directory's own
	// `assets/` path rather than inside the plugin someone downloads.
	'.wordpress-org',

	// Output of the packaging step itself.
	'dist',
] );

/**
 * Whether a top-level entry belongs in a distributed copy of the plugin.
 *
 * @param {string} name Entry name, relative to the repository root.
 * @return {boolean} True when it ships.
 */
export function ships( name ) {
	return ! EXCLUDED.has( name );
}
