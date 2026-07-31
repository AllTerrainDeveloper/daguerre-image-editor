/**
 * Turning a rendered canvas into a file.
 */

/**
 * Encodes a canvas.
 *
 * @param canvas  Canvas to encode.
 * @param format  MIME type.
 * @param quality Encoder quality, 0..1. Ignored for PNG.
 * @throws {Error} When the browser cannot produce the requested format.
 */
export function encodeCanvas(
	canvas: HTMLCanvasElement,
	format: string,
	quality: number
): Promise< Blob > {
	return new Promise( ( resolve, reject ) => {
		canvas.toBlob(
			( blob ) => {
				if ( blob ) {
					resolve( blob );

					return;
				}

				reject(
					new Error(
						`The browser could not encode the image as ${ format }. Try a different format.`
					)
				);
			},
			format,
			quality
		);
	} );
}
