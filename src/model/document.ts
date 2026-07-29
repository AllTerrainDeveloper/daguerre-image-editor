/**
 * The document: a canvas, and a layer sitting on it.
 *
 * The canvas is a surface with its own dimensions. Opening an image sizes the canvas
 * to match it and places the image as a layer, but the two are independent from that
 * moment on: the layer can be scaled, rotated and moved within the canvas, and the
 * canvas can be resized around the layer.
 *
 * This separation is the whole point. An earlier version folded both into a single
 * "crop the source" step, which meant dragging a transform handle resized the render
 * target underneath the drag -- so each pointer move was measured against a viewport
 * that had just changed, and the rectangle chased the pointer at roughly double
 * speed. Transforming a layer cannot do that, because it never touches the surface
 * it is drawn onto.
 *
 * Pure maths, no Pixi import, so it is unit-tested without a GPU.
 */

/** Pixel dimensions of the canvas. The output is exactly this size. */
export interface CanvasSize {
	width: number;
	height: number;
}

/**
 * Where a layer sits on the canvas.
 *
 * Position is normalised to the canvas so it survives a canvas resize sensibly.
 * Scale is an absolute multiplier on the layer's native pixels, so `1` always means
 * "one image pixel per canvas pixel" no matter how big either is.
 */
export interface LayerTransform {
	/** Layer centre, as a fraction of canvas width. 0.5 is centred. */
	x: number;
	/** Layer centre, as a fraction of canvas height. 0.5 is centred. */
	y: number;
	/**
	 * Horizontal multiplier on the layer's native size.
	 *
	 * Separate from the vertical one so an edge handle can stretch a single axis.
	 * Corner handles drive both together unless Shift is held.
	 */
	scaleX: number;
	/** Vertical multiplier on the layer's native size. */
	scaleY: number;
	/** Rotation about the layer's centre, in degrees. */
	rotation: number;
	/** Mirror horizontally. */
	flipH: boolean;
	/** Mirror vertically. */
	flipV: boolean;
}

/** A layer at rest: centred, unscaled, unrotated. */
export const IDENTITY_TRANSFORM: LayerTransform = {
	x: 0.5,
	y: 0.5,
	scaleX: 1,
	scaleY: 1,
	rotation: 0,
	flipH: false,
	flipV: false,
};

/** Smallest canvas, in pixels, so a document can always be grabbed back. */
export const MIN_CANVAS = 16;

/** How far a layer may be scaled, so a slip cannot allocate an absurd render. */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 20;

/**
 * Whether a transform leaves the layer exactly where it started.
 *
 * @param transform Transform to test.
 */
export function isIdentityTransform( transform: LayerTransform ): boolean {
	const e = 1e-4;

	return (
		Math.abs( transform.x - 0.5 ) < e &&
		Math.abs( transform.y - 0.5 ) < e &&
		Math.abs( transform.scaleX - 1 ) < e &&
		Math.abs( transform.scaleY - 1 ) < e &&
		Math.abs( transform.rotation ) < e &&
		! transform.flipH &&
		! transform.flipV
	);
}

/**
 * Whether the canvas still matches the layer's native size.
 *
 * @param canvas Canvas size.
 * @param source Source image size.
 */
export function isNativeCanvas( canvas: CanvasSize, source: CanvasSize ): boolean {
	return (
		Math.abs( canvas.width - source.width ) < 1 &&
		Math.abs( canvas.height - source.height ) < 1
	);
}

/**
 * Clamps a canvas to something renderable.
 *
 * @param canvas    Candidate size.
 * @param maxPixels Ceiling on total pixels.
 */
export function clampCanvas( canvas: CanvasSize, maxPixels: number ): CanvasSize {
	let width = Math.max( MIN_CANVAS, Math.round( canvas.width ) || MIN_CANVAS );
	let height = Math.max( MIN_CANVAS, Math.round( canvas.height ) || MIN_CANVAS );

	// Shrink proportionally rather than truncating one axis, so a canvas that asked
	// for too much comes back the shape the user intended.
	const total = width * height;

	if ( total > maxPixels ) {
		const factor = Math.sqrt( maxPixels / total );

		width = Math.max( MIN_CANVAS, Math.floor( width * factor ) );
		height = Math.max( MIN_CANVAS, Math.floor( height * factor ) );
	}

	return { width, height };
}

/**
 * Clamps a transform to usable bounds.
 *
 * Position is deliberately *not* clamped: a layer may hang off the edge of the
 * canvas, which is exactly what happens when you scale one up to fill a frame.
 *
 * @param transform Candidate transform.
 */
export function clampTransform( transform: LayerTransform ): LayerTransform {
	const axis = ( value: number ) =>
		Math.min(
			MAX_SCALE,
			Math.max( MIN_SCALE, Number.isFinite( value ) ? value : 1 )
		);

	return {
		x: Number.isFinite( transform.x ) ? transform.x : 0.5,
		y: Number.isFinite( transform.y ) ? transform.y : 0.5,
		scaleX: axis( transform.scaleX ),
		scaleY: axis( transform.scaleY ),
		rotation: Number.isFinite( transform.rotation )
			? normaliseAngle( transform.rotation )
			: 0,
		flipH: transform.flipH === true,
		flipV: transform.flipV === true,
	};
}

/**
 * Wraps an angle into -180..180.
 *
 * @param degrees Angle in degrees.
 */
export function normaliseAngle( degrees: number ): number {
	let angle = degrees % 360;

	if ( angle > 180 ) {
		angle -= 360;
	}

	if ( angle <= -180 ) {
		angle += 360;
	}

	return angle;
}

/**
 * The layer's on-canvas size in pixels, before rotation.
 *
 * @param source    Native layer size.
 * @param transform Layer transform.
 */
export function layerSize( source: CanvasSize, transform: LayerTransform ): CanvasSize {
	return {
		width: source.width * transform.scaleX,
		height: source.height * transform.scaleY,
	};
}

/**
 * The axis-aligned bounding box of the transformed layer, in canvas pixels.
 *
 * @param source    Native layer size.
 * @param transform Layer transform.
 * @param canvas    Canvas size, to resolve the normalised position.
 */
export function layerBounds(
	source: CanvasSize,
	transform: LayerTransform,
	canvas: CanvasSize
): { x: number; y: number; width: number; height: number } {
	const size = layerSize( source, transform );
	const radians = ( transform.rotation * Math.PI ) / 180;
	const cos = Math.abs( Math.cos( radians ) );
	const sin = Math.abs( Math.sin( radians ) );

	const width = size.width * cos + size.height * sin;
	const height = size.width * sin + size.height * cos;

	return {
		x: transform.x * canvas.width - width / 2,
		y: transform.y * canvas.height - height / 2,
		width,
		height,
	};
}

/**
 * The scale that makes a layer exactly fill the canvas without cropping it.
 *
 * @param source Native layer size.
 * @param canvas Canvas size.
 */
export function fitScale( source: CanvasSize, canvas: CanvasSize ): number {
	if ( source.width <= 0 || source.height <= 0 ) {
		return 1;
	}

	return Math.min( canvas.width / source.width, canvas.height / source.height );
}

/**
 * The scale that makes a layer cover the canvas entirely, overflowing if needed.
 *
 * @param source Native layer size.
 * @param canvas Canvas size.
 */
export function coverScale( source: CanvasSize, canvas: CanvasSize ): number {
	if ( source.width <= 0 || source.height <= 0 ) {
		return 1;
	}

	return Math.max( canvas.width / source.width, canvas.height / source.height );
}

/**
 * Applies a crop to the document.
 *
 * Cropping resizes the *canvas* and moves the layer to compensate, so the pixels
 * under the crop rectangle stay exactly where they were. That is what makes crop a
 * separate tool from transform: one changes the surface, the other changes what sits
 * on it, and neither disturbs the other.
 *
 * @param canvas    Current canvas size.
 * @param transform Current layer transform.
 * @param rect      Crop rectangle in normalised canvas coordinates.
 * @return The new canvas and transform.
 */
export function applyCrop(
	canvas: CanvasSize,
	transform: LayerTransform,
	rect: { x: number; y: number; w: number; h: number }
): { canvas: CanvasSize; transform: LayerTransform } {
	const next: CanvasSize = {
		width: Math.max( MIN_CANVAS, Math.round( canvas.width * rect.w ) ),
		height: Math.max( MIN_CANVAS, Math.round( canvas.height * rect.h ) ),
	};

	// The layer's centre in old canvas pixels, re-expressed as a fraction of the
	// new, smaller canvas.
	const centreX = transform.x * canvas.width - rect.x * canvas.width;
	const centreY = transform.y * canvas.height - rect.y * canvas.height;

	return {
		canvas: next,
		transform: {
			...transform,
			x: centreX / ( canvas.width * rect.w ),
			y: centreY / ( canvas.height * rect.h ),
		},
	};
}

/**
 * Resizes the canvas, keeping the layer where it appears to be.
 *
 * Growing a canvas should add space around the picture rather than move the picture,
 * so the layer's position is re-expressed against the new dimensions.
 *
 * @param canvas    Current canvas size.
 * @param transform Current layer transform.
 * @param next      Requested canvas size.
 * @param anchor    Where the existing content sits in the new canvas, 0..1.
 * @return The new canvas and transform.
 */
export function resizeCanvas(
	canvas: CanvasSize,
	transform: LayerTransform,
	next: CanvasSize,
	anchor: { x: number; y: number } = { x: 0.5, y: 0.5 }
): { canvas: CanvasSize; transform: LayerTransform } {
	const offsetX = ( next.width - canvas.width ) * anchor.x;
	const offsetY = ( next.height - canvas.height ) * anchor.y;

	const centreX = transform.x * canvas.width + offsetX;
	const centreY = transform.y * canvas.height + offsetY;

	return {
		canvas: next,
		transform: {
			...transform,
			x: next.width === 0 ? 0.5 : centreX / next.width,
			y: next.height === 0 ? 0.5 : centreY / next.height,
		},
	};
}

/**
 * Validates a canvas size from untrusted input.
 *
 * A zero canvas is legitimate and passes through untouched: it is the sentinel for
 * "not sized yet", which is what a freshly created or newly migrated recipe carries
 * until the editor opens the image and fills it in. Clamping it to the minimum here
 * would leave every migrated edit stranded on a 16x16 canvas.
 *
 * @param raw      Candidate size.
 * @param fallback Size to use when the candidate is unusable.
 */
export function normaliseCanvas( raw: unknown, fallback: CanvasSize ): CanvasSize {
	if ( ! raw || typeof raw !== 'object' ) {
		return { ...fallback };
	}

	const input = raw as Partial< CanvasSize >;
	const width = Number( input.width );
	const height = Number( input.height );

	if ( ! Number.isFinite( width ) || ! Number.isFinite( height ) ) {
		return { ...fallback };
	}

	if ( width <= 0 || height <= 0 ) {
		return { width: 0, height: 0 };
	}

	return {
		width: Math.max( MIN_CANVAS, Math.round( width ) ),
		height: Math.max( MIN_CANVAS, Math.round( height ) ),
	};
}

/**
 * Validates a layer transform from untrusted input.
 *
 * @param raw Candidate transform.
 */
export function normaliseTransform( raw: unknown ): LayerTransform {
	if ( ! raw || typeof raw !== 'object' ) {
		return { ...IDENTITY_TRANSFORM };
	}

	const input = raw as Partial< LayerTransform >;

	// A pre-v4 transform carried one `scale` for both axes.
	const legacy = ( raw as { scale?: unknown } ).scale;
	const uniform = Number.isFinite( Number( legacy ) ) ? Number( legacy ) : 1;

	return clampTransform( {
		x: Number( input.x ?? 0.5 ),
		y: Number( input.y ?? 0.5 ),
		scaleX: Number( input.scaleX ?? uniform ),
		scaleY: Number( input.scaleY ?? uniform ),
		rotation: Number( input.rotation ?? 0 ),
		flipH: input.flipH === true,
		flipV: input.flipV === true,
	} );
}

/** A rectangle in normalised 0..1 canvas coordinates. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * The largest rectangle of a given aspect ratio that fits, centred, in the canvas.
 *
 * @param aspect       Width divided by height. Zero or negative means "leave as is".
 * @param canvasAspect Aspect ratio of the canvas the rectangle sits in.
 */
export function centredCrop( aspect: number, canvasAspect: number ): Rect {
	if ( ! Number.isFinite( aspect ) || aspect <= 0 ) {
		return { x: 0, y: 0, w: 1, h: 1 };
	}

	// Both are real-world proportions, but the rectangle lives in a unit square.
	// Dividing by the canvas's own aspect converts between the two.
	const relative = aspect / canvasAspect;

	if ( relative >= 1 ) {
		const h = 1 / relative;

		return { x: 0, y: ( 1 - h ) / 2, w: 1, h };
	}

	return { x: ( 1 - relative ) / 2, y: 0, w: relative, h: 1 };
}

/**
 * Constrains a rectangle to the unit square, keeping it non-degenerate.
 *
 * @param rect Rectangle to clamp.
 */
export function clampRect( rect: Rect ): Rect {
	const min = 0.01;

	const w = Math.min( 1, Math.max( min, rect.w ) );
	const h = Math.min( 1, Math.max( min, rect.h ) );

	return {
		x: Math.min( 1 - w, Math.max( 0, rect.x ) ),
		y: Math.min( 1 - h, Math.max( 0, rect.y ) ),
		w,
		h,
	};
}

/**
 * What a layer is made of.
 *
 * `image` layers are backed by an attachment's texture and are purely descriptive:
 * the recipe can reproduce them from the original file. `raster` layers hold pixels
 * that exist nowhere else -- a pasted fragment, a brush stroke -- and therefore
 * cannot be reconstructed from a recipe alone. See `Layer` for what that costs.
 */
export type LayerKind = 'image' | 'raster';

/** One layer in the document stack. */
export interface Layer {
	id: string;
	name: string;
	kind: LayerKind;
	transform: LayerTransform;
	visible: boolean;
	/** 0..1. */
	opacity: number;
}

/** The base layer every document starts with, holding the opened image. */
export const BASE_LAYER_ID = 'base';

/**
 * Builds the layer an opened image becomes.
 *
 * @param name Display name.
 */
export function createImageLayer( name: string ): Layer {
	return {
		id: BASE_LAYER_ID,
		name,
		kind: 'image',
		transform: { ...IDENTITY_TRANSFORM },
		visible: true,
		opacity: 1,
	};
}

/**
 * Builds an empty raster layer.
 *
 * @param name      Display name.
 * @param transform Optional starting transform.
 */
export function createRasterLayer(
	name: string,
	transform: Partial< LayerTransform > = {}
): Layer {
	return {
		id: `layer-${ Math.random().toString( 36 ).slice( 2, 10 ) }`,
		name,
		kind: 'raster',
		transform: { ...IDENTITY_TRANSFORM, ...transform },
		visible: true,
		opacity: 1,
	};
}

/**
 * Validates a layer stack from untrusted input.
 *
 * A document always has at least one layer, so an unusable stack falls back to a
 * single image layer rather than to nothing.
 *
 * @param raw      Candidate layers.
 * @param fallback Name for the base layer when rebuilding.
 */
export function normaliseLayers( raw: unknown, fallback = 'Image' ): Layer[] {
	if ( ! Array.isArray( raw ) || raw.length === 0 ) {
		return [ createImageLayer( fallback ) ];
	}

	const layers: Layer[] = [];

	for ( const entry of raw ) {
		if ( ! entry || typeof entry !== 'object' ) {
			continue;
		}

		const layer = entry as Partial< Layer >;
		const opacity = Number( layer.opacity ?? 1 );

		layers.push( {
			id: typeof layer.id === 'string' && layer.id ? layer.id : createRasterLayer( '' ).id,
			name: typeof layer.name === 'string' ? layer.name : fallback,
			kind: layer.kind === 'raster' ? 'raster' : 'image',
			transform: normaliseTransform( layer.transform ),
			visible: layer.visible !== false,
			opacity: Number.isFinite( opacity ) ? Math.min( 1, Math.max( 0, opacity ) ) : 1,
		} );
	}

	return layers.length > 0 ? layers : [ createImageLayer( fallback ) ];
}

/**
 * Finds a layer by id.
 *
 * @param layers Layer stack.
 * @param id     Layer id.
 */
export function findLayer( layers: Layer[], id: string ): Layer | undefined {
	return layers.find( ( layer ) => layer.id === id );
}

/**
 * Returns the stack with one layer replaced.
 *
 * @param layers Layer stack.
 * @param id     Layer to replace.
 * @param patch  Fields to change.
 */
export function updateLayer(
	layers: Layer[],
	id: string,
	patch: Partial< Layer >
): Layer[] {
	return layers.map( ( layer ) =>
		layer.id === id ? { ...layer, ...patch } : layer
	);
}

/**
 * Moves a layer up or down the stack.
 *
 * @param layers    Layer stack.
 * @param id        Layer to move.
 * @param direction 1 moves it towards the front, -1 towards the back.
 */
export function reorderLayer( layers: Layer[], id: string, direction: 1 | -1 ): Layer[] {
	const index = layers.findIndex( ( layer ) => layer.id === id );
	const target = index + direction;

	if ( index === -1 || target < 0 || target >= layers.length ) {
		return layers;
	}

	const next = [ ...layers ];
	const [ moved ] = next.splice( index, 1 );

	next.splice( target, 0, moved );

	return next;
}
