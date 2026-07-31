/**
 * Registering the window as a drop target with the desktop shell.
 */

import { __ } from '../../i18n';
import type { DroppedImage } from '../../editor';
import { desktop } from './desktop-api';
import type { DragPayloadLike } from './desktop-api';

/**
 * Lets a photo be dragged from the desktop onto the editor to open it.
 *
 * @param element Drop area.
 * @param open    Called with the dropped attachment id.
 * @return Unregister function, or null when drag support is unavailable.
 */
export function registerDropTarget(
	element: HTMLElement,
	drop: ( dropped: DroppedImage ) => void
): ( () => void ) | null {
	const manager = desktop()?.dragManager;

	if ( ! manager?.registerDropTarget ) {
		return null;
	}

	const attachmentOf = ( payload: DragPayloadLike ): number => {
		const bridge = payload.data?.bridgePayload as
			| { kind?: string; id?: number; mime?: string }
			| undefined;

		if ( bridge?.kind !== 'attachment' ) {
			return 0;
		}

		// A video or a PDF is a perfectly valid thing to drag; it is just not
		// something this window can do anything with.
		if ( bridge.mime && ! window.lienzoConfig?.supportedMimes.includes( bridge.mime ) ) {
			return 0;
		}

		return Number( bridge.id ?? 0 );
	};

	// Called on the manager, never pulled off it. The shell's method reads its own
	// `this`, so a detached reference throws `Cannot read properties of undefined` --
	// and it throws inside a render callback, which takes the whole window down with it.
	return manager.registerDropTarget( {
		id: 'lienzo-window',
		element,
		accept: ( payload ) => attachmentOf( payload ) > 0,
		acceptLabel: __( 'Add as a layer' ),
		onDrop: ( session, at ) => {
			const id = attachmentOf( session.payload );

			if ( ! id ) {
				return;
			}

			// Onto an editor that already holds a photo, a drop *combines*: it adds the
			// image as a layer where it was released. Replacing the document would throw
			// away whatever was in progress, and opening has its own gesture. An empty
			// window has nothing to combine with, so there a drop opens.
			drop( {
				attachmentId: id,
				clientX: at?.clientX,
				clientY: at?.clientY,
			} );
		},
	} );
}
