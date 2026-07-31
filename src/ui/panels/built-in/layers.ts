/**
 * The Layers panel.
 */

import { __ } from '../../../i18n';
import { BASE_LAYER_ID, reorderLayer, updateLayer } from '../../../model/document';
import type { Layer } from '../../../model/document';
import { createButton, createIconButton } from '../../controls';
import type { IconButtonHandle } from '../../controls';
import { registerPanel } from '../registry';
import type { PanelContext } from '../types';

/**
 * Builds one row of the layer stack.
 *
 * The row's controls come from the adaptive kit, so a layers palette inside Desktop
 * Mode is built from its buttons rather than from look-alikes. Rows are rebuilt on
 * every change, so their handles are handed back for teardown rather than held.
 *
 * @param layer Layer this row describes.
 * @param ctx   Panel context.
 */
function layerRow(
	layer: Layer,
	ctx: PanelContext
): { el: HTMLElement; handles: IconButtonHandle[] } {
	const row = document.createElement( 'div' );
	row.className = 'lz-layer';
	row.classList.toggle( 'is-active', layer.id === ctx.getActiveLayerId() );

	const eye = createIconButton( {
		glyph: layer.visible ? '●' : '○',
		label: layer.visible ? __( 'Hide layer' ) : __( 'Show layer' ),
		className: 'lz-layer__eye',
		onClick: () =>
			ctx.setLayers(
				updateLayer( ctx.getLayers(), layer.id, { visible: ! layer.visible } )
			),
	} );

	const name = document.createElement( 'button' );
	name.type = 'button';
	name.className = 'lz-layer__name';
	name.textContent = layer.name;
	name.addEventListener( 'click', () => ctx.setLayers( ctx.getLayers(), layer.id ) );

	const move = ( glyph: string, label: string, direction: 1 | -1 ) =>
		createIconButton( {
			glyph,
			label,
			className: 'lz-layer__move',
			onClick: () =>
				ctx.setLayers( reorderLayer( ctx.getLayers(), layer.id, direction ), layer.id ),
		} );

	const up = move( '↑', __( 'Bring forward' ), 1 );
	const down = move( '↓', __( 'Send backward' ), -1 );

	const handles = [ eye, up, down ];
	row.append( eye.el, name, up.el, down.el );

	// The base image is the document's reason for existing; removing it would leave
	// an edit of nothing.
	if ( BASE_LAYER_ID !== layer.id ) {
		const remove = createIconButton( {
			glyph: '×',
			label: __( 'Delete layer' ),
			className: 'lz-layer__delete',
			onClick: () =>
				ctx.setLayers(
					ctx.getLayers().filter( ( entry ) => entry.id !== layer.id )
				),
		} );

		handles.push( remove );
		row.appendChild( remove.el );
	}

	return { el: row, handles };
}

/** Registers the Layers panel. */
export function registerLayersPanel(): void {
	registerPanel( {
		id: 'layers',
		title: __( 'Layers' ),
		order: 5,
		render: ( host, ctx ) => {
			const list = document.createElement( 'div' );
			list.className = 'lz-layers';

			/** Controls belonging to the rows currently drawn. */
			let rowHandles: IconButtonHandle[] = [];

			const releaseRows = () => {
				for ( const handle of rowHandles ) {
					handle.destroy();
				}

				rowHandles = [];
			};

			const draw = () => {
				list.replaceChildren();
				releaseRows();

				// Front-most first, which is how every layers palette reads.
				for ( const layer of [ ...ctx.getLayers() ].reverse() ) {
					const row = layerRow( layer, ctx );

					rowHandles.push( ...row.handles );
					list.appendChild( row.el );
				}
			};

			const add = createButton( {
				label: __( 'Add layer' ),
				variant: 'secondary',
				onClick: () => ctx.addLayer(),
			} );

			const hint = document.createElement( 'p' );
			hint.className = 'lz-hint';
			hint.textContent = __(
				'Painted and pasted layers are pixels, not settings — save a copy to keep them.'
			);

			const off = ctx.onRecipeChange( draw );

			draw();
			host.append( list, add.el, hint );

			return () => {
				releaseRows();
				off();
				add.destroy();
			};
		},
	} );
}
