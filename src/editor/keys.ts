/**
 * Keyboard plumbing.
 *
 * Four separate parts of the editor bind document-level keys, and every one of them
 * has to answer the same two questions: is the user typing somewhere else, and how do
 * I let go of this listener. Answering them once is the difference between shortcuts
 * that work everywhere and shortcuts that eat characters out of a caption field.
 */

/**
 * Whether an event target is somewhere the user is typing.
 *
 * Keeps editor shortcuts from stealing keystrokes out of a caption field.
 *
 * @param target Event target.
 */
export function isTypingTarget( target: EventTarget | null ): boolean {
	if ( ! ( target instanceof HTMLElement ) ) {
		return false;
	}

	return (
		target.isContentEditable ||
		[ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( target.tagName )
	);
}

/**
 * Binds a document-level key handler that stands down while the user is typing.
 *
 * @param type    Which key event to listen for.
 * @param handler Handler, called only when the focus is not in a text field.
 * @return Detach function.
 */
export function onEditorKey(
	type: 'keydown' | 'keyup',
	handler: ( event: KeyboardEvent ) => void
): () => void {
	const listener = ( event: KeyboardEvent ) => {
		if ( ! isTypingTarget( event.target ) ) {
			handler( event );
		}
	};

	document.addEventListener( type, listener );

	return () => document.removeEventListener( type, listener );
}

/**
 * Whether an event carries the platform's "command" modifier.
 *
 * Cmd on a Mac, Ctrl everywhere else. Both are accepted on both, because a browser is
 * not the only thing that decides which keyboard someone is holding.
 *
 * @param event Keyboard event.
 */
export function hasCommandKey( event: KeyboardEvent ): boolean {
	return event.metaKey || event.ctrlKey;
}
