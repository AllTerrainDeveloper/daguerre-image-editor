/**
 * Section containers.
 */

import { componentTag } from '../../platform';

/**
 * Builds a titled section, preferring the shell's own section.
 *
 * @param heading Section title.
 */
export function createSection( heading: string ): HTMLElement {
	const tag = componentTag( 'section' );

	if ( tag ) {
		const section = document.createElement( tag );
		section.setAttribute( 'heading', heading );
		section.setAttribute( 'stack', '' );
		section.classList.add( 'lz-section' );

		return section;
	}

	const section = document.createElement( 'section' );
	section.className = 'lz-section';

	const title = document.createElement( 'h3' );
	title.className = 'lz-section__heading';
	title.textContent = heading;
	section.appendChild( title );

	return section;
}
