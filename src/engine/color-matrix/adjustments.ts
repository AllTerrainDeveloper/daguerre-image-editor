/**
 * A matrix per adjustment.
 *
 * Each takes its canonical value -- the units the recipe stores -- and returns the
 * matrix that applies it. Composing them is the caller's business.
 */

import { LUMA_B, LUMA_G, LUMA_R } from './matrix';
import type { ColorMatrix } from './matrix';

/**
 * Exposure, in stops.
 *
 * The slider's -1..1 maps to plus or minus two stops, which is the useful range for
 * correcting a mis-metered photograph without turning the sliders into a novelty.
 *
 * @param v Slider value, -1..1.
 */
export function exposureMatrix( v: number ): ColorMatrix {
	const scale = Math.pow( 2, v * 2 );

	return [
		scale, 0, 0, 0, 0,
		0, scale, 0, 0, 0,
		0, 0, scale, 0, 0,
		0, 0, 0, 1, 0,
	];
}

/**
 * Contrast, pivoting around mid grey.
 *
 * @param v Slider value, -1..1. At -1 the image collapses to flat grey.
 */
export function contrastMatrix( v: number ): ColorMatrix {
	const c = 1 + v;
	const offset = 0.5 * ( 1 - c );

	return [
		c, 0, 0, 0, offset,
		0, c, 0, 0, offset,
		0, 0, c, 0, offset,
		0, 0, 0, 1, 0,
	];
}

/**
 * Saturation, interpolating each channel towards its luminance.
 *
 * @param v Slider value, -1..1. At -1 the image is monochrome; at +1, doubled.
 */
export function saturationMatrix( v: number ): ColorMatrix {
	const s = 1 + v;
	const ir = LUMA_R * ( 1 - s );
	const ig = LUMA_G * ( 1 - s );
	const ib = LUMA_B * ( 1 - s );

	return [
		ir + s, ig, ib, 0, 0,
		ir, ig + s, ib, 0, 0,
		ir, ig, ib + s, 0, 0,
		0, 0, 0, 1, 0,
	];
}

/**
 * Colour temperature, as a red/blue channel gain.
 *
 * A true Kelvin conversion would require knowing the capture illuminant and
 * working in a linear colour space. This is the same approximation every browser
 * photo editor uses: push red up and blue down for warmer, the reverse for cooler.
 * Green is untouched so the shift stays on the blue-yellow axis.
 *
 * @param v Slider value, -1..1. Positive is warmer.
 */
export function temperatureMatrix( v: number ): ColorMatrix {
	const r = 1 + 0.2 * v;
	const b = 1 - 0.2 * v;

	return [
		r, 0, 0, 0, 0,
		0, 1, 0, 0, 0,
		0, 0, b, 0, 0,
		0, 0, 0, 1, 0,
	];
}

/**
 * Tint, on the green/magenta axis perpendicular to temperature.
 *
 * Red and blue move together by half of green's opposite so overall luminance
 * stays roughly where it was.
 *
 * @param v Slider value, -1..1. Positive is magenta.
 */
export function tintMatrix( v: number ): ColorMatrix {
	const g = 1 - 0.15 * v;
	const rb = 1 + 0.075 * v;

	return [
		rb, 0, 0, 0, 0,
		0, g, 0, 0, 0,
		0, 0, rb, 0, 0,
		0, 0, 0, 1, 0,
	];
}
