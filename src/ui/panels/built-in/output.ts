/**
 * The Output panel.
 */

import { __ } from '../../../i18n';
import { createSelect, createSlider } from '../../controls';
import { registerPanel } from '../registry';

/** Registers the Output panel. */
export function registerOutputPanel(): void {
	registerPanel( {
		id: 'output',
		title: __( 'Output' ),
		order: 80,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			// PNG is lossless, so the encoder ignores quality entirely. A live-looking
			// slider that silently does nothing is worse than no slider.
			const syncQuality = () => {
				quality.el.hidden = 'image/png' === ctx.getRecipe().output.format;
			};

			const format = createSelect( {
				label: __( 'Format' ),
				value: ctx.getRecipe().output.format,
				options: [
					{ value: 'image/jpeg', label: __( 'JPEG — smallest, no transparency' ) },
					{ value: 'image/png', label: __( 'PNG — lossless, keeps transparency' ) },
					{ value: 'image/webp', label: __( 'WebP — small and lossless-capable' ) },
				],
				onChange: ( value ) => {
					ctx.setOutput( { format: value } );
					syncQuality();
				},
			} );

			const quality = createSlider( {
				label: __( 'Quality' ),
				min: 10,
				max: 100,
				step: 1,
				suffix: '%',
				value: Math.round( ctx.getRecipe().output.quality * 100 ),
				resetTo: 92,
				onInput: ( value ) => ctx.setOutput( { quality: value / 100 } ),
			} );

			host.append( format.el, quality.el );
			syncQuality();

			return () => {
				format.destroy();
				quality.destroy();
			};
		},
	} );
}
