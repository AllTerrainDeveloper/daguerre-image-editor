/**
 * A set of listeners.
 *
 * The editor keeps three of these -- tool changes, brush changes, and the viewport --
 * and every one of them was the same six lines of `Set.add` plus a closure that
 * deletes. One tiny class means `add()` returns the unsubscribe function every time,
 * which is the part that is easy to forget and impossible to notice missing.
 */

/** Notifies a set of listeners, and hands each one a way to stop listening. */
export class Subscribers< Args extends unknown[] = [] > {
	private listeners = new Set< ( ...args: Args ) => void >();

	/**
	 * Adds a listener.
	 *
	 * @param listener Called on every emit.
	 * @return Unsubscribe function.
	 */
	add( listener: ( ...args: Args ) => void ): () => void {
		this.listeners.add( listener );

		return () => {
			this.listeners.delete( listener );
		};
	}

	/**
	 * Calls every listener.
	 *
	 * Iterated over a copy, so a listener that unsubscribes itself mid-emit cannot
	 * make the set skip the one after it.
	 *
	 * @param args What to pass them.
	 */
	emit( ...args: Args ): void {
		for ( const listener of [ ...this.listeners ] ) {
			listener( ...args );
		}
	}

	/** Drops every listener. */
	clear(): void {
		this.listeners.clear();
	}
}
