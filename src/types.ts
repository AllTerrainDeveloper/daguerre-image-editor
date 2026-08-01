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
	/**
	 * Whether painted, pasted or dropped layers were baked into the saved file.
	 *
	 * Such a save cannot be replayed from the original, so it becomes its own origin:
	 * re-opening it shows the pixels that were saved, with the adjustments already in
	 * them and the sliders back at zero.
	 */
	flattened: boolean;
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

/**
 * The post an image was opened from, when it was opened from one.
 *
 * Carried so the save step can offer to put the edit back where it came from. A
 * product's featured image and the third image of its gallery are both "the
 * product's image", and updating them is not the same operation -- which is why the
 * slot travels with the id.
 */
export interface PostOrigin {
	postId: number;
	postTitle: string;
	postType: string;
	/** Singular label, so the editor can name the thing rather than its slug. */
	postTypeLabel: string;
	/** Where the image sits on the post: 'thumbnail', 'gallery', or '' for neither. */
	slot: string;
	/** Whether this user may actually write the change back. */
	canAttach: boolean;
}

/** What the post-image lookup answers. */
export interface PostImage extends PostOrigin {
	attachmentId: number;
}
