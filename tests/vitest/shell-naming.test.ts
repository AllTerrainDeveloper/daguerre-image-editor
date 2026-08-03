import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	componentTag,
	hasComponent,
	pickComponent,
	shellEvents,
	onShellEvent,
} from '../../src/platform';

/**
 * Pretends a set of custom element tags are registered.
 *
 * @param tags Tags the shell has defined.
 */
function withComponents( tags: string[] ): void {
	vi.spyOn( customElements, 'get' ).mockImplementation( ( tag: string ) =>
		tags.includes( tag ) ? ( class {} as CustomElementConstructor ) : undefined
	);
}

afterEach( () => {
	vi.restoreAllMocks();
} );

describe( 'component naming', () => {
	it( 'finds a component under the current name', () => {
		withComponents( [ 'os-button' ] );

		expect( componentTag( 'button' ) ).toBe( 'os-button' );
		expect( hasComponent( 'button' ) ).toBe( true );
	} );

	it( 'still finds one under the name the shell used before the rename', () => {
		withComponents( [ 'wpd-button' ] );

		expect( componentTag( 'button' ) ).toBe( 'wpd-button' );
		expect( hasComponent( 'button' ) ).toBe( true );
	} );

	it( 'prefers the current name when a page somehow has both', () => {
		withComponents( [ 'wpd-button', 'os-button' ] );

		expect( componentTag( 'button' ) ).toBe( 'os-button' );
	} );

	it( 'reports nothing when no shell defines it', () => {
		withComponents( [] );

		expect( componentTag( 'button' ) ).toBeNull();
		expect( hasComponent( 'button' ) ).toBe( false );
	} );

	it( 'never resolves a name that already carries a prefix', () => {
		// Guards the mistake this whole layer exists to prevent: passing `wpd-button`
		// through would look for `os-wpd-button` and silently fall back to plain DOM.
		withComponents( [ 'os-button', 'wpd-button' ] );

		expect( componentTag( 'wpd-button' ) ).toBeNull();
		expect( componentTag( 'os-button' ) ).toBeNull();
	} );

	it( 'picks the best available of several candidates', () => {
		withComponents( [ 'os-text-field' ] );

		expect( pickComponent( [ 'number-field', 'text-field' ] ) ).toBe(
			'os-text-field'
		);
	} );

	it( 'falls through every candidate before giving up', () => {
		withComponents( [] );

		expect( pickComponent( [ 'number-field', 'text-field' ] ) ).toBeNull();
	} );
} );

describe( 'event naming', () => {
	it( 'offers both spellings, current first', () => {
		expect( shellEvents( 'pick' ) ).toEqual( [ 'os-pick', 'wpd-pick' ] );
	} );

	it( 'fires for either spelling', () => {
		const el = document.createElement( 'div' );
		const handler = vi.fn();

		onShellEvent( el, 'range-change', handler );

		el.dispatchEvent( new CustomEvent( 'os-range-change' ) );
		el.dispatchEvent( new CustomEvent( 'wpd-range-change' ) );

		expect( handler ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'detaches every spelling at once', () => {
		const el = document.createElement( 'div' );
		const handler = vi.fn();

		onShellEvent( el, 'pick', handler )();

		el.dispatchEvent( new CustomEvent( 'os-pick' ) );
		el.dispatchEvent( new CustomEvent( 'wpd-pick' ) );

		expect( handler ).not.toHaveBeenCalled();
	} );
} );
