/**
 * Undo/redo stack for recipes.
 *
 * Recipes are small immutable objects, so history stores whole snapshots rather
 * than diffs. That keeps undo exact and the implementation about thirty lines.
 *
 * The subtlety this class exists to solve is slider drags. A drag emits a value on
 * every pointer move, and pushing each one would make undo advance a pixel at a
 * time. `push()` therefore coalesces consecutive changes that share a label within
 * a time window, so one drag collapses into one undo step.
 */

/** How long consecutive same-label changes keep merging into one entry, in ms. */
const COALESCE_MS = 600;

/** Hard cap on retained snapshots, so a long session cannot grow without bound. */
const MAX_ENTRIES = 100;

interface Entry< T > {
	state: T;
	label: string;
	at: number;
	/**
	 * Anything the caller needs to undo alongside the state.
	 *
	 * Painted pixels live outside the recipe -- they are not describable, so a snapshot
	 * cannot contain them. An entry can therefore carry a patch that puts them back,
	 * which is what lets one undo reverse one brush stroke rather than only the recipe
	 * change that happened to accompany it.
	 */
	meta?: unknown;
}

/**
 * A snapshot-based undo stack.
 */
export class History< T > {
	private entries: Entry< T >[] = [];

	private index = -1;

	private now: () => number;

	/**
	 * @param initial Starting state, which becomes the bottom of the stack.
	 * @param now     Clock, injectable so tests can drive coalescing deterministically.
	 */
	constructor( initial: T, now: () => number = () => Date.now() ) {
		this.now = now;
		this.entries = [ { state: initial, label: '@initial', at: 0 } ];
		this.index = 0;
	}

	/** The state currently in effect. */
	get current(): T {
		return this.entries[ this.index ].state;
	}

	/** Whether there is anything to undo. */
	get canUndo(): boolean {
		return this.index > 0;
	}

	/** Whether there is anything to redo. */
	get canRedo(): boolean {
		return this.index < this.entries.length - 1;
	}

	/**
	 * Records a new state.
	 *
	 * Replaces the top entry instead of adding one when the label matches the
	 * previous change and it happened recently, so a slider drag becomes a single
	 * undo step rather than one per pointer move. An entry carrying metadata is never
	 * merged, because its payload cannot be superseded the way a slider value can.
	 *
	 * Pushing after an undo discards the redo tail, which is what every editor does.
	 *
	 * @param state New state.
	 * @param label Groups related changes. Use the op name for slider drags.
	 * @param meta  Optional. Carried alongside, for changes a snapshot cannot express.
	 */
	push( state: T, label: string, meta?: unknown ): void {
		const at = this.now();
		const top = this.entries[ this.index ];

		if (
			this.index > 0 &&
			top.label === label &&
			at - top.at < COALESCE_MS &&
			! this.canRedo &&
			// Never merge entries carrying a payload. Coalescing exists for slider
			// drags, where each value supersedes the last. A brush stroke is not like
			// that: its patch holds pixels that exist nowhere else, so merging two
			// quick strokes would discard the first stroke's only copy of them and
			// leave undo restoring half of what it claimed to.
			meta === undefined &&
			top.meta === undefined
		) {
			this.entries[ this.index ] = { state, label, at, meta };
			return;
		}

		this.entries = this.entries.slice( 0, this.index + 1 );
		this.entries.push( { state, label, at, meta } );

		if ( this.entries.length > MAX_ENTRIES ) {
			this.entries.shift();
		}

		this.index = this.entries.length - 1;
	}

	/**
	 * Overwrites the current state without creating an undo step.
	 *
	 * For changes that are not part of the edit being undone -- output format and
	 * quality, which describe how the result is encoded rather than what it looks
	 * like. Interleaving those with adjustment history would make undo jump between
	 * unrelated kinds of change.
	 *
	 * @param state Replacement state.
	 */
	replace( state: T ): void {
		this.entries[ this.index ] = { ...this.entries[ this.index ], state };
	}

	/** Whatever was attached to the entry currently in effect. */
	get meta(): unknown {
		return this.entries[ this.index ].meta;
	}

	/** The label of the entry currently in effect. */
	get label(): string {
		return this.entries[ this.index ].label;
	}

	/**
	 * Replaces the metadata on the entry in effect.
	 *
	 * Undoing a stroke needs the pixels the stroke *produced* in order to redo it, and
	 * those only exist once it has happened -- so the patch is swapped for its opposite
	 * as it is applied, and the entry alternates between undo and redo directions.
	 *
	 * @param meta Replacement metadata.
	 */
	setMeta( meta: unknown ): void {
		this.entries[ this.index ].meta = meta;
	}

	/**
	 * Steps back one entry.
	 *
	 * @return The state now in effect, unchanged when there was nothing to undo.
	 */
	undo(): T {
		if ( this.canUndo ) {
			this.index--;
		}

		return this.current;
	}

	/**
	 * Steps forward one entry.
	 *
	 * @return The state now in effect, unchanged when there was nothing to redo.
	 */
	redo(): T {
		if ( this.canRedo ) {
			this.index++;
		}

		return this.current;
	}

	/**
	 * Every state still on the stack, oldest first.
	 *
	 * For callers holding resources a state refers to but does not contain -- a layer's
	 * pixels, which live in a GPU texture. Anything reachable by undo or redo is still
	 * needed, and only the entries this stack has dropped are safe to free.
	 */
	get states(): T[] {
		return this.entries.map( ( entry ) => entry.state );
	}

	/** The state the stack started from. */
	get initial(): T {
		return this.entries[ 0 ].state;
	}
}
