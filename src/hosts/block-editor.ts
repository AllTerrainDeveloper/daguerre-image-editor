/**
 * The block editor host.
 *
 * Adds an "Edit with Lienzo" item to the toolbar of `core/image` blocks.
 *
 * This *adds* an entry point; it does not replace core's own cropper. Core wires
 * its image-editing save handler through a `Symbol`-keyed private editor setting
 * (`mediaEditKey`, behind `unlock()`), which third-party code cannot reach. Trying
 * to substitute ours would mean reaching into private internals that are explicitly
 * not a contract. Sitting beside it is both honest and stable.
 *
 * Elements are created with `wp.element.createElement` rather than JSX so the whole
 * plugin stays a single dependency-free IIFE bundle -- no React import, no build
 * step beyond Vite.
 */

import { __ } from '../i18n';
import { openInDesktop } from './desktop-mode';

/** Block attributes the image block exposes that we care about. */
interface ImageAttributes {
	id?: number;
	url?: string;
	alt?: string;
	width?: number;
	height?: number;
}

/**
 * Registers the toolbar button.
 *
 * Every package is feature-detected: this same bundle also loads on screens with no
 * block editor at all, and a missing package must be a silent no-op rather than a
 * console error on every admin page.
 */
export function bootBlockEditor(): void {
	const element = window.wp?.element;
	const hooks = window.wp?.hooks;
	const blockEditor = window.wp?.blockEditor;
	const components = window.wp?.components;

	if (
		! element?.createElement ||
		! hooks?.addFilter ||
		! blockEditor?.BlockControls ||
		! components?.ToolbarGroup ||
		! components?.ToolbarButton
	) {
		return;
	}

	const { createElement, Fragment } = element;
	const { BlockControls } = blockEditor;
	const { ToolbarGroup, ToolbarButton } = components;

	hooks.addFilter(
		'editor.BlockEdit',
		'lienzo/image-toolbar',
		( BlockEdit: unknown ) =>
			function LienzoImageToolbar( props: {
				name: string;
				isSelected: boolean;
				attributes: ImageAttributes;
				setAttributes: ( attrs: Partial< ImageAttributes > ) => void;
			} ) {
				const original = createElement( BlockEdit, props );

				if ( props.name !== 'core/image' || ! props.isSelected ) {
					return original;
				}

				const id = Number( props.attributes?.id ?? 0 );

				// A freshly inserted block, or one pointing at an external URL, has
				// no attachment to edit.
				if ( ! id ) {
					return original;
				}

				const button = createElement(
					BlockControls,
					{ group: 'other' },
					createElement(
						ToolbarGroup,
						null,
						createElement(
							ToolbarButton,
							{
								label: __( 'Edit with Lienzo' ),
								onClick: () => openInDesktop( id ),
							},
							__( 'Lienzo' )
						)
					)
				);

				return createElement( Fragment, null, original, button );
			},
		20
	);
}
