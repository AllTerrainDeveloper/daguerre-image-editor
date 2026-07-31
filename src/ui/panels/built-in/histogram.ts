/**
 * The histogram panel.
 */

import { __ } from '../../../i18n';
import { HistogramView } from '../../histogram-view';
import { registerPanel } from '../registry';

/** Registers the Histogram panel. */
export function registerHistogramPanel(): void {
	registerPanel( {
		id: 'histogram',
		title: __( 'Histogram' ),
		order: 10,
		render: ( host, ctx ) => {
			const view = new HistogramView();
			host.appendChild( view.el );

			const off = ctx.onHistogram( ( histogram ) => view.update( histogram ) );

			return () => {
				off();
				view.destroy();
			};
		},
	} );
}
