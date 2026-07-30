/**
 * Typed client for the `lienzo/v1` routes.
 */

import { request } from '../platform';
import type { Recipe } from '../model/recipe';
import type { LienzoConfig, MediaPayload, Preset, SaveResult } from '../types';

/** An error carrying the server's own message and code. */
export class RestError extends Error {
	public readonly code: string;

	public readonly status: number;

	constructor( message: string, code: string, status: number ) {
		super( message );
		this.name = 'RestError';
		this.code = code;
		this.status = status;
	}
}

/**
 * Turns a failed response into an error carrying the server's wording.
 *
 * WordPress REST errors are `{ code, message, data: { status } }`. Surfacing the
 * server's message matters here: "You are not allowed to edit this image" and "The
 * original image file is not readable on disk" need very different responses from
 * the user, and a generic "request failed" tells them nothing.
 *
 * @param response Failed response.
 */
async function toError( response: Response ): Promise< RestError > {
	let message = `Request failed with status ${ response.status }.`;
	let code = 'lienzo_http_error';

	try {
		const body = await response.json();

		if ( body && typeof body === 'object' ) {
			if ( typeof body.message === 'string' ) {
				message = body.message;
			}
			if ( typeof body.code === 'string' ) {
				code = body.code;
			}
		}
	} catch {
		// A non-JSON body (a PHP fatal, an HTML error page) leaves the defaults.
	}

	return new RestError( message, code, response.status );
}

/**
 * Client for Lienzo's REST routes.
 */
export class RestClient {
	private config: LienzoConfig;

	/**
	 * @param config Runtime configuration from `window.lienzoConfig`.
	 */
	constructor( config: LienzoConfig ) {
		this.config = config;
	}

	/** Headers every authenticated call needs. */
	private headers( extra: Record< string, string > = {} ): Record< string, string > {
		return { 'X-WP-Nonce': this.config.restNonce, ...extra };
	}

	/**
	 * Fetches everything needed to open an image.
	 *
	 * @param attachmentId Attachment to open.
	 */
	async getMedia( attachmentId: number ): Promise< MediaPayload > {
		const response = await request( `${ this.config.restUrl }media/${ attachmentId }`, {
			credentials: 'same-origin',
			headers: this.headers(),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as MediaPayload;
	}

	/**
	 * Uploads a rendered image and creates a new attachment.
	 *
	 * Sent as multipart rather than JSON with a base64 payload: a full-resolution
	 * PNG can be tens of megabytes, and base64 would inflate that by a third before
	 * it ever reached the wire.
	 *
	 * @param attachmentId Attachment the edit was rendered from.
	 * @param blob         Encoded image.
	 * @param recipe       The edit, for storage alongside the result.
	 */
	async saveRender(
		attachmentId: number,
		blob: Blob,
		recipe: Recipe
	): Promise< SaveResult > {
		const body = new FormData();

		// The server renames this from the source attachment; the name here only has
		// to be present and have a plausible extension.
		body.append( 'file', blob, 'render' );
		body.append( 'recipe', JSON.stringify( recipe ) );

		const response = await request(
			`${ this.config.restUrl }media/${ attachmentId }/render`,
			{
				method: 'POST',
				credentials: 'same-origin',
				headers: this.headers(),
				body,
			}
		);

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as SaveResult;
	}

	/** Lists the current user's presets. */
	async getPresets(): Promise< Preset[] > {
		const response = await request( `${ this.config.restUrl }presets`, {
			credentials: 'same-origin',
			headers: this.headers(),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as Preset[];
	}

	/**
	 * Saves the current edit as a named preset.
	 *
	 * @param name   Display name.
	 * @param recipe The edit to derive it from.
	 */
	async createPreset( name: string, recipe: Recipe ): Promise< Preset > {
		const response = await request( `${ this.config.restUrl }presets`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: this.headers( { 'Content-Type': 'application/json' } ),
			body: JSON.stringify( { name, recipe: JSON.stringify( recipe ) } ),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return ( await response.json() ) as Preset;
	}

	/**
	 * Deletes a preset.
	 *
	 * @param id Preset identifier.
	 */
	async deletePreset( id: string ): Promise< void > {
		const response = await request( `${ this.config.restUrl }presets/${ id }`, {
			method: 'DELETE',
			credentials: 'same-origin',
			headers: this.headers(),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}
	}

	/**
	 * Streams the original bytes from the same origin as wp-admin.
	 *
	 * Only used when a direct load tainted or failed -- see `loadSourceImage()`.
	 *
	 * @param sourceUrl Absolute URL of the `/source` route.
	 */
	async getSourceBlob( sourceUrl: string ): Promise< Blob > {
		const response = await request( sourceUrl, {
			credentials: 'same-origin',
			headers: this.headers(),
		} );

		if ( ! response.ok ) {
			throw await toError( response );
		}

		return response.blob();
	}
}
