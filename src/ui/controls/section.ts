/**
 * Section containers.
 */

import { hasComponent } from '../../platform';

/**
 * Builds a titled section, preferring `<wpd-section>`.
 *
 * @param heading Section title.
 */
export function createSection( heading: string ): HTMLElement {
	if ( hasComponent( 'wpd-section' ) ) {
		const section = document.createElement( 'wpd-section' );
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
