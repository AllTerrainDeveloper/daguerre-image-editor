/**
 * The image picker shown when the editor page is opened without an attachment.
 *
 * "Media -> Edit Photos" is a reasonable thing to click before you have chosen a
 * photo, so that route needs to end somewhere useful rather than telling you to go
 * somewhere else and come back.
 *
 * The library is read a page at a time behind a Load more button rather than all at
 * once. A button rather than loading on scroll: the picker renders inside a Desktop
 * Mode window, so which element actually scrolls is not the picker's to know, and a
 * scroll listener bound to the wrong one silently never fires.
 */

import { __, sprintf } from '../../i18n';
import { createButton } from '../controls';
import type { LienzoConfig } from '../../types';
import { MediaPager } from './media-pager';
import { renderTile } from './tile';

export type { MediaItem } from './types';

/**
 * Renders a grid of editable images into an element.
 *
 * @param root    Element to fill.
 * @param config  Runtime configuration.
 * @param onPick  Optional. When given, intercepts the click instead of navigating --
 *                needed inside a Desktop Mode window, where following the link would
 *                navigate the whole shell away from the desktop.
 * @param isStale Optional. Returns true once this render no longer owns the element,
 *                so a fetch that finishes late writes nothing.
 */
export async function renderPicker(
	root: HTMLElement,
	config: LienzoConfig,
	onPick?: ( attachmentId: number ) => void,
	isStale?: () => boolean
): Promise< void > {
	if ( isStale?.() ) {
		return;
	}

	const pager = new MediaPager( config );
	const ui = buildChrome( root );

	const more = createButton( {
		label: __( 'Load more' ),
		variant: 'secondary',
		onClick: () => void load(),
	} );

	ui.footer.append( ui.count, more.el );

	/**
	 * Fetches the next page and appends it.
	 *
	 * Guarded against re-entry: the button is disabled for the duration, so a second
	 * click cannot start a fetch the first one is already making.
	 */
	async function load(): Promise< void > {
		more.setDisabled( true );

		let items;

		try {
			items = await pager.next();
		} catch ( error ) {
			if ( ! isStale?.() ) {
				fail( ui, error );
				more.setDisabled( false );
			}

			return;
		}

		// Anything can happen during that fetch -- most often the user picking a photo,
		// which mounts the editor into this very element. Writing the grid afterwards
		// would erase the editor and leave the picker showing over a window that had
		// already moved on.
		if ( isStale?.() ) {
			return;
		}

		for ( const item of items ) {
			ui.grid.appendChild( renderTile( item, onPick ) );
		}

		if ( 0 === pager.count && ! pager.hasMore ) {
			showEmpty( ui );

			return;
		}

		ui.status.remove();
		root.append( ui.grid, ui.footer );

		ui.count.textContent = countLabel( pager.count, pager.hasMore );

		if ( pager.hasMore ) {
			more.setDisabled( false );

			return;
		}

		// Removed rather than hidden. `[hidden]` is a UA rule of the lowest possible
		// specificity, and inside Desktop Mode this button is a shell component the
		// shell gives an explicit `display` -- which wins, so the button stayed on
		// screen at the end of the library with nothing left to load.
		more.destroy();
		more.el.remove();
	}

	await load();
}

/** The picker's elements. */
interface PickerChrome {
	root: HTMLElement;
	grid: HTMLElement;
	footer: HTMLElement;
	/** Loading, error and empty messages. Removed once there is a grid. */
	status: HTMLElement;
	/** How many photos are showing, beside the Load more button. */
	count: HTMLElement;
}

/**
 * Builds the picker's markup.
 *
 * @param root Element to fill. Its contents are replaced.
 */
function buildChrome( root: HTMLElement ): PickerChrome {
	root.classList.add( 'lz-picker' );

	const heading = document.createElement( 'h2' );
	heading.className = 'lz-picker__heading';
	heading.textContent = __( 'Choose a photo to edit' );

	const status = document.createElement( 'p' );
	status.className = 'lz-picker__status';
	status.textContent = __( 'Loading your photos…' );

	const grid = document.createElement( 'div' );
	grid.className = 'lz-picker__grid';
	grid.setAttribute( 'role', 'list' );

	const footer = document.createElement( 'div' );
	footer.className = 'lz-picker__footer';

	const count = document.createElement( 'p' );
	count.className = 'lz-picker__count';
	// Announced politely, so someone using a screen reader hears the new total after
	// pressing Load more rather than being left to guess whether it did anything.
	count.setAttribute( 'aria-live', 'polite' );

	root.replaceChildren( heading, status );

	return { root, grid, footer, status, count };
}

/**
 * What to say about how much of the library is on screen.
 *
 * @param shown   Photos rendered so far.
 * @param hasMore Whether the library has pages left.
 */
function countLabel( shown: number, hasMore: boolean ): string {
	return hasMore
		? sprintf(
				/* translators: %d: number of photos shown so far. */
				__( 'Showing the %d most recent photos.' ),
				shown
		  )
		: sprintf(
				/* translators: %d: total number of photos. */
				__( 'Showing all %d photos.' ),
				shown
		  );
}

/**
 * Reports a library that could not be read.
 *
 * @param ui    The picker's elements.
 * @param error The failure.
 */
function fail( ui: PickerChrome, error: unknown ): void {
	ui.status.textContent =
		error instanceof Error
			? error.message
			: __( 'Your media library could not be loaded.' );
	ui.status.classList.add( 'lz-picker__status--error' );

	if ( ! ui.status.isConnected ) {
		ui.root.appendChild( ui.status );
	}
}

/**
 * Replaces the grid with an invitation to upload something.
 *
 * @param ui The picker's elements.
 */
function showEmpty( ui: PickerChrome ): void {
	ui.status.textContent = __(
		'No editable images yet. Upload a JPEG, PNG, WebP or AVIF to get started.'
	);

	const link = document.createElement( 'a' );

	link.className = 'button button-primary';
	link.href = 'media-new.php';
	link.textContent = __( 'Upload a photo' );
	ui.root.appendChild( link );
}
