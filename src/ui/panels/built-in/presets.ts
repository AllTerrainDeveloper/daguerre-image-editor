/**
 * The Presets panel.
 */

import { __, sprintf } from '../../../i18n';
import { createButton, createIconButton, createTextField } from '../../controls';
import type { ControlHandle } from '../../controls';
import { registerPanel } from '../registry';
import type { PanelContext } from '../types';
import { hintText } from './shared';

/**
 * Reads the message out of whatever a failed request threw.
 *
 * The server's own wording is worth preserving -- "you may not save presets" and
 * "the request timed out" call for completely different responses.
 *
 * @param error    The failure.
 * @param fallback What to say when it carried no message.
 */
function failureMessage( error: unknown, fallback: string ): string {
	return error instanceof Error ? error.message : fallback;
}

/** Registers the Presets panel. */
export function registerPresetsPanel(): void {
	registerPanel( {
		id: 'presets',
		title: __( 'Presets' ),
		order: 70,
		defaultCollapsed: true,
		render: ( host, ctx ) => renderPresets( host, ctx ),
	} );
}

/**
 * Builds the preset list and the save form.
 *
 * @param host Panel body.
 * @param ctx  Panel context.
 * @return Teardown.
 */
function renderPresets( host: HTMLElement, ctx: PanelContext ): () => void {
	const list = document.createElement( 'div' );
	list.className = 'lz-presets';

	const status = hintText( '' );

	/** Controls belonging to the rows currently drawn. */
	let rowHandles: ControlHandle[] = [];

	let presetName = '';

	const releaseRows = () => {
		for ( const handle of rowHandles ) {
			handle.destroy();
		}

		rowHandles = [];
	};

	const refresh = async () => {
		list.replaceChildren();
		releaseRows();

		let presets;

		try {
			presets = await ctx.listPresets();
		} catch ( error ) {
			status.textContent = failureMessage(
				error,
				__( 'Presets could not be loaded.' )
			);

			return;
		}

		if ( 0 === presets.length ) {
			status.textContent = __(
				'No presets yet. Adjust an image, then save the look to reuse it.'
			);

			return;
		}

		status.textContent = '';

		for ( const preset of presets ) {
			const row = document.createElement( 'div' );
			row.className = 'lz-preset';

			const apply = createButton( {
				label: preset.name,
				variant: 'ghost',
				onClick: () => ctx.applyPreset( preset ),
			} );

			apply.el.classList.add( 'lz-preset__apply' );

			const remove = createIconButton( {
				glyph: '×',
				label: sprintf( __( 'Delete “%s”' ), preset.name ),
				className: 'lz-preset__delete',
				onClick: async () => {
					await ctx.deletePreset( preset.id );
					await refresh();
				},
			} );

			rowHandles.push( apply, remove );
			row.append( apply.el, remove.el );
			list.appendChild( row );
		}
	};

	const name = createTextField( {
		label: __( 'Preset name' ),
		value: '',
		placeholder: __( 'Name this look' ),
		onChange: ( value ) => {
			presetName = value;
		},
	} );

	const save = createButton( {
		label: __( 'Save look' ),
		variant: 'secondary',
		onClick: async () => {
			if ( ! presetName.trim() ) {
				return;
			}

			try {
				await ctx.savePreset( presetName );
				presetName = '';
				name.setValue( '' );
				await refresh();
			} catch ( error ) {
				status.textContent = failureMessage(
					error,
					__( 'The preset could not be saved.' )
				);
			}
		},
	} );

	host.append( list, status, name.el, save.el );
	void refresh();

	return () => {
		releaseRows();
		name.destroy();
		save.destroy();
	};
}
