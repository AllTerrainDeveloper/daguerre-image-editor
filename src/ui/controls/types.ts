/**
 * Handles the control factories hand back.
 *
 * Every factory returns a handle rather than a bare element, and every handle carries
 * `destroy()`. That is the whole contract: a panel that collected handles can tear
 * itself down without knowing what any of them built, which is what lets the panel host
 * release a panel it has never heard of.
 */

/** The least a control handle offers: an element, and a way to let go of it. */
export interface ControlHandle {
	/** Element to insert. */
	el: HTMLElement;
	/** Releases listeners. */
	destroy: () => void;
}

/** A control holding a value that the owner may also set. */
export interface FieldHandle extends ControlHandle {
	setValue: ( value: string | number ) => void;
}

/** A control whose value is numeric. */
export interface SliderHandle extends ControlHandle {
	/** Updates the displayed value without firing `onInput`. */
	setValue: ( value: number ) => void;
}

/** Handle on a built button. */
export interface ButtonHandle extends ControlHandle {
	setDisabled: ( disabled: boolean ) => void;
	setPressed: ( pressed: boolean ) => void;
}

/** Which of the shell's button styles a button wears. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** A choice offered by a select or a segmented picker. */
export interface ControlOption {
	value: string;
	label: string;
}
