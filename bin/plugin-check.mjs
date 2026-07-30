/**
 * Runs WordPress's own Plugin Check against the plugin.
 *
 * Plugin Check is the tool the WordPress.org review queue runs, so it is the closest
 * thing to a pre-submission verdict available locally. It is a plugin rather than a
 * standalone binary, so it has to be installed into a running WordPress: this uses the
 * wp-env instance the test suite already relies on.
 *
 * Installed on first use and then left in place. Reinstalling on every run would add a
 * network round trip to a command people should be able to run constantly.
 */

import { spawnSync } from 'node:child_process';

const slug = 'lienzo';

/**
 * Runs a command in the wp-env CLI container.
 *
 * @param {string[]} args   Arguments after `wp`.
 * @param {boolean}  quiet  Whether to capture output instead of printing it.
 * @return {{ status: number, stdout: string }} Result.
 */
function wp( args, quiet = false ) {
	const result = spawnSync(
		'npx',
		[ 'wp-env', 'run', 'cli', 'wp', ...args ],
		{
			encoding: 'utf8',
			stdio: quiet ? 'pipe' : 'inherit',
		}
	);

	return { status: result.status ?? 1, stdout: result.stdout ?? '' };
}

process.stdout.write( `[${ slug }] Checking the wp-env instance…\n` );

const running = wp( [ 'core', 'is-installed' ], true );

if ( running.status !== 0 ) {
	process.stderr.write(
		`[${ slug }] wp-env is not running. Start it with \`npm run env:start\`.\n`
	);
	process.exit( 1 );
}

const installed = wp( [ 'plugin', 'is-installed', 'plugin-check' ], true );

if ( installed.status !== 0 ) {
	process.stdout.write( `[${ slug }] Installing Plugin Check…\n` );

	const install = wp( [ 'plugin', 'install', 'plugin-check', '--activate' ] );

	if ( install.status !== 0 ) {
		process.stderr.write( `[${ slug }] Could not install Plugin Check.\n` );
		process.exit( 1 );
	}
} else {
	// Installed but possibly deactivated by a previous run or a reset.
	wp( [ 'plugin', 'activate', 'plugin-check' ], true );
}

process.stdout.write( `[${ slug }] Running Plugin Check…\n\n` );

// wp-env maps the *repository* into the site, not the packaged plugin, so the check
// would otherwise report the build tooling: `.wp-env.json` as a forbidden hidden file,
// `phpcs.xml.dist` as an application file, and so on. None of those are in the zip --
// `bin/ships.mjs` decides that, and this list mirrors it in Plugin Check's own form.
//
// Excluding them keeps the report about what actually ships. Run `npm run
// plugin:package` and unzip it if you want to see the exact tree a reviewer will.
const check = wp( [
	'plugin',
	'check',
	slug,
	'--exclude-directories=node_modules,vendor,src,tests,bin,dist',
	'--exclude-files=.wp-env.json,.wp-env.override.json,.gitignore,phpcs.xml.dist,vite.config.js,tsconfig.json,package.json,package-lock.json,composer.json,composer.lock,README.md',
	'--severity=5',
] );

process.exit( check.status );
