/**
 * A document with an undo stack and subscribers.
 *
 * Generic on purpose. Nothing here knows what a recipe is -- it is the mechanics that
 * any undoable document needs: a current state, a way to move through history, a
 * per-entry slot for whatever the entry could not describe on its own, and a listener
 * list that is told which part of the state moved.
 *
 * Subscribers are told the *scope* of a change rather than just that one happened. A
 * consumer with several expensive update paths -- the renderer has three -- can then
 * run only the one that was invalidated, which is the difference between a smooth
 * slider drag and a stuttering one.
 */

import { History } from '../model/history';
import { Subscribers } from './subscribers';

/**
 * The undoable document behind an editor.
 */
export class UndoableStore< State, Scope extends string, Meta = unknown > {
	private history: History< State >;

	private listeners = new Subscribers< [ State, Scope ] >();

	/**
	 * @param initial Starting state.
	 */
	constructor( initial: State ) {
		this.history = new History( initial );
	}

	/**
	 * Starts a fresh document.
	 *
	 * Replaces the history outright rather than pushing onto it: the previous
	 * document's undo stack has nothing to do with this one.
	 *
	 * @param initial New starting state.
	 */
	reload( initial: State ): void {
		this.history = new History( initial );
	}

	/** The state as it currently stands. */
	get current(): State {
		return this.history.current;
	}

	/** Every state on the undo stack, including the current one. */
	get states(): State[] {
		return this.history.states;
	}

	get canUndo(): boolean {
		return this.history.canUndo;
	}

	get canRedo(): boolean {
		return this.history.canRedo;
	}

	/** Whatever the current entry carries alongside its state. */
	get meta(): Meta | undefined {
		return this.history.meta as Meta | undefined;
	}

	/**
	 * Replaces the current entry's payload.
	 *
	 * @param meta New payload.
	 */
	setMeta( meta: Meta ): void {
		this.history.setMeta( meta );
	}

	/**
	 * Subscribes to changes.
	 *
	 * @param listener Called after every mutation, with what it invalidated.
	 * @return Unsubscribe function.
	 */
	subscribe( listener: ( state: State, scope: Scope ) => void ): () => void {
		return this.listeners.add( listener );
	}

	/**
	 * Writes a state without creating an undo entry.
	 *
	 * For corrections rather than edits -- filling in a canvas size the stored recipe
	 * never had, say. Nothing a user did, so nothing to undo.
	 *
	 * @param state New state.
	 * @param scope What it invalidated.
	 */
	replace( state: State, scope: Scope ): void {
		this.history.replace( state );
		this.announce( scope );
	}

	/**
	 * Pushes a state as a new undo entry.
	 *
	 * @param state New state.
	 * @param label History label. Adjacent pushes sharing one coalesce into a single
	 *              entry, which is what turns a whole slider drag into one undo.
	 * @param scope What it invalidated.
	 * @param meta  Optional. Payload for the entry.
	 */
	push( state: State, label: string, scope: Scope, meta?: Meta ): void {
		this.history.push( state, label, meta );
		this.announce( scope );
	}

	/**
	 * Steps back one entry.
	 *
	 * @param scope What to report as invalidated.
	 * @return True when there was something to undo.
	 */
	undo( scope: Scope ): boolean {
		if ( ! this.history.canUndo ) {
			return false;
		}

		this.history.undo();
		this.announce( scope );

		return true;
	}

	/**
	 * Steps forward one entry.
	 *
	 * @param scope What to report as invalidated.
	 * @return True when there was something to redo.
	 */
	redo( scope: Scope ): boolean {
		if ( ! this.history.canRedo ) {
			return false;
		}

		this.history.redo();
		this.announce( scope );

		return true;
	}

	/**
	 * Tells every subscriber the state moved.
	 *
	 * @param scope What the change invalidated.
	 */
	protected announce( scope: Scope ): void {
		this.listeners.emit( this.history.current, scope );
	}
}
