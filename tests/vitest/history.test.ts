import { describe, expect, it } from 'vitest';
import { History } from '../../src/model/history';

/** A clock the test drives by hand, so coalescing is deterministic. */
function clock() {
	const state = { t: 1000 };
	return {
		now: () => state.t,
		advance: ( ms: number ) => {
			state.t += ms;
		},
	};
}

describe( 'History', () => {
	it( 'starts with the initial state and nothing to undo', () => {
		const h = new History( 'a' );

		expect( h.current ).toBe( 'a' );
		expect( h.canUndo ).toBe( false );
		expect( h.canRedo ).toBe( false );
	} );

	it( 'undoes and redoes a change', () => {
		const c = clock();
		const h = new History( 'a', c.now );

		h.push( 'b', 'edit' );
		expect( h.current ).toBe( 'b' );
		expect( h.canUndo ).toBe( true );

		expect( h.undo() ).toBe( 'a' );
		expect( h.canRedo ).toBe( true );

		expect( h.redo() ).toBe( 'b' );
		expect( h.canRedo ).toBe( false );
	} );

	it( 'coalesces a slider drag into one undo step', () => {
		// A drag emits a value per pointer move. Without coalescing, undo would
		// crawl back one pixel at a time.
		const c = clock();
		const h = new History( 'a', c.now );

		for ( const v of [ 'b', 'c', 'd', 'e' ] ) {
			c.advance( 16 );
			h.push( v, 'exposure' );
		}

		expect( h.current ).toBe( 'e' );
		expect( h.undo() ).toBe( 'a' );
	} );

	it( 'does not coalesce across different sliders', () => {
		const c = clock();
		const h = new History( 'a', c.now );

		h.push( 'b', 'exposure' );
		c.advance( 16 );
		h.push( 'c', 'contrast' );

		expect( h.undo() ).toBe( 'b' );
		expect( h.undo() ).toBe( 'a' );
	} );

	it( 'does not coalesce once the drag has paused', () => {
		const c = clock();
		const h = new History( 'a', c.now );

		h.push( 'b', 'exposure' );
		c.advance( 5000 );
		h.push( 'c', 'exposure' );

		expect( h.undo() ).toBe( 'b' );
		expect( h.undo() ).toBe( 'a' );
	} );

	it( 'discards the redo tail when a new change follows an undo', () => {
		const c = clock();
		const h = new History( 'a', c.now );

		h.push( 'b', 'one' );
		c.advance( 1000 );
		h.push( 'c', 'two' );
		h.undo();

		expect( h.canRedo ).toBe( true );

		c.advance( 1000 );
		h.push( 'd', 'three' );

		expect( h.canRedo ).toBe( false );
		expect( h.current ).toBe( 'd' );
		expect( h.undo() ).toBe( 'b' );
	} );

	it( 'never coalesces onto the initial state', () => {
		// Otherwise the very first drag would overwrite the entry undo returns to.
		const c = clock();
		const h = new History( 'a', c.now );

		h.push( 'b', '@initial' );

		expect( h.canUndo ).toBe( true );
		expect( h.undo() ).toBe( 'a' );
	} );

	it( 'is a no-op at the ends of the stack', () => {
		const h = new History( 'a' );

		expect( h.undo() ).toBe( 'a' );
		expect( h.redo() ).toBe( 'a' );
	} );

	it( 'bounds retained snapshots so a long session cannot grow forever', () => {
		const c = clock();
		const h = new History( 0, c.now );

		for ( let i = 1; i <= 250; i++ ) {
			c.advance( 1000 );
			h.push( i, `step-${ i }` );
		}

		let steps = 0;
		while ( h.canUndo ) {
			h.undo();
			steps++;
		}

		expect( steps ).toBeLessThanOrEqual( 100 );
		expect( h.current ).toBeGreaterThan( 0 );
	} );

	it( 'replace() changes the state without creating an undo step', () => {
		// Output format and quality go through replace(): they describe how the
		// result is encoded, not what it looks like, so undo must not step through
		// them.
		const c = clock();
		const h = new History( 'a', c.now );

		h.push( 'b', 'edit' );
		h.replace( 'b-webp' );

		expect( h.current ).toBe( 'b-webp' );
		expect( h.canRedo ).toBe( false );
		expect( h.undo() ).toBe( 'a' );
	} );

	it( 'replace() on the initial state does not make it undoable', () => {
		const h = new History( 'a' );
		h.replace( 'a-webp' );

		expect( h.current ).toBe( 'a-webp' );
		expect( h.canUndo ).toBe( false );
	} );

	it( 'exposes the state it started from', () => {
		const h = new History( 'a' );
		h.push( 'b', 'edit' );

		expect( h.initial ).toBe( 'a' );
	} );
} );

describe( 'entry metadata', () => {
	it( 'carries a payload a snapshot cannot express', () => {
		// Painted pixels are not describable by the recipe, so an entry can hold the
		// patch that puts them back.
		const history = new History( { v: 0 } );

		history.push( { v: 1 }, 'paint', { tiles: 3 } );

		expect( history.meta ).toEqual( { tiles: 3 } );
	} );

	it( 'reports no metadata for entries that carry none', () => {
		const history = new History( { v: 0 } );

		history.push( { v: 1 }, 'exposure' );

		expect( history.meta ).toBeUndefined();
	} );

	it( 'follows undo and redo to the right entry', () => {
		const history = new History( { v: 0 } );

		history.push( { v: 1 }, 'paint', 'first' );
		history.push( { v: 2 }, 'paint', 'second' );

		expect( history.meta ).toBe( 'second' );

		history.undo();
		expect( history.meta ).toBe( 'first' );

		history.redo();
		expect( history.meta ).toBe( 'second' );
	} );

	it( 'can be swapped in place, which is how redo gets its pixels', () => {
		// Undoing a stroke needs the pixels it produced in order to redo it, and those
		// only exist once it has happened -- so the patch is exchanged as it is applied.
		const history = new History( { v: 0 } );

		history.push( { v: 1 }, 'paint', 'before' );
		history.setMeta( 'after' );

		expect( history.meta ).toBe( 'after' );
	} );

	it( 'exposes the label of the entry in effect', () => {
		const history = new History( { v: 0 } );

		history.push( { v: 1 }, 'paint' );

		expect( history.label ).toBe( 'paint' );
	} );

	it( 'never coalesces entries that carry a payload', () => {
		// Two brush strokes in quick succession share a label and a time window, which
		// is exactly what coalescing looks for -- but the first stroke's patch holds
		// pixels that exist nowhere else. Merging would discard them.
		let clock = 1000;
		const history = new History( { v: 0 }, () => clock );

		history.push( { v: 1 }, 'paint', 'first' );
		clock += 10;
		history.push( { v: 2 }, 'paint', 'second' );

		expect( history.meta ).toBe( 'second' );

		history.undo();
		expect( history.meta ).toBe( 'first' );
	} );

	it( 'still coalesces a drag, which carries no payload', () => {
		let clock = 1000;
		const history = new History( { v: 0 }, () => clock );

		history.push( { v: 1 }, 'exposure' );
		clock += 10;
		history.push( { v: 2 }, 'exposure' );

		history.undo();
		expect( history.current ).toEqual( { v: 0 } );
	} );
} );
