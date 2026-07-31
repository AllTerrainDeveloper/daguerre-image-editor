/**
 * Single-key tool shortcuts.
 *
 * Never while typing -- otherwise naming a preset would silently switch tools halfway
 * through the word.
 */

import { isTypingTarget } from '../../editor/keys';
import type { ToolRailOptions } from './types';
import { TOOLS } from './tools';

/** What the colour shortcuts act on. */
export interface ShortcutSwatches {
	swap: () => void;
	reset: () => void;
}

/**
 * Binds the rail's keyboard shortcuts.
 *
 * @param options   Rail wiring.
 * @param swatches  The foreground and background swatches.
 * @param onModes   Called after a mode toggle, so the buttons can follow.
 * @return Detach function.
 */
export function attachToolShortcuts(
	options: ToolRailOptions,
	swatches: ShortcutSwatches,
	onModes: () => void
): () => void {
	const onKey = ( event: KeyboardEvent ) => {
		if (
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			isTypingTarget( event.target )
		) {
			return;
		}

		const key = event.key.toLowerCase();

		// X and D are the colour shortcuts every editor shares, and they belong here
		// rather than in the swatches because this is where key handling already is.
		const actions: Record< string, () => void > = {
			x: () => swatches.swap(),
			d: () => swatches.reset(),
			q: () => {
				options.setQuickMask( ! options.getQuickMask() );
				onModes();
			},
			f: () => {
				options.setFullScreen( ! options.getFullScreen() );
				onModes();
			},
		};

		if ( actions[ key ] ) {
			event.preventDefault();
			actions[ key ]();

			return;
		}

		const match = TOOLS.find( ( tool ) => tool.key === key );

		if ( match ) {
			event.preventDefault();
			options.onSelect( match.id );
		}
	};

	document.addEventListener( 'keydown', onKey );

	return () => document.removeEventListener( 'keydown', onKey );
}
