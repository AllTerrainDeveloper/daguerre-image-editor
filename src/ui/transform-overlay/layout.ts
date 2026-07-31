/**
 * Putting the handles where the model says they are.
 */

import type { OverlayChrome } from './chrome';
import type { TransformOverlayOptions } from './types';

/**
 * Repositions the handles from the model.
 *
 * @param chrome  The overlay's elements.
 * @param options Overlay wiring.
 */
export function layOut(
	chrome: OverlayChrome,
	options: TransformOverlayOptions
): void {
	const viewport = options.getViewport();
	const canvas = options.getCanvas();

	if ( ! viewport || canvas.width <= 0 ) {
		chrome.root.hidden = true;

		return;
	}

	chrome.root.hidden = false;
	chrome.root.style.insetInlineStart = `${ viewport.x }px`;
	chrome.root.style.insetBlockStart = `${ viewport.y }px`;
	chrome.root.style.inlineSize = `${ viewport.width }px`;
	chrome.root.style.blockSize = `${ viewport.height }px`;

	const transform = options.getTransform();
	const image = options.getImageSize();
	const ratio = viewport.width / canvas.width;

	const width = image.width * transform.scaleX * ratio;
	const height = image.height * transform.scaleY * ratio;

	chrome.box.style.inlineSize = `${ width }px`;
	chrome.box.style.blockSize = `${ height }px`;
	chrome.box.style.insetInlineStart = `${ transform.x * viewport.width - width / 2 }px`;
	chrome.box.style.insetBlockStart = `${ transform.y * viewport.height - height / 2 }px`;
	chrome.box.style.transform = `rotate(${ transform.rotation }deg)`;
}

/**
 * Positions a snap guide.
 *
 * @param element Guide element.
 * @param at      Normalised position, or null to hide it.
 * @param axis    Which guide.
 */
export function showGuide(
	element: HTMLElement,
	at: number | null,
	axis: 'v' | 'h'
): void {
	if ( null === at ) {
		element.hidden = true;

		return;
	}

	element.hidden = false;

	if ( 'v' === axis ) {
		element.style.insetInlineStart = `${ at * 100 }%`;
	} else {
		element.style.insetBlockStart = `${ at * 100 }%`;
	}
}
