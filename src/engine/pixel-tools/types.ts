/**
 * What the retouching tools work on and what they produce.
 */

/** What a retouching dab does to the pixels it covers. */
export type PixelOp =
	| 'blur'
	| 'sharpen'
	| 'smudge'
	| 'heal'
	| 'dodge'
	| 'burn'
	| 'sponge'
	| 'saturate'
	| 'clone'
	| 'restore';

/**
 * A block of RGBA pixels.
 *
 * Structurally an `ImageData`, but declared here so the kernels can be tested
 * without a canvas implementation.
 */
export interface PixelBuffer {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

/** Colour carried between smudge dabs, as premultiplied-free RGBA 0..255. */
export type Carry = [ number, number, number, number ];

export interface DabRequest {
	op: PixelOp;
	/** Modified in place. */
	target: PixelBuffer;
	/** Where sampling reads from. Defaults to `target`. Clone needs its own. */
	source?: PixelBuffer;
	/** Dab centre, in buffer pixels. */
	x: number;
	y: number;
	/** Dab radius, in buffer pixels. */
	radius: number;
	/** How hard the dab bites, 0..1. */
	strength: number;
	/** Edge softness, 0..1. 1 is a hard edge. */
	hardness?: number;
	/** Clone offset: how far the sample point sits from the dab, in pixels. */
	offsetX?: number;
	offsetY?: number;
	/** Colour the smudge is dragging along. */
	carry?: Carry | null;
}

export interface DabResult {
	/** The region actually touched, so a caller can upload only that. */
	rect: { x: number; y: number; width: number; height: number };
	/** Updated smudge colour, when the op carries one. */
	carry?: Carry;
}

/** The retouching modes offered by the retouch tool, in picker order. */
export const RETOUCH_MODES: Array< { value: PixelOp; label: string } > = [
	{ value: 'blur', label: 'Blur' },
	{ value: 'sharpen', label: 'Sharpen' },
	{ value: 'smudge', label: 'Smudge' },
	{ value: 'heal', label: 'Heal' },
];

/** The modes offered by the dodge/burn tool, in picker order. */
export const TONE_MODES: Array< { value: PixelOp; label: string } > = [
	{ value: 'dodge', label: 'Dodge' },
	{ value: 'burn', label: 'Burn' },
	{ value: 'sponge', label: 'Desaturate' },
	{ value: 'saturate', label: 'Saturate' },
];
