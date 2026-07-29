/**
 * The adjustment shader: one pass, every colour and tone op.
 *
 * Shaders live as TypeScript string exports rather than `.frag` files so the Vite
 * library build needs no extra plugin and the bundle stays a single self-contained
 * IIFE.
 */

/**
 * Vertex shader.
 *
 * This is Pixi's own default filter vertex shader, inlined rather than imported.
 * Pixi is read off the `window.PIXI` global at runtime, and the default vertex
 * source is not guaranteed to be reachable there across builds, so depending on it
 * would make us fragile to a Pixi upgrade for no benefit. The maths -- mapping the
 * filter's output frame into clip space -- is fixed by Pixi's filter contract.
 */
export const ADJUST_VERT = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
	vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

	position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
	position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

	return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
	return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
	gl_Position = filterVertexPosition();
	vTextureCoord = filterTextureCoord();
}
`;

/**
 * Fragment shader.
 *
 * Applies the composed colour matrix, then vibrance, then the tone lookup table,
 * in one pass. Doing all of it
 * here rather than chaining Pixi filters is what keeps the image to a single round
 * of 8-bit quantisation -- chained passes each write an 8-bit render target, and six
 * of those produce visible banding in smooth gradients.
 *
 * Pixi hands filters **premultiplied** colour, so the shader divides alpha out
 * before doing any colour maths and multiplies it back in at the end. Skipping that
 * would make every adjustment behave differently on semi-transparent pixels.
 */
export const ADJUST_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLut;

/*
 * Filter-stage uniforms Pixi supplies. uInputClamp carries the valid texture
 * coordinates of the filtered area as (minX, minY, maxX, maxY), which is how the
 * vignette finds the centre of the image rather than of whatever padding the
 * filter system allocated around it.
 *
 * uOutputFrame is deliberately not used here: it is a vertex-stage uniform, and
 * declaring it in the fragment shader stops the program linking.
 */
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;

uniform float uColorMatrix[20];
uniform float uVibrance;
uniform float uLutMix;
uniform float uSharpen;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

/**
 * Scales saturation by how unsaturated a pixel already is.
 *
 * Vibrance is the one adjustment that cannot join the colour matrix: the amount of
 * the effect depends on the pixel, so it is not a linear transform. Muted colours
 * get the full push while already-vivid ones are left alone, which is what stops a
 * saturation boost from turning a red jacket into a solid block.
 */
vec3 applyVibrance( vec3 color, float amount )
{
	float mx = max( color.r, max( color.g, color.b ) );
	float mn = min( color.r, min( color.g, color.b ) );
	float chroma = mx - mn;
	float luma = dot( color, LUMA );

	float scale = 1.0 + amount * ( 1.0 - chroma );

	return mix( vec3( luma ), color, scale );
}

/**
 * Cheap hash for film grain.
 *
 * Deterministic in screen space and seeded per render, so the grain is stable while
 * a slider is dragged rather than crawling, but a save does not reproduce the exact
 * pattern the preview showed -- which nobody can tell apart and which costs nothing.
 */
float hash( vec2 p )
{
	return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

void main( void )
{
	vec4 color = texture( uTexture, vTextureCoord );

	if ( uSharpen > 0.0 ) {
		// Unsharp mask: subtract a small blur, add the difference back.
		//
		// The offset is one texel of the *render target*, so the effect scales with
		// whatever is being drawn. That is what keeps a sharpen previewed at 900px
		// looking the same when saved at 6000px, instead of vanishing.
		vec2 texel = uInputSize.zw;

		vec4 blurred =
			texture( uTexture, vTextureCoord + vec2( texel.x, 0.0 ) ) +
			texture( uTexture, vTextureCoord - vec2( texel.x, 0.0 ) ) +
			texture( uTexture, vTextureCoord + vec2( 0.0, texel.y ) ) +
			texture( uTexture, vTextureCoord - vec2( 0.0, texel.y ) );

		blurred *= 0.25;

		color += ( color - blurred ) * uSharpen * 1.5;
	}

	if ( color.a > 0.0 ) {
		color.rgb /= color.a;
	}

	vec4 result;

	result.r = uColorMatrix[0] * color.r + uColorMatrix[1] * color.g
		+ uColorMatrix[2] * color.b + uColorMatrix[3] * color.a + uColorMatrix[4];
	result.g = uColorMatrix[5] * color.r + uColorMatrix[6] * color.g
		+ uColorMatrix[7] * color.b + uColorMatrix[8] * color.a + uColorMatrix[9];
	result.b = uColorMatrix[10] * color.r + uColorMatrix[11] * color.g
		+ uColorMatrix[12] * color.b + uColorMatrix[13] * color.a + uColorMatrix[14];
	result.a = uColorMatrix[15] * color.r + uColorMatrix[16] * color.g
		+ uColorMatrix[17] * color.b + uColorMatrix[18] * color.a + uColorMatrix[19];

	if ( uVibrance != 0.0 ) {
		result.rgb = applyVibrance( clamp( result.rgb, 0.0, 1.0 ), uVibrance );
	}

	result.rgb = clamp( result.rgb, 0.0, 1.0 );

	if ( uVignette != 0.0 || uGrain > 0.0 ) {
		// Position across the filtered area, 0..1, independent of any padding the
		// filter system added around it.
		vec2 span = max( uInputClamp.zw - uInputClamp.xy, vec2( 1e-6 ) );
		vec2 uv = ( vTextureCoord - uInputClamp.xy ) / span;

		if ( uVignette != 0.0 ) {
			// Distance from centre, normalised so the corners sit at 1.
			float d = length( uv - 0.5 ) / 0.7071;
			float falloff = smoothstep( 0.35, 1.0, d );

			result.rgb *= 1.0 - falloff * uVignette;
		}

		if ( uGrain > 0.0 ) {
			float noise = hash( gl_FragCoord.xy + uSeed ) - 0.5;

			// Weighted towards the midtones. Grain in a blown highlight or a
			// crushed shadow only reads as sensor noise, never as film.
			float luma = dot( result.rgb, LUMA );
			float weight = 1.0 - abs( luma - 0.5 ) * 2.0;

			result.rgb += noise * uGrain * 0.25 * weight;
		}

		result.rgb = clamp( result.rgb, 0.0, 1.0 );
	}

	if ( uLutMix > 0.0 ) {
		// One fetch per channel: levels, the master curve and the per-channel curve
		// are all baked into this table before it is uploaded.
		//
		// Sampled at (v * 255 + 0.5) / 256 rather than at v. A 256-texel table's
		// texel centres sit at those half-offsets, and sampling at v instead would
		// land on a boundary and blend two neighbouring entries -- turning an
		// intentionally hard step in a curve into a soft one.
		vec3 coord = ( result.rgb * 255.0 + 0.5 ) / 256.0;

		result.r = texture( uLut, vec2( coord.r, 0.5 ) ).r;
		result.g = texture( uLut, vec2( coord.g, 0.5 ) ).g;
		result.b = texture( uLut, vec2( coord.b, 0.5 ) ).b;
	}

	finalColor = vec4( result.rgb * result.a, result.a );
}
`;
