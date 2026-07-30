/**
 * Shared types for the configuration and REST payloads PHP hands the browser.
 */

/** Bounds and rest position of a single adjustment, mirrored from `lienzo_op_schema()`. */
export interface OpSpec {
	min: number;
	max: number;
	default: number;
}

/** The adjustment table, keyed by op type. */
export type OpSchema = Record< string, OpSpec >;

/** `window.lienzoConfig`, localized by `lienzo_get_config()`. */
export interface LienzoConfig {
	version: string;
	restUrl: string;
	restNonce: string;
	pluginUrl: string;
	mediaUrl: string;
	supportedMimes: string[];
	maxRenderPixels: number;
	canUpload: boolean;
	/**
	 * Whether Desktop Mode is active *for this user*, not merely installed.
	 *
	 * Desktop Mode is a per-user preference, so the plugin being active says nothing
	 * about whether this person is looking at a desktop. The controls use it to decide
	 * which house style to fall back to when a component is unavailable.
	 */
	desktopMode: boolean;
	schema: OpSchema;
}

/** Response body of `GET lienzo/v1/media/<id>`. */
export interface MediaPayload {
	id: number;
	sourceId: number;
	mime: string;
	url: string;
	sourceUrl: string;
	width: number;
	height: number;
	title: string;
	alt: string;
	recipe: import('./model/recipe').Recipe;
	canSave: boolean;
	schema: OpSchema;
}

/**
 * Response body of `POST lienzo/v1/media/<id>/render`.
 *
 * `width` and `height` are what the site actually stored, which is not necessarily
 * what was uploaded: WordPress applies `big_image_size_threshold` to every upload
 * and silently downscales past it.
 */
export interface SaveResult {
	id: number;
	sourceId: number;
	url: string;
	width: number;
	height: number;
	mime: string;
	recipe: import('./model/recipe').Recipe;
}

/**
 * A saved look.
 *
 * Deliberately not a whole recipe: geometry and the source attachment are stripped
 * server-side, because a crop is a statement about one particular frame and would
 * be nonsense applied to another.
 */
export interface Preset {
	id: string;
	name: string;
	recipe: {
		version: number;
		ops: import('./model/recipe').Op[];
		curves: import('./engine/lut').Curves;
		levels: import('./engine/lut').Levels;
	};
}
