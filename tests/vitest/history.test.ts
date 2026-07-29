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
