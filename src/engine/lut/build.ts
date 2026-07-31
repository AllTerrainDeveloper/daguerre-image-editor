/**
 * Baking curves and levels into the 256-entry table the shader samples.
 *
 * One texture upload per tone change, and none per pixel -- which is the whole reason
 * the tone controls are a lookup rather than shader maths.
 */

import { sampleCurve } from './curve';
import { isIdentityLevels, isLinear } from './identity';
import { sampleLevels } from './levels';
import type { Curves, Levels } from './types';

/**
 * Bakes levels and every curve into one RGBA lookup table.
 *
 * Order is levels, then the master curve, then the per-channel curve -- the same
 * order the controls are stacked in the panel, so the result matches the mental
 * model of applying them top to bottom.
 *
 * The alpha channel is filled with the identity ramp. It is never sampled, but a
 * texture with a zeroed alpha channel is easy to mistake for a broken one when
 * inspecting it in a debugger.
 *
 * @param curves Curve set. Omitted channels are linear.
 * @param levels Levels. Omitted means no change.
 * @return 256x1 RGBA bytes, ready to upload as a texture.
 */
export function buildLut( curves?: Curves, levels?: Levels ): Uint8Array {
	const base = levels && ! isIdentityLevels( levels )
		? sampleLevels( levels )
		: identityRamp();

	const master = isLinear( curves?.rgb ) ? null : sampleCurve( curves!.rgb! );

	const channels = ( [ 'r', 'g', 'b' ] as const ).map( ( channel ) =>
		isLinear( curves?.[ channel ] ) ? null : sampleCurve( curves![ channel ]! )
	);

	const lut = new Uint8Array( 256 * 4 );

	for ( let i = 0; i < 256; i++ ) {
		const afterLevels = base[ i ];
		const afterMaster = master ? master[ afterLevels ] : afterLevels;

		for ( let c = 0; c < 3; c++ ) {
			const channel = channels[ c ];

			lut[ i * 4 + c ] = channel ? channel[ afterMaster ] : afterMaster;
		}

		lut[ i * 4 + 3 ] = i;
	}

	return lut;
}

/** The 0..255 identity ramp. */
function identityRamp(): Uint8ClampedArray {
	const ramp = new Uint8ClampedArray( 256 );

	for ( let i = 0; i < 256; i++ ) {
		ramp[ i ] = i;
	}

	return ramp;
}
