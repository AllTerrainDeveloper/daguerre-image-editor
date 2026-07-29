/**
 * Controls that adapt to the host.
 *
 * Inside Desktop Mode the shell registers a kit of `<wpd-*>` web components that
 * carry the desktop's theming, spacing and dark-mode handling. Using them makes
 * Daguerre look like it belongs. Outside Desktop Mode they do not exist, so every
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
 */

import { hasComponent, pickComponent } from '../platform';

/** Handle on a built control. */
export interface SliderHandle {
	/** Row element to insert. */
	el: HTMLElement;
	/** Updates the displayed value without firing `onInput`. */
	setValue: ( value: number ) => void;
	/** Releases listeners. */
	destroy: () => void;
}

export interface SliderOptions {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	/** Appended to the numeric readout, e.g. a degree sign. */
	suffix?: string;
	/** Value the reset control returns to. */
	resetTo: number;
	/** Fires continuously while dragging. */
	onInput: ( value: number ) => void;
	/** Fires once when a drag finishes, for history bookkeeping. */
	onCommit?: () => void;
}

/**
 * Builds a labelled slider with a numeric readout and a reset affordance.
 *
 * @param options Slider configuration.
 */
export function createSlider( options: SliderOptions ): SliderHandle {
	const row = document.createElement( 'div' );
	row.className = 'dg-adjust';

	const handle = hasComponent( 'wpd-range-field' )
		? createWpdSlider( options )
		: createNativeSlider( options );

	row.appendChild( handle.el );

	const reset = createButton( {
		label: '↺',
		title: `Reset ${ options.label }`,
		variant: 'ghost',
		onClick: () => {
			handle.setValue( options.resetTo );
			options.onInput( options.resetTo );
			options.onCommit?.();
		},
	} );

	reset.el.classList.add( 'dg-adjust__reset' );
	row.appendChild( reset.el );

	return {
		el: row,
		setValue: handle.setValue,
		destroy: () => {
			handle.destroy();
			reset.destroy();
		},
	};
}

/**
 * Slider backed by Desktop Mode's `<wpd-range-field>`.
 *
 * @param options Slider configuration.
 */
function createWpdSlider( options: SliderOptions ): SliderHandle {
	const field = document.createElement( 'wpd-range-field' );

	field.setAttribute( 'label', options.label );
	field.setAttribute( 'min', String( options.min ) );
	field.setAttribute( 'max', String( options.max ) );
	field.setAttribute( 'step', String( options.step ) );
	field.setAttribute( 'value', String( options.value ) );

	if ( options.suffix ) {
		field.setAttribute( 'suffix', options.suffix );
	}

	const onChange = ( event: Event ) => {
		const detail = ( event as CustomEvent< { value: number } > ).detail;

		if ( detail && typeof detail.value === 'number' ) {
			options.onInput( detail.value );
		}
	};

	// The component emits an already-parsed number, so there is nothing to coerce.
	field.addEventListener( 'wpd-range-change', onChange );

	// It has no "drag finished" event, so pointer release stands in for one.
	const onRelease = () => options.onCommit?.();
	field.addEventListener( 'pointerup', onRelease );
	field.addEventListener( 'keyup', onRelease );

	return {
		el: field,
		setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
		destroy: () => {
			field.removeEventListener( 'wpd-range-change', onChange );
			field.removeEventListener( 'pointerup', onRelease );
			field.removeEventListener( 'keyup', onRelease );
		},
	};
}

/**
 * Slider built from a native range input.
 *
 * @param options Slider configuration.
 */
function createNativeSlider( options: SliderOptions ): SliderHandle {
	const wrap = document.createElement( 'div' );
	wrap.className = 'dg-slider';

	const id = `dg-slider-${ Math.random().toString( 36 ).slice( 2, 9 ) }`;

	const label = document.createElement( 'label' );
	label.className = 'dg-slider__label';
	label.htmlFor = id;
	label.textContent = options.label;

	const readout = document.createElement( 'output' );
	readout.className = 'dg-slider__value';
	readout.htmlFor = id;

	const input = document.createElement( 'input' );
	input.type = 'range';
	input.id = id;
	input.className = 'dg-slider__input';
	input.min = String( options.min );
	input.max = String( options.max );
	input.step = String( options.step );
	input.value = String( options.value );

	const paint = ( value: number ) => {
		readout.textContent = `${ value }${ options.suffix ?? '' }`;
		// Lets CSS tint the filled portion of the track.
		const ratio = ( value - options.min ) / ( options.max - options.min || 1 );
		wrap.style.setProperty( '--dg-slider-fill', String( ratio ) );
		wrap.classList.toggle( 'is-modified', value !== options.resetTo );
	};

	paint( options.value );

	const onInput = () => {
		const value = Number( input.value );
		paint( value );
		options.onInput( value );
	};

	const onChange = () => options.onCommit?.();

	input.addEventListener( 'input', onInput );
	input.addEventListener( 'change', onChange );

	const head = document.createElement( 'div' );
	head.className = 'dg-slider__head';
	head.append( label, readout );
	wrap.append( head, input );

	return {
		el: wrap,
		setValue: ( value ) => {
			input.value = String( value );
			paint( value );
		},
		destroy: () => {
			input.removeEventListener( 'input', onInput );
			input.removeEventListener( 'change', onChange );
		},
	};
}

/** Handle on a built button. */
export interface ButtonHandle {
	el: HTMLElement;
	setDisabled: ( disabled: boolean ) => void;
	setPressed: ( pressed: boolean ) => void;
	destroy: () => void;
}

export interface ButtonOptions {
	label: string;
	title?: string;
	variant?: 'primary' | 'secondary' | 'ghost';
	onClick: () => void;
}

/**
 * Builds a button, preferring `<wpd-button>` when the shell has registered it.
 *
 * @param options Button configuration.
 */
export function createButton( options: ButtonOptions ): ButtonHandle {
	const useWpd = hasComponent( 'wpd-button' );
	const el = document.createElement( useWpd ? 'wpd-button' : 'button' );

	el.classList.add( 'dg-button' );
	el.textContent = options.label;

	if ( options.title ) {
		el.setAttribute( 'title', options.title );
		el.setAttribute( 'aria-label', options.title );
	}

	if ( useWpd ) {
		el.setAttribute( 'variant', options.variant ?? 'ghost' );
	} else {
		( el as HTMLButtonElement ).type = 'button';
		el.classList.add( `dg-button--${ options.variant ?? 'ghost' }` );
	}

	el.addEventListener( 'click', options.onClick );

	return {
		el,
		setDisabled: ( disabled ) => {
			el.toggleAttribute( 'disabled', disabled );
			el.classList.toggle( 'is-disabled', disabled );
			// wpd-button reflects `disabled`, but a bare custom element still needs
			// removing from the tab order for keyboard users.
			if ( useWpd ) {
				el.setAttribute( 'aria-disabled', String( disabled ) );
			}
		},
		setPressed: ( pressed ) => {
			el.classList.toggle( 'is-pressed', pressed );
			el.setAttribute( 'aria-pressed', String( pressed ) );
		},
		destroy: () => el.removeEventListener( 'click', options.onClick ),
	};
}

/** Handle on a built select. */
export interface SelectHandle {
	el: HTMLElement;
	getValue: () => string;
	destroy: () => void;
}

export interface SelectOptions {
	label: string;
	value: string;
	options: Array< { value: string; label: string } >;
	onChange: ( value: string ) => void;
}

/**
 * Builds a labelled dropdown.
 *
 * `<wpd-select>` is not in the shell's eagerly registered set, so this usually
 * falls back to a native `<select>` -- which is no loss: a native select gets the
 * platform's own picker, which on touch devices is considerably better than
 * anything a web component reimplements.
 *
 * @param options Select configuration.
 */
export function createSelect( options: SelectOptions ): SelectHandle {
	const useWpd = hasComponent( 'wpd-select' );

	const wrap = document.createElement( 'div' );
	wrap.className = 'dg-field';

	const id = `dg-select-${ Math.random().toString( 36 ).slice( 2, 9 ) }`;

	const label = document.createElement( 'label' );
	label.className = 'dg-field__label';
	label.htmlFor = id;
	label.textContent = options.label;

	const select = document.createElement( useWpd ? 'wpd-select' : 'select' );
	select.id = id;
	select.className = 'dg-field__control';

	for ( const option of options.options ) {
		const node = document.createElement( useWpd ? 'wpd-option' : 'option' );
		node.setAttribute( 'value', option.value );
		node.textContent = option.label;
		select.appendChild( node );
	}

	if ( useWpd ) {
		select.setAttribute( 'value', options.value );
	} else {
		( select as HTMLSelectElement ).value = options.value;
	}

	const read = () =>
		useWpd
			? select.getAttribute( 'value' ) ?? options.value
			: ( select as HTMLSelectElement ).value;

	const onChange = () => options.onChange( read() );

	select.addEventListener( 'change', onChange );
	select.addEventListener( 'wpd-change', onChange );

	wrap.append( label, select );

	return {
		el: wrap,
		getValue: read,
		destroy: () => {
			select.removeEventListener( 'change', onChange );
			select.removeEventListener( 'wpd-change', onChange );
		},
	};
}

/** Handle on a value control. */
export interface FieldHandle {
	el: HTMLElement;
	setValue: ( value: string | number ) => void;
	destroy: () => void;
}

export interface NumberFieldOptions {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	onChange: ( value: number ) => void;
}

/**
 * Builds a compact numeric field.
 *
 * Three tiers, best first. `<wpd-number-field>` clamps on commit and emits an
 * already-parsed number. When it is absent -- which is the common case, since the
 * shell only registers it once a bundle importing it loads -- `<wpd-text-field>` in
 * numeric mode is used instead: still the shell's own control, still the shell's own
 * styling, and only the parsing has to be done here. A bare `<input type="number">` is
 * the last resort, for a page with no Desktop Mode at all.
 *
 * @param options Field configuration.
 */
export function createNumberField( options: NumberFieldOptions ): FieldHandle {
	const tag = pickComponent( [ 'wpd-number-field', 'wpd-text-field' ] );

	if ( tag ) {
		const numeric = tag === 'wpd-number-field';
		const field = document.createElement( tag );

		field.setAttribute( 'label', options.label );
		field.setAttribute( 'value', String( Math.round( options.value ) ) );
		field.classList.add( 'dg-field--compact' );

		if ( numeric ) {
			field.setAttribute( 'min', String( options.min ) );
			field.setAttribute( 'max', String( options.max ) );
			field.setAttribute( 'step', String( options.step ?? 1 ) );
		} else {
			// wpd-text-field passes `type` through to its inner input, so the browser
			// still gives spinners and a numeric keypad; the clamping is ours.
			field.setAttribute( 'type', 'number' );
		}

		if ( options.suffix ) {
			field.setAttribute( 'suffix', options.suffix );
		}

		const onChange = ( event: Event ) => {
			const detail = ( event as CustomEvent< { value: number | string } > ).detail;

			if ( ! detail ) {
				return;
			}

			const next = Number( detail.value );

			if ( ! Number.isFinite( next ) ) {
				return;
			}

			// wpd-number-field has already clamped; a text field has not.
			options.onChange(
				numeric
					? next
					: Math.min( options.max, Math.max( options.min, next ) )
			);
		};

		field.addEventListener( 'wpd-input-change', onChange );
		field.addEventListener( 'wpd-input-commit', onChange );

		return {
			el: field,
			setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
			destroy: () => {
				field.removeEventListener( 'wpd-input-change', onChange );
				field.removeEventListener( 'wpd-input-commit', onChange );
			},
		};
	}

	const wrap = document.createElement( 'label' );
	wrap.className = 'dg-field dg-field--compact';

	const text = document.createElement( 'span' );
	text.className = 'dg-field__label';
	text.textContent = options.label;

	const input = document.createElement( 'input' );
	input.type = 'number';
	input.className = 'dg-field__control';
	input.value = String( Math.round( options.value ) );
	input.min = String( options.min );
	input.max = String( options.max );
	input.step = String( options.step ?? 1 );

	const onInput = () => {
		const next = Number( input.value );

		if ( Number.isFinite( next ) ) {
			options.onChange( Math.min( options.max, Math.max( options.min, next ) ) );
		}
	};

	input.addEventListener( 'input', onInput );
	wrap.append( text, input );

	return {
		el: wrap,
		setValue: ( value ) => {
			input.value = String( value );
		},
		destroy: () => input.removeEventListener( 'input', onInput ),
	};
}

export interface ColourFieldOptions {
	label: string;
	value: string;
	onChange: ( value: string ) => void;
}

/**
 * Builds a colour swatch.
 *
 * @param options Field configuration.
 */
export function createColourField( options: ColourFieldOptions ): FieldHandle {
	if ( hasComponent( 'wpd-color-field' ) ) {
		const field = document.createElement( 'wpd-color-field' );

		field.setAttribute( 'label', options.label );
		field.setAttribute( 'value', options.value );

		const onChange = ( event: Event ) => {
			const detail = ( event as CustomEvent< { value: string } > ).detail;

			if ( detail?.value ) {
				options.onChange( detail.value );
			}
		};

		field.addEventListener( 'wpd-color-change', onChange );

		return {
			el: field,
			setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
			destroy: () => field.removeEventListener( 'wpd-color-change', onChange ),
		};
	}

	const wrap = document.createElement( 'label' );
	wrap.className = 'dg-field dg-field--compact';

	const text = document.createElement( 'span' );
	text.className = 'dg-field__label';
	text.textContent = options.label;

	const input = document.createElement( 'input' );
	input.type = 'color';
	input.className = 'dg-field__control dg-colour';
	input.value = options.value;

	const onInput = () => options.onChange( input.value );

	input.addEventListener( 'input', onInput );
	wrap.append( text, input );

	return {
		el: wrap,
		setValue: ( value ) => {
			input.value = String( value );
		},
		destroy: () => input.removeEventListener( 'input', onInput ),
	};
}

export interface SegmentedOptions {
	label: string;
	value: string;
	options: Array< { value: string; label: string } >;
	onChange: ( value: string ) => void;
}

/**
 * Builds a segmented picker, falling back to radio-styled buttons.
 *
 * Used where the choices are few and worth seeing at once -- a shape picker reads
 * far better as pills than as a dropdown you have to open to know what is selected.
 *
 * @param options Picker configuration.
 */
export function createSegmented( options: SegmentedOptions ): FieldHandle {
	const wrap = document.createElement( 'div' );
	wrap.className = 'dg-field dg-field--compact';

	const text = document.createElement( 'span' );
	text.className = 'dg-field__label';
	text.textContent = options.label;

	if ( hasComponent( 'wpd-segmented' ) ) {
		const group = document.createElement( 'wpd-segmented' );

		group.setAttribute( 'value', options.value );
		group.setAttribute( 'label', options.label );

		for ( const option of options.options ) {
			const segment = document.createElement( 'wpd-segment' );

			segment.setAttribute( 'value', option.value );
			segment.textContent = option.label;
			group.appendChild( segment );
		}

		const onPick = ( event: Event ) => {
			const detail = ( event as CustomEvent< { value: string } > ).detail;

			if ( detail?.value ) {
				options.onChange( detail.value );
			}
		};

		group.addEventListener( 'wpd-pick', onPick );
		wrap.append( text, group );

		return {
			el: wrap,
			setValue: ( value ) => group.setAttribute( 'value', String( value ) ),
			destroy: () => group.removeEventListener( 'wpd-pick', onPick ),
		};
	}

	const group = document.createElement( 'div' );
	group.className = 'dg-segmented';
	group.setAttribute( 'role', 'radiogroup' );
	group.setAttribute( 'aria-label', options.label );

	const buttons: HTMLButtonElement[] = [];
	let current = options.value;

	const paint = () => {
		for ( const button of buttons ) {
			const on = button.dataset.value === current;

			button.classList.toggle( 'is-active', on );
			button.setAttribute( 'aria-checked', String( on ) );
		}
	};

	for ( const option of options.options ) {
		const button = document.createElement( 'button' );

		button.type = 'button';
		button.className = 'dg-segmented__item';
		button.dataset.value = option.value;
		button.textContent = option.label;
		button.setAttribute( 'role', 'radio' );
		button.addEventListener( 'click', () => {
			current = option.value;
			paint();
			options.onChange( option.value );
		} );

		buttons.push( button );
		group.appendChild( button );
	}

	paint();
	wrap.append( text, group );

	return {
		el: wrap,
		setValue: ( value ) => {
			current = String( value );
			paint();
		},
		destroy: () => {},
	};
}

export interface TextFieldOptions {
	label: string;
	value: string;
	placeholder?: string;
	onChange: ( value: string ) => void;
	/** Fires on Enter or blur, for actions that should not run per keystroke. */
	onCommit?: ( value: string ) => void;
}

/**
 * Builds a labelled text input.
 *
 * @param options Field configuration.
 */
export function createTextField( options: TextFieldOptions ): FieldHandle {
	if ( hasComponent( 'wpd-text-field' ) ) {
		const field = document.createElement( 'wpd-text-field' );

		field.setAttribute( 'label', options.label );
		field.setAttribute( 'value', options.value );

		if ( options.placeholder ) {
			field.setAttribute( 'placeholder', options.placeholder );
		}

		const read = ( event: Event ) =>
			( event as CustomEvent< { value: string } > ).detail?.value ?? '';

		const onChange = ( event: Event ) => options.onChange( read( event ) );
		const onCommit = ( event: Event ) => options.onCommit?.( read( event ) );

		field.addEventListener( 'wpd-input-change', onChange );
		field.addEventListener( 'wpd-input-commit', onCommit );
		field.addEventListener( 'wpd-submit', onCommit );

		return {
			el: field,
			setValue: ( value ) => field.setAttribute( 'value', String( value ) ),
			destroy: () => {
				field.removeEventListener( 'wpd-input-change', onChange );
				field.removeEventListener( 'wpd-input-commit', onCommit );
				field.removeEventListener( 'wpd-submit', onCommit );
			},
		};
	}

	const wrap = document.createElement( 'label' );
	wrap.className = 'dg-field';

	const text = document.createElement( 'span' );
	text.className = 'dg-field__label';
	text.textContent = options.label;

	const input = document.createElement( 'input' );
	input.type = 'text';
	input.className = 'dg-field__control';
	input.value = options.value;

	if ( options.placeholder ) {
		input.placeholder = options.placeholder;
	}

	const onInput = () => options.onChange( input.value );
	const onCommit = () => options.onCommit?.( input.value );

	input.addEventListener( 'input', onInput );
	input.addEventListener( 'change', onCommit );
	input.addEventListener( 'keydown', ( event ) => {
		if ( event.key === 'Enter' ) {
			onCommit();
		}
	} );

	wrap.append( text, input );

	return {
		el: wrap,
		setValue: ( value ) => {
			input.value = String( value );
		},
		destroy: () => {
			input.removeEventListener( 'input', onInput );
			input.removeEventListener( 'change', onCommit );
		},
	};
}

export interface CheckboxOptions {
	label: string;
	checked: boolean;
	title?: string;
	onChange: ( checked: boolean ) => void;
}

/** Handle on a checkbox. */
export interface CheckboxHandle {
	el: HTMLElement;
	setChecked: ( checked: boolean ) => void;
	destroy: () => void;
}

/**
 * Builds a checkbox with an inline label.
 *
 * @param options Checkbox configuration.
 */
export function createCheckbox( options: CheckboxOptions ): CheckboxHandle {
	if ( hasComponent( 'wpd-checkbox-label' ) ) {
		const field = document.createElement( 'wpd-checkbox-label' );

		field.setAttribute( 'label', options.label );
		field.toggleAttribute( 'checked', options.checked );

		if ( options.title ) {
			field.setAttribute( 'title', options.title );
		}

		const onChange = ( event: Event ) => {
			const detail = ( event as CustomEvent< { checked: boolean } > ).detail;

			options.onChange( detail?.checked === true );
		};

		field.addEventListener( 'wpd-checkbox-change', onChange );

		return {
			el: field,
			setChecked: ( checked ) => field.toggleAttribute( 'checked', checked ),
			destroy: () => field.removeEventListener( 'wpd-checkbox-change', onChange ),
		};
	}

	const wrap = document.createElement( 'label' );
	wrap.className = 'dg-check';

	if ( options.title ) {
		wrap.title = options.title;
	}

	const box = document.createElement( 'input' );
	box.type = 'checkbox';
	box.checked = options.checked;

	const onChange = () => options.onChange( box.checked );

	box.addEventListener( 'change', onChange );
	wrap.append( box, document.createTextNode( options.label ) );

	return {
		el: wrap,
		setChecked: ( checked ) => {
			box.checked = checked;
		},
		destroy: () => box.removeEventListener( 'change', onChange ),
	};
}

/**
 * Builds a titled section, preferring `<wpd-section>`.
 *
 * @param heading Section title.
 */
export function createSection( heading: string ): HTMLElement {
	if ( hasComponent( 'wpd-section' ) ) {
		const section = document.createElement( 'wpd-section' );
		section.setAttribute( 'heading', heading );
		section.setAttribute( 'stack', '' );
		section.classList.add( 'dg-section' );

		return section;
	}

	const section = document.createElement( 'section' );
	section.className = 'dg-section';

	const title = document.createElement( 'h3' );
	title.className = 'dg-section__heading';
	title.textContent = heading;
	section.appendChild( title );

	return section;
}

/** Handle on an icon button. */
export interface IconButtonHandle extends ButtonHandle {
	/** Replaces the glyph, for a button that toggles between two states. */
	setGlyph: ( glyph: string ) => void;
}

export interface IconButtonOptions {
	/** The glyph shown. */
	glyph: string;
	/** Accessible name, and the tooltip. */
	label: string;
	/** Extra class for sizing and placement. */
	className?: string;
	variant?: 'primary' | 'secondary' | 'ghost';
	onClick: () => void;
}

/**
 * Builds an icon-only button.
 *
 * Its own factory rather than a flag on `createButton()` because the two differ in
 * more than presentation: an icon button has no visible text, so the accessible name
 * has to come from an attribute, and every caller getting that wrong once is exactly
 * how a toolbar ends up unusable with a screen reader.
 *
 * @param options Button configuration.
 */
export function createIconButton( options: IconButtonOptions ): IconButtonHandle {
	const useWpd = hasComponent( 'wpd-button' );
	const el = document.createElement( useWpd ? 'wpd-button' : 'button' );

	el.classList.add( 'dg-icon-button' );

	if ( options.className ) {
		el.classList.add( options.className );
	}

	el.textContent = options.glyph;
	el.setAttribute( 'title', options.label );
	el.setAttribute( 'aria-label', options.label );

	if ( useWpd ) {
		el.setAttribute( 'variant', options.variant ?? 'ghost' );
		el.setAttribute( 'icon-only', '' );
	} else {
		( el as HTMLButtonElement ).type = 'button';
		el.classList.add( `dg-button--${ options.variant ?? 'ghost' }` );
	}

	el.addEventListener( 'click', options.onClick );

	return {
		el,
		setGlyph: ( glyph ) => {
			el.textContent = glyph;
		},
		setDisabled: ( disabled ) => {
			el.toggleAttribute( 'disabled', disabled );
			el.classList.toggle( 'is-disabled', disabled );

			if ( useWpd ) {
				el.setAttribute( 'aria-disabled', String( disabled ) );
			}
		},
		setPressed: ( pressed ) => {
			el.classList.toggle( 'is-active', pressed );
			el.setAttribute( 'aria-pressed', String( pressed ) );
		},
		destroy: () => el.removeEventListener( 'click', options.onClick ),
	};
}

/** Handle on a grid of colour swatches. */
export interface SwatchGridHandle {
	el: HTMLElement;
	/** Marks one swatch as chosen. */
	setValue: ( value: string ) => void;
	destroy: () => void;
}

export interface SwatchGridOptions {
	/** Accessible name for the group. */
	label: string;
	/** Colours offered, as CSS hex. */
	colours: string[];
	/** Which one is currently chosen, if any. */
	value?: string;
	onChange: ( value: string ) => void;
}

/**
 * Builds a palette of colour swatches.
 *
 * Prefers Desktop Mode's `<wpd-swatch-grid>` and `<wpd-swatch>`, which is exactly the
 * kind of control worth borrowing rather than restyling: the shell already knows how a
 * chosen swatch should look against its own palette.
 *
 * @param options Palette configuration.
 */
export function createSwatchGrid( options: SwatchGridOptions ): SwatchGridHandle {
	const useWpd = hasComponent( 'wpd-swatch-grid' ) && hasComponent( 'wpd-swatch' );
	const el = document.createElement( useWpd ? 'wpd-swatch-grid' : 'div' );
	const listeners: Array< () => void > = [];

	el.classList.add( 'dg-palette' );
	el.setAttribute( 'aria-label', options.label );

	if ( ! useWpd ) {
		el.setAttribute( 'role', 'group' );
	}

	const chips = new Map< string, HTMLElement >();

	for ( const colour of options.colours ) {
		const chip = document.createElement( useWpd ? 'wpd-swatch' : 'button' );

		chip.classList.add( 'dg-palette__chip' );
		chip.setAttribute( 'title', colour );
		chip.setAttribute( 'aria-label', colour );

		if ( useWpd ) {
			chip.setAttribute( 'value', colour );
			chip.setAttribute( 'preview', colour );
			chip.setAttribute( 'size', 'small' );
		} else {
			( chip as HTMLButtonElement ).type = 'button';
			chip.style.background = colour;
		}

		const onPick = () => options.onChange( colour );

		// wpd-swatch announces its own event; a bare button only has click.
		const event = useWpd ? 'wpd-pick' : 'click';

		chip.addEventListener( event, onPick );
		listeners.push( () => chip.removeEventListener( event, onPick ) );

		chips.set( colour, chip );
		el.appendChild( chip );
	}

	const setValue = ( value: string ) => {
		for ( const [ colour, chip ] of chips ) {
			const on = colour.toLowerCase() === value.toLowerCase();

			chip.toggleAttribute( 'selected', on );
			chip.classList.toggle( 'is-selected', on );
		}
	};

	if ( options.value ) {
		setValue( options.value );
	}

	return {
		el,
		setValue,
		destroy: () => {
			for ( const off of listeners ) {
				off();
			}
		},
	};
}

/**
 * Where a floating element should be attached.
 *
 * The nearest editor root, not the body. The body escapes the clipping but also
 * escapes the palette: every colour in this stylesheet is a custom property declared
 * on `.dg-editor`, so a popover parented to the body inherits none of them and renders
 * as transparent text over the canvas. Staying inside the editor keeps the variables
 * and still clears the tool rail's own scroll container.
 *
 * @param anchor Element the popover belongs to.
 */
export function floatingHost( anchor: HTMLElement ): HTMLElement {
	return anchor.closest( '.dg-editor' ) ?? document.body;
}

/**
 * Positions a floating element next to an anchor, using fixed coordinates.
 *
 * Absolute positioning is the obvious choice and the wrong one here: the tool rail
 * scrolls, and a scroll container clips absolutely positioned descendants that reach
 * outside it. A popover anchored that way is in the DOM, has a size, passes every
 * query -- and is invisible. Fixed positioning is measured against the viewport, so
 * nothing between the element and the screen can clip it.
 *
 * The element must be appended somewhere before this is called, so it has a box to
 * measure.
 *
 * @param el        Floating element.
 * @param anchor    Element to sit beside.
 * @param placement Which side to prefer.
 */
export function positionFloating(
	el: HTMLElement,
	anchor: HTMLElement,
	placement: 'inline-end' | 'block-end' = 'inline-end'
): void {
	const from = anchor.getBoundingClientRect();

	el.style.position = 'fixed';
	el.style.insetInlineStart = 'auto';
	el.style.insetBlockStart = 'auto';

	const box = el.getBoundingClientRect();
	const gap = 6;

	let left =
		placement === 'inline-end' ? from.right + gap : from.left;
	let top = placement === 'inline-end' ? from.top : from.bottom + gap;

	// Nudge back on screen rather than letting a popover hang off the edge.
	left = Math.max( gap, Math.min( left, window.innerWidth - box.width - gap ) );
	top = Math.max( gap, Math.min( top, window.innerHeight - box.height - gap ) );

	el.style.left = `${ Math.round( left ) }px`;
	el.style.top = `${ Math.round( top ) }px`;
}
