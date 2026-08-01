import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPager } from '../../src/ui/picker/media-pager';
import type { LienzoConfig } from '../../src/types';

const request = vi.fn();

vi.mock( '../../src/platform', () => ( {
	request: ( ...args: unknown[] ) => request( ...args ),
} ) );

const CONFIG = {
	mediaUrl: 'https://example.test/wp-json/wp/v2/media',
	restNonce: 'nonce',
	supportedMimes: [ 'image/jpeg', 'image/png' ],
} as unknown as LienzoConfig;

/**
 * A stubbed `wp/v2/media` response.
 *
 * @param items      Media items to return.
 * @param totalPages What to report in X-WP-TotalPages.
 */
function page( items: Array< { id: number; mime_type: string } >, totalPages = 1 ) {
	return {
		ok: true,
		headers: { get: () => String( totalPages ) },
		json: async () => items,
	};
}

/**
 * The page number a recorded call asked for.
 *
 * @param call Zero-based call index.
 */
function pageParam( call: number ): string | null {
	return new URL( request.mock.calls[ call ][ 0 ] as string ).searchParams.get(
		'page'
	);
}

const JPEG = { id: 1, mime_type: 'image/jpeg' };

describe( 'MediaPager', () => {
	beforeEach( () => {
		request.mockReset();
	} );

	it( 'requests the first page before anything is known', async () => {
		request.mockResolvedValueOnce( page( [ JPEG ], 3 ) );

		const pager = new MediaPager( CONFIG );

		expect( pager.hasMore ).toBe( true );
		await pager.next();

		expect( pageParam( 0 ) ).toBe( '1' );
	} );

	it( 'advances a page at a time', async () => {
		request
			.mockResolvedValueOnce( page( [ JPEG ], 3 ) )
			.mockResolvedValueOnce( page( [ { id: 2, mime_type: 'image/png' } ], 3 ) );

		const pager = new MediaPager( CONFIG );

		await pager.next();
		await pager.next();

		expect( pageParam( 1 ) ).toBe( '2' );
		expect( pager.count ).toBe( 2 );
	} );

	it( 'reports more pages until the last one has been read', async () => {
		request
			.mockResolvedValueOnce( page( [ JPEG ], 2 ) )
			.mockResolvedValueOnce( page( [ { id: 2, mime_type: 'image/jpeg' } ], 2 ) );

		const pager = new MediaPager( CONFIG );

		await pager.next();
		expect( pager.hasMore ).toBe( true );

		await pager.next();
		expect( pager.hasMore ).toBe( false );
	} );

	it( 'drops images Lienzo cannot open', async () => {
		request.mockResolvedValueOnce(
			page( [ JPEG, { id: 2, mime_type: 'image/svg+xml' } ], 1 )
		);

		const items = await new MediaPager( CONFIG ).next();

		expect( items.map( ( item ) => item.id ) ).toEqual( [ 1 ] );
	} );

	it( 'keeps reading past a page with nothing editable on it', async () => {
		request
			.mockResolvedValueOnce( page( [ { id: 9, mime_type: 'image/svg+xml' } ], 3 ) )
			.mockResolvedValueOnce( page( [ JPEG ], 3 ) );

		const items = await new MediaPager( CONFIG ).next();

		expect( request ).toHaveBeenCalledTimes( 2 );
		expect( items.map( ( item ) => item.id ) ).toEqual( [ 1 ] );
	} );

	it( 'gives up rather than reading a whole library of unsupported files', async () => {
		request.mockResolvedValue( page( [ { id: 9, mime_type: 'image/svg+xml' } ], 50 ) );

		const items = await new MediaPager( CONFIG ).next();

		expect( items ).toEqual( [] );
		expect( request.mock.calls.length ).toBeLessThanOrEqual( 5 );
	} );

	it( 'stops at the last page even when every page was empty', async () => {
		request.mockResolvedValue( page( [], 2 ) );

		const pager = new MediaPager( CONFIG );

		await pager.next();

		expect( request ).toHaveBeenCalledTimes( 2 );
		expect( pager.hasMore ).toBe( false );
	} );

	it( 'follows a page count that grew mid-session', async () => {
		request
			.mockResolvedValueOnce( page( [ JPEG ], 1 ) )
			.mockResolvedValueOnce( page( [ { id: 2, mime_type: 'image/jpeg' } ], 2 ) );

		const pager = new MediaPager( CONFIG );

		await pager.next();
		expect( pager.hasMore ).toBe( false );

		// A fresh render picks the new total up from the next response.
		const second = new MediaPager( CONFIG );

		await second.next();
		expect( second.hasMore ).toBe( true );
	} );

	it( 'reports a library it could not read', async () => {
		request.mockResolvedValueOnce( { ok: false } );

		await expect( new MediaPager( CONFIG ).next() ).rejects.toThrow();
	} );
} );
