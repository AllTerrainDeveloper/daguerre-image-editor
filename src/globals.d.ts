/**
 * Ambient globals Daguerre reads off the page.
 *
 * Declared once, here, rather than beside each consumer: TypeScript merges
 * `declare global` blocks by name, so two modules each augmenting `Window.wp` with
 * their own slice conflict rather than combining.
 *
 * None of these are dependencies. Every one is feature-detected at the point of
 * use, because Daguerre has to run on a plain WordPress admin where `wp.desktop`
 * does not exist and `wp.i18n` may not have been enqueued.
 */

import type { DaguerreConfig } from './types';
import type { Pixi } from './engine/pixi-loader';

/** The slice of `window.wp.desktop` Daguerre touches. */
export interface WpDesktopLike {
	isActive?: () => boolean;
	fetch?: (
		input: RequestInfo | URL,
		init?: RequestInit,
		opts?: { windowId?: string; silent?: boolean }
	) => Promise< Response >;
	showToast?: ( opts: {
		message: string;
		type?: string;
		duration?: number;
	} ) => () => void;
	confirm?: ( opts: {
		title?: string;
		message?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		destructive?: boolean;
	} ) => Promise< boolean >;
}

/** The slice of `window.wp.media` Daguerre touches. Backbone ships no types. */
export interface BackboneView {
	prototype: {
		render: ( ...args: unknown[] ) => unknown;
		[ key: string ]: unknown;
	};
	extend: ( props: Record< string, unknown > ) => BackboneView;
}

export interface WpMediaLike {
	view?: {
		Attachment?: {
			Details?: BackboneView & { TwoColumn?: BackboneView };
		};
	};
}

/** The slices of the block editor packages Daguerre touches. */
export interface WpElementLike {
	createElement: ( type: unknown, props?: unknown, ...children: unknown[] ) => unknown;
	Fragment: unknown;
}

export interface WpHooksLike {
	addFilter: (
		hook: string,
		namespace: string,
		callback: unknown,
		priority?: number
	) => void;
}

export interface WpBlockEditorLike {
	BlockControls?: unknown;
}

export interface WpComponentsLike {
	ToolbarGroup?: unknown;
	ToolbarButton?: unknown;
}

/** The slice of `window.wp.i18n` Daguerre touches. */
export interface WpI18nLike {
	__: ( text: string, domain?: string ) => string;
	sprintf?: ( format: string, ...args: unknown[] ) => string;
}

declare global {
	interface Window {
		wp?: {
			desktop?: WpDesktopLike;
			i18n?: WpI18nLike;
			media?: WpMediaLike;
			element?: WpElementLike;
			hooks?: WpHooksLike;
			blockEditor?: WpBlockEditorLike;
			components?: WpComponentsLike;
		};
		/** Localized by `daguerre_get_config()`. */
		daguerreConfig?: DaguerreConfig;
		/** Set by the vendored PixiJS build, or by Desktop Mode's copy of it. */
		PIXI?: Pixi;
	}
}

export {};
