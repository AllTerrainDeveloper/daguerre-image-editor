/**
 * The handle markup.
 *
 * The snap guides are siblings of the box rather than children, so they are not
 * rotated along with it -- a guide showing a vertical alignment has to stay vertical
 * however the layer is turned.
 */

import { __ } from '../../i18n';
import type { Handle } from './types';

/** The elements the overlay positions. */
export interface OverlayChrome {
	/** Fills the viewport; everything else is positioned inside it. */
	root: HTMLElement;
	/** The rotating box carrying the handles. */
	box: HTMLElement;
	guideX: HTMLElement;
	guideY: HTMLElement;
}

/** Every handle that scales, in the order they are added. */
const GRIPS: Handle[] = [ 'nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e' ];

/**
 * Builds the overlay's elements.
 *
 * @param stage Element the overlay is positioned within.
 */
export function buildChrome( stage: HTMLElement ): OverlayChrome {
	const root = document.createElement( 'div' );
	root.className = 'lz-transform';

	const box = document.createElement( 'div' );
	box.className = 'lz-transform__box';
	box.dataset.handle = 'move';
	box.title = __(
		'Drag to move. Corners scale both axes, edges scale one, the top handle rotates. Hold Shift on a corner to scale freely.'
	);

	for ( const handle of GRIPS ) {
		const grip = document.createElement( 'span' );

		grip.className = `lz-transform__handle lz-transform__handle--${ handle }`;
		grip.dataset.handle = handle;
		box.appendChild( grip );
	}

	const stem = document.createElement( 'span' );
	stem.className = 'lz-transform__stem';
	box.appendChild( stem );

	const rotate = document.createElement( 'span' );
	rotate.className = 'lz-transform__handle lz-transform__handle--rotate';
	rotate.dataset.handle = 'rotate';
	rotate.title = __( 'Rotate. Hold Shift to snap.' );
	box.appendChild( rotate );

	const guideX = document.createElement( 'span' );
	guideX.className = 'lz-snap lz-snap--v';
	guideX.hidden = true;

	const guideY = document.createElement( 'span' );
	guideY.className = 'lz-snap lz-snap--h';
	guideY.hidden = true;

	root.append( guideX, guideY, box );
	stage.appendChild( root );

	return { root, box, guideX, guideY };
}
