/**
 * Curves and levels: the two tone controls, and what "unchanged" looks like for each.
 */

/** A control point, both coordinates in 0..255. */
export type CurvePoint = [ number, number ];

/** The curves attached to an edit. Any channel may be absent, meaning "linear". */
export interface Curves {
	rgb?: CurvePoint[];
	r?: CurvePoint[];
	g?: CurvePoint[];
	b?: CurvePoint[];
}

/** Black point, white point and midtone gamma. */
export interface Levels {
	black: number;
	white: number;
	gamma: number;
}

/** Levels that change nothing. */
export const IDENTITY_LEVELS: Levels = { black: 0, white: 255, gamma: 1 };

/** The straight line every unset curve falls back to. */
export const LINEAR_CURVE: CurvePoint[] = [
	[ 0, 0 ],
	[ 255, 255 ],
];
