/**
 * Drawing one ruler face.
 */

import { RULER_SIZE, tickStep } from './ticks';

/**
 * Paints one ruler.
 *
 * @param canvas Target canvas.
 * @param width  CSS width.
 * @param height CSS height.
 * @param axis   Which ruler.
 * @param origin Where canvas pixel zero falls, in CSS pixels along the ruler.
 * @param scale  CSS pixels per canvas pixel.
 * @param marker Pointer position in canvas pixels, drawn as a tracking line.
 */
export function paintRuler(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	axis: 'h' | 'v',
	origin: number,
	scale: number,
	marker: { x: number; y: number } | null
): void {
	const dpr = window.devicePixelRatio || 1;
	const w = Math.max( 1, Math.round( width ) );
	const h = Math.max( 1, Math.round( height ) );

	if ( canvas.width !== w * dpr || canvas.height !== h * dpr ) {
		canvas.width = w * dpr;
		canvas.height = h * dpr;
		canvas.style.width = `${ w }px`;
		canvas.style.height = `${ h }px`;
	}

	const ctx = canvas.getContext( '2d' );

	if ( ! ctx ) {
		return;
	}

	ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
	ctx.clearRect( 0, 0, w, h );

	ctx.fillStyle = '#1a1f24';
	ctx.fillRect( 0, 0, w, h );

	const length = axis === 'h' ? w : h;
	const step = tickStep( scale );

	ctx.font = '9px -apple-system, system-ui, sans-serif';
	ctx.textBaseline = 'top';
	ctx.fillStyle = '#8f979e';
	ctx.strokeStyle = '#4a5259';
	ctx.lineWidth = 1;
	ctx.beginPath();

	// First tick at or before the visible start, so panning does not shift the
	// marks relative to the image.
	const firstValue = Math.floor( -origin / scale / step ) * step;

	for ( let value = firstValue; ; value += step ) {
		const at = origin + value * scale;

		if ( at > length ) {
			break;
		}

		if ( at < 0 ) {
			continue;
		}

		const major = value % ( step * 5 ) === 0;
		const size = major ? RULER_SIZE : RULER_SIZE * 0.4;

		if ( axis === 'h' ) {
			ctx.moveTo( Math.round( at ) + 0.5, RULER_SIZE - size );
			ctx.lineTo( Math.round( at ) + 0.5, RULER_SIZE );
		} else {
			ctx.moveTo( RULER_SIZE - size, Math.round( at ) + 0.5 );
			ctx.lineTo( RULER_SIZE, Math.round( at ) + 0.5 );
		}

		if ( major ) {
			if ( axis === 'h' ) {
				ctx.fillText( String( value ), at + 2, 2 );
			} else {
				// Rotated so the numbers read along the ruler.
				ctx.save();
				ctx.translate( 2, at + 2 );
				ctx.rotate( Math.PI / 2 );
				ctx.fillText( String( value ), 0, -RULER_SIZE + 4 );
				ctx.restore();
			}
		}
	}

	ctx.stroke();

	if ( marker ) {
		const at = origin + ( axis === 'h' ? marker.x : marker.y ) * scale;

		ctx.strokeStyle = '#3582c4';
		ctx.beginPath();

		if ( axis === 'h' ) {
			ctx.moveTo( Math.round( at ) + 0.5, 0 );
			ctx.lineTo( Math.round( at ) + 0.5, RULER_SIZE );
		} else {
			ctx.moveTo( 0, Math.round( at ) + 0.5 );
			ctx.lineTo( RULER_SIZE, Math.round( at ) + 0.5 );
		}

		ctx.stroke();
	}
}
