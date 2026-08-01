import { describe, expect, it } from 'vitest';
import {
	attachmentFrom,
	postFrom,
} from '../../src/hosts/desktop-mode/icon-drop';

describe( 'attachmentFrom', () => {
	it( 'reads a media tile dragged by ref', () => {
		expect( attachmentFrom( { kind: 'attachment', ref: '42' } ) ).toBe( 42 );
	} );

	it( 'reads the site window spelling of the same thing', () => {
		expect( attachmentFrom( { kind: 'media', ref: '42' } ) ).toBe( 42 );
	} );

	it( 'reads a payload that named the id rather than a ref', () => {
		expect( attachmentFrom( { id: 42 } ) ).toBe( 42 );
		expect( attachmentFrom( { mediaId: 42 } ) ).toBe( 42 );
	} );

	it( 'declines a payload that is some other kind of thing', () => {
		expect( attachmentFrom( { kind: 'post', ref: '42' } ) ).toBe( 0 );
		expect( attachmentFrom( { kind: 'user', ref: '42' } ) ).toBe( 0 );
	} );

	it( 'declines a payload carrying no id at all', () => {
		expect( attachmentFrom( {} ) ).toBe( 0 );
		expect( attachmentFrom( { kind: 'attachment', ref: 'nonsense' } ) ).toBe( 0 );
	} );
} );

describe( 'postFrom', () => {
	it( 'reads any post type, because the desktop calls them all posts', () => {
		expect( postFrom( { kind: 'post', ref: '2087' } ) ).toBe( 2087 );
	} );

	it( 'declines anything that is not a post', () => {
		expect( postFrom( { kind: 'attachment', ref: '2087' } ) ).toBe( 0 );
		expect( postFrom( { kind: 'user', ref: '2087' } ) ).toBe( 0 );
		expect( postFrom( {} ) ).toBe( 0 );
	} );

	it( 'declines a post with no usable id', () => {
		expect( postFrom( { kind: 'post', ref: '0' } ) ).toBe( 0 );
		expect( postFrom( { kind: 'post' } ) ).toBe( 0 );
	} );
} );
