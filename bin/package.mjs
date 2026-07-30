/**
 * Builds the release package.
 *
 * Produces two things under `dist/`, matching the two halves of a WordPress.org
 * submission:
 *
 *   dist/lienzo.zip   the plugin itself, with a single `lienzo/` folder inside so it
 *                     unpacks to the right slug however it is installed
 *   dist/assets/      the directory listing's banner and icon art, which lives in
 *                     SVN's own `assets/` path and is NOT part of the download
 *
 * Staged into a real directory before zipping rather than filtered on the fly. A zip
 * built by exclusion patterns is a zip nobody can inspect before publishing; a staged
 * tree can be listed, diffed and opened.
 *
 * The zip is built with the system `zip`, which is present on macOS and Linux and
 * needs no dependency. Node has no archiver in its standard library and this is not a
 * good reason to add one.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { ships } from './ships.mjs';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const slug = 'lienzo';
const dist = join( root, 'dist' );
const stage = join( dist, slug );

/**
 * Reads the plugin's version from its header.
 *
 * Taken from the PHP rather than from `package.json`, because the header is what
 * WordPress and the plugin directory actually read. If the two ever disagree, the one
 * users see is the truth.
 */
function pluginVersion() {
	const header = readFileSync( join( root, `${ slug }.php` ), 'utf8' );
	const match = /^\s*\*\s*Version:\s*(.+)$/m.exec( header );

	return match ? match[ 1 ].trim() : '0.0.0';
}

/**
 * Fails loudly rather than shipping something incomplete.
 *
 * @param {string} message What is wrong.
 */
function fail( message ) {
	process.stderr.write( `[${ slug }] ${ message }\n` );
	process.exit( 1 );
}

// The built bundles are not in version control's way but they ARE the plugin. Packaging
// without them would produce a zip that installs and then does nothing.
for ( const asset of [ 'assets/js/lienzo.js', 'assets/js/lienzo.min.js', 'assets/css/lienzo.css' ] ) {
	if ( ! existsSync( join( root, asset ) ) ) {
		fail( `${ asset } is missing. Run \`npm run plugin:build\` first.` );
	}
}

rmSync( dist, { recursive: true, force: true } );
mkdirSync( stage, { recursive: true } );

let files = 0;

/**
 * Counts the files staged, for the summary.
 *
 * @param {string} dir Directory to walk.
 */
function count( dir ) {
	for ( const entry of readdirSync( dir, { withFileTypes: true } ) ) {
		const path = join( dir, entry.name );

		if ( entry.isDirectory() ) {
			count( path );
		} else {
			files++;
		}
	}
}

for ( const entry of readdirSync( root, { withFileTypes: true } ) ) {
	if ( ! ships( entry.name ) ) {
		continue;
	}

	cpSync( join( root, entry.name ), join( stage, entry.name ), { recursive: true } );
}

count( stage );

// The directory art travels beside the zip, not inside it.
const artwork = join( root, '.wordpress-org' );

if ( existsSync( artwork ) ) {
	cpSync( artwork, join( dist, 'assets' ), { recursive: true } );
}

const zipName = `${ slug }.zip`;
const zip = spawnSync( 'zip', [ '-r', '-q', '-X', zipName, slug ], {
	cwd: dist,
	stdio: 'inherit',
} );

if ( zip.error || zip.status !== 0 ) {
	fail( 'Could not create the archive. Is `zip` installed?' );
}

const size = statSync( join( dist, zipName ) ).size;

process.stdout.write(
	`[${ slug }] Packaged ${ slug } ${ pluginVersion() }: ` +
		`dist/${ zipName } (${ files } files, ${ Math.round( size / 1024 ) }KB)\n` +
		`[${ slug }] Directory art staged at dist/assets/ for the SVN assets path.\n`
);
