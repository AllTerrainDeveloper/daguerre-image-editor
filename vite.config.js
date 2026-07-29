import { defineConfig } from 'vite';

/**
 * Two passes write into the same output directory: `--mode development` emits the
 * readable `daguerre.js` that WordPress serves under SCRIPT_DEBUG, and
 * `--mode production` emits the minified `daguerre.min.js`. `emptyOutDir` is off so
 * the second pass does not delete the first pass's output.
 *
 * PixiJS is never bundled — see bin/vendor-pixi.mjs for why. It is read off
 * `window.PIXI` at runtime and typed against src/engine/pixi-types.ts.
 */
export default defineConfig( ( { mode } ) => {
	const isProd = mode === 'production';

	return {
		build: {
			outDir: 'assets/js',
			emptyOutDir: false,
			target: 'es2020',
			minify: isProd ? 'esbuild' : false,
			sourcemap: false,
			lib: {
				entry: 'src/index.ts',
				formats: [ 'iife' ],
				name: 'daguerre',
				fileName: () => ( isProd ? 'daguerre.min.js' : 'daguerre.js' ),
			},
		},
		test: {
			environment: 'jsdom',
			include: [ 'tests/vitest/**/*.test.ts' ],
		},
	};
} );
