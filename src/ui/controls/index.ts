/**
 * Controls that adapt to the host.
 *
 * Inside Desktop Mode the shell registers a kit of `<wpd-*>` web components that
 * carry the desktop's theming, spacing and dark-mode handling. Using them makes
 * Lienzo look like it belongs. Outside Desktop Mode they do not exist, so every
 * factory here builds a plain-DOM equivalent instead.
 *
 * Detection is per tag and happens at build time rather than being inferred from
 * "is Desktop Mode running". The shell registers a core subset of components
 * eagerly and the rest only when a bundle importing them happens to load, so the
 * only trustworthy question is whether *this* tag is in the custom element registry
 * right now. An unregistered tag renders as inert markup with no error, which is
 * exactly the kind of silent breakage worth spending a `customElements.get()` on.
 *
 * The native fallbacks read Desktop Mode's CSS custom properties where they exist,
 * so even the fallback path inherits the desktop's palette.
 *
 * This module is the whole public surface. One control per file behind it, so adding
 * a thirteenth does not mean opening the other twelve.
 */

export type {
	ButtonHandle,
	ButtonVariant,
	ControlHandle,
	ControlOption,
	FieldHandle,
	SliderHandle,
} from './types';

export { createButton, createIconButton } from './button';
export type {
	ButtonOptions,
	IconButtonHandle,
	IconButtonOptions,
} from './button';

export { createCheckbox } from './checkbox';
export type { CheckboxHandle, CheckboxOptions } from './checkbox';

export { createColourField } from './colour-field';
export type { ColourFieldOptions } from './colour-field';

export { floatingHost, positionFloating } from './floating';

export { createNumberField } from './number-field';
export type { NumberFieldOptions } from './number-field';

export { createSection } from './section';

export { createSegmented } from './segmented';
export type { SegmentedOptions } from './segmented';

export { createSelect } from './select';
export type { SelectHandle, SelectOptions } from './select';

export { createSlider } from './slider';
export type { SliderOptions } from './slider';

export { createSwatchGrid } from './swatch-grid';
export type { SwatchGridHandle, SwatchGridOptions } from './swatch-grid';

export { createTextField } from './text-field';
export type { TextFieldOptions } from './text-field';
