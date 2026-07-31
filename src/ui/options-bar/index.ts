/**
 * The contextual options bar.
 *
 * A horizontal strip under the toolbar whose contents change with the active tool,
 * in the manner of Photoshop's. It exists because the settings that matter while
 * you are using a tool should be within a few pixels of the canvas, not buried in a
 * sidebar panel you have to go and expand.
 *
 * The sidebar panels still hold the same settings and stay in sync -- this is a
 * second view of one model, not a second model. Every control comes from the adaptive
 * kit in `controls/`, so the whole bar is built from Desktop Mode components when
 * Desktop Mode is active and from plain inputs when it is not.
 *
 * This module is the dispatch table. Each tool's controls live in a module of its own,
 * written against `OptionsBuilder` rather than against this class.
 */

import { __ } from '../../i18n';
import type { ActiveTool } from '../panels';
import { OptionsBuilder } from './builder';
import {
	renderBrushOptions,
	renderCloneOptions,
	renderFillOptions,
	renderHistoryOptions,
	renderPixelToolOptions,
} from './brush-tools';
import {
	renderGradientOptions,
	renderPathOptions,
	renderShapeOptions,
} from './draw-tools';
import { TOOL_HINTS, TOOL_NAMES } from './labels';
import { renderSelectOptions, renderWandOptions } from './selection-tools';
import { renderTextOptions, renderZoomOptions } from './text-tools';
import type { OptionsBarOptions } from './types';

export type { OptionsBarOptions } from './types';

/**
 * Fills the bar for one tool.
 *
 * Returns false when the tool has no options of its own, so the caller knows to fall
 * back to a plain hint.
 *
 * @param tool Active tool.
 * @param bar  The bar being built.
 */
function renderTool( tool: ActiveTool, bar: OptionsBuilder ): boolean {
	switch ( tool ) {
		case 'select':
			renderSelectOptions( bar );
			return true;
		case 'wand':
			renderWandOptions( bar );
			return true;
		case 'brush':
		case 'eraser':
			renderBrushOptions( bar, 'eraser' === tool );
			return true;
		case 'history':
			renderHistoryOptions( bar );
			return true;
		case 'path':
			renderPathOptions( bar );
			return true;
		case 'retouch':
		case 'tone':
			renderPixelToolOptions( bar, tool );
			return true;
		case 'clone':
			renderCloneOptions( bar );
			return true;
		case 'fill':
			renderFillOptions( bar );
			return true;
		case 'gradient':
			renderGradientOptions( bar );
			return true;
		case 'shape':
			renderShapeOptions( bar );
			return true;
		case 'text':
			renderTextOptions( bar );
			return true;
		case 'zoom':
			renderZoomOptions( bar );
			return true;
		default:
			return false;
	}
}

/**
 * A tool-sensitive strip of controls.
 */
export class OptionsBar {
	public readonly el: HTMLElement;

	private options: OptionsBarOptions;

	private builder: OptionsBuilder;

	private offBrush: () => void;

	/**
	 * @param options Bar configuration.
	 */
	constructor( options: OptionsBarOptions ) {
		this.options = options;

		this.el = document.createElement( 'div' );
		this.el.className = 'lz-options';
		this.el.setAttribute( 'role', 'toolbar' );
		this.el.setAttribute( 'aria-label', __( 'Tool options' ) );

		this.builder = new OptionsBuilder( this.el, options, () => this.render() );

		// Keep the bar honest when a setting changes from the sidebar instead.
		this.offBrush = options.ctx.onBrushChange( () => this.sync() );

		this.render();
	}

	/** Rebuilds the bar for the current tool. */
	render = (): void => {
		const tool = this.options.getTool();

		this.builder.release();
		this.el.replaceChildren();

		const name = document.createElement( 'span' );
		name.className = 'lz-options__tool';
		name.textContent = TOOL_NAMES[ tool ] ? __( TOOL_NAMES[ tool ] ) : '';
		this.el.appendChild( name );

		if ( ! renderTool( tool, this.builder ) ) {
			this.builder.hint( TOOL_HINTS[ tool ] ? __( TOOL_HINTS[ tool ] ) : '' );
		}
	};

	/** Pushes the current settings into the controls on the bar. */
	sync = (): void => {
		this.builder.sync();
	};

	/** Releases listeners. */
	destroy(): void {
		this.offBrush();
		this.builder.release();
		this.el.remove();
	}
}
