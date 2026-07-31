/**
 * The View and Image info panels.
 *
 * Two small read-mostly panels: what the stage shows around the picture, and what the
 * picture is.
 */

import { __, sprintf } from '../../../i18n';
import { createCheckbox } from '../../controls';
import { registerPanel } from '../registry';

/** Registers the View panel. */
function registerViewPanel(): void {
	registerPanel( {
		id: 'view',
		title: __( 'View' ),
		order: 85,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const toggles = (
				[
					[ 'rulers', __( 'Rulers' ), __( 'Marked in canvas pixels.' ) ],
					[
						'snapping',
						__( 'Snapping' ),
						__(
							'Snap a moved layer to the canvas edges and centre. Hold Alt to bypass.'
						),
					],
				] as Array< [ 'rulers' | 'snapping', string, string ] >
			).map( ( [ key, label, hint ] ) =>
				createCheckbox( {
					label,
					title: hint,
					checked: ctx.getView()[ key ],
					onChange: ( checked ) => ctx.setView( { [ key ]: checked } ),
				} )
			);

			host.append( ...toggles.map( ( toggle ) => toggle.el ) );

			return () => {
				for ( const toggle of toggles ) {
					toggle.destroy();
				}
			};
		},
	} );
}

/** Registers the Image info panel. */
function registerInfoPanel(): void {
	registerPanel( {
		id: 'info',
		title: __( 'Image info' ),
		order: 90,
		defaultCollapsed: true,
		render: ( host, ctx ) => {
			const { payload } = ctx;

			const rows: Array< [ string, string ] > = [
				[
					__( 'Dimensions' ),
					sprintf( '%1$d × %2$d', payload.width, payload.height ),
				],
				[ __( 'Format' ), payload.mime.replace( 'image/', '' ).toUpperCase() ],
				[
					__( 'Megapixels' ),
					( ( payload.width * payload.height ) / 1_000_000 ).toFixed( 1 ),
				],
			];

			if ( payload.sourceId !== payload.id ) {
				rows.push( [ __( 'Edited from' ), `#${ payload.sourceId }` ] );
			}

			const list = document.createElement( 'dl' );
			list.className = 'lz-info';

			for ( const [ term, value ] of rows ) {
				const dt = document.createElement( 'dt' );
				dt.textContent = term;

				const dd = document.createElement( 'dd' );
				dd.textContent = value;

				list.append( dt, dd );
			}

			host.appendChild( list );
		},
	} );
}

/** Registers the presentation panels. */
export function registerViewPanels(): void {
	registerViewPanel();
	registerInfoPanel();
}
