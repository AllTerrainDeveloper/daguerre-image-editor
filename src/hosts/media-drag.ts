/**
 * Making the Media Library's own thumbnails carry their attachment id.
 *
 * The editor sits in the desktop shell; the Media Library sits in a chromeless iframe.
 * Dragging a thumbnail between them is an ordinary HTML5 drag, and what the browser
 * puts in it is decided by the markup: an `<img>` gives a URL, a linked `<img>` gives
 * the link's URL, and neither carries the attachment id. The receiving side was left
 * reverse-engineering an id out of whatever markup came along, which is guesswork that
 * fails differently in grid mode, list mode and the modal.
 *
 * The source knows the id. This runs *inside* the Media Library and says so, on a
 * private MIME type the editor reads first. Everything else stays as a fallback, for
 * drags from places this cannot reach.
 *
 * `dragstart` in the capture phase, so the data is added before anything else can
 * inspect or cancel the drag.
 */

/** Private drag type carrying an attachment id. */
export const ATTACHMENT_TYPE = 'application/x-lienzo-attachment';

/** Selectors that identify an attachment, most reliable first. */
const CANDIDATES = [
	// Grid mode and the media modal.
	'.attachment[data-id]',
	'[data-id]',
	// List mode rows.
	'tr[id^="post-"]',
];

/**
 * Finds the attachment id a dragged element belongs to.
 *
 * @param start Element the drag began on.
 * @return The id, or 0 when the element is not part of an attachment.
 */
export function attachmentIdFor( start: Element | null ): number {
	if ( ! start ) {
		return 0;
	}

	for ( const selector of CANDIDATES ) {
		const match = start.closest( selector );

		if ( ! match ) {
			continue;
		}

		const raw =
			match.getAttribute( 'data-id' ) ??
			/post-(\d+)/.exec( match.id )?.[ 1 ] ??
			'';
		const id = Number( raw );

		if ( id > 0 ) {
			return id;
		}
	}

	return 0;
}

/**
 * Tags every attachment drag with its id.
 *
 * Safe to run on any screen: without an attachment under the pointer it adds nothing,
 * and it never cancels or alters the drag the browser was already going to do.
 */
export function bootMediaDrag(): void {
	document.addEventListener(
		'dragstart',
		( event: DragEvent ) => {
			const transfer = event.dataTransfer;

			if ( ! transfer || ! ( event.target instanceof Element ) ) {
				return;
			}

			const id = attachmentIdFor( event.target );

			if ( ! id ) {
				return;
			}

			try {
				transfer.setData( ATTACHMENT_TYPE, String( id ) );
			} catch {
				// Some browsers refuse unknown types on a drag they did not originate.
				// Losing the id only costs the fallbacks a guess.
			}
		},
		true
	);
}
