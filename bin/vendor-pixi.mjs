/**
 * Copies the PixiJS browser build out of node_modules and into assets/vendor/.
 *
 * PixiJS is vendored rather than bundled for two reasons. First, WordPress.org
 * forbids loading code from a CDN, so the file has to ship inside the plugin.
 * Second, Desktop Mode ships its own copy of Pixi and exposes it as `window.PIXI`;
 * bundling ours would put a second Pixi instance on the same page, and two Pixi 8
 * instances corrupt each other's global GPU resources. Reading the global lets us
 * reuse whichever copy loaded first.
 *
 * The output is committed to the repository so the plugin is installable straight
 * from a checkout without an npm install.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const vendorDir = resolve( root, 'assets/vendor' );

const files = [
	{
		from: resolve( root, 'node_modules/pixi.js/dist/pixi.min.js' ),
		to: resolve( vendorDir, 'pixi.min.js' ),
		required: true,
	},
	{
		from: resolve( root, 'node_modules/pixi.js/LICENSE' ),
		to: resolve( vendorDir, 'pixi-LICENSE.txt' ),
		required: true,
	},
];

mkdirSync( vendorDir, { recursive: true } );

for ( const file of files ) {
	if ( ! existsSync( file.from ) ) {
		if ( file.required ) {
			console.error(
				`[daguerre] Missing ${ file.from }.\n` +
					'Run `npm install` first — pixi.js is a devDependency used only as the source of this copy.'
			);
			process.exit( 1 );
		}
		continue;
	}

	copyFileSync( file.from, file.to );
	const kb = Math.round( statSync( file.to ).size / 1024 );
	console.log( `[daguerre] vendored ${ file.to.replace( root + '/', '' ) } (${ kb } KB)` );
}
