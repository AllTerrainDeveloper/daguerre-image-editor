/**
 * Wiring the stage.
 *
 * The editor's assembly code: it knows both sides -- the editor's collaborators and
 * every stage widget's option bag -- and exists so that neither of them has to. Split
 * from the editor itself because connecting six widgets to one model is a long list of
 * one-line answers, and a long list of one-line answers reads better on its own.
 */

import { dabRegion } from '../model/pixel-history';
import { StageToolset } from './stage-toolset';
import { SelectionOverlay } from './selection-overlay';
import { panelContext } from './adapters';
import { EditorClipboard } from './clipboard';
import type { ClipboardPixels } from './clipboard';
import { paintTarget } from './paint-target';
import type { Editor } from './editor';

/**
 * Builds the marquee and the clipboard that reads from it.
 *
 * They arrive together because a clipboard with no selection to copy is not useful,
 * and a selection nothing can copy is only half a feature.
 *
 * @param editor The editor.
 */
function wireSelection( editor: Editor ): SelectionOverlay {
	const overlay = new SelectionOverlay( {
		stage: editor.shell.stage,
		getViewport: () => editor.renderer?.view.viewport() ?? null,
		getCanvas: () => editor.store.current.canvas,
		setMask: ( mask ) => editor.renderer?.paint.setPaintMask( mask ),
		onChange: () => editor.stage?.optionsBar.render(),
	} );

	editor.selection = overlay;
	editor.clipboard = new EditorClipboard( {
		store: editor.store,
		getPixels: () => clipboardPixels( editor ),
		getSelection: () => overlay.current,
		onPaste: () => editor.state.setTool( 'transform' ),
	} );

	return overlay;
}

/**
 * Builds every stage widget and connects it to the editor.
 *
 * @param editor The editor.
 * @return The assembled toolset.
 */
export function buildStageToolset( editor: Editor ): StageToolset {
	const renderer = editor.renderer!;
	const { state, store, shell } = editor;
	const selection = wireSelection( editor );
	const ctx = panelContext( editor );

	// Several option callbacks reach back into the toolset -- the options bar re-renders
	// when a stage tool changes state, and the stage tools ask the options bar to. The
	// annotation is what lets those close over a binding they are also part of building.
	const toolset: StageToolset = new StageToolset( {
		frame: {
			stage: shell.stage,
			getViewport: () => renderer.view.viewport(),
			getCanvas: () => store.current.canvas,
			getTool: () => state.getTool(),
			getBrush: () => state.getBrush(),
		},
		body: shell.root.querySelector( '.lz-body' ) ?? shell.root,
		topbar: shell.topbar,
		rail: {
			getActive: () => state.getTool(),
			onSelect: ( tool ) => state.setTool( tool ),
			getColours: () => ( {
				colour: state.getBrush().colour,
				background: state.getBrush().background,
			} ),
			setColours: ( patch ) => state.setBrush( patch ),
			onColoursChange: ( listener ) => state.brushes.add( () => listener() ),
			getQuickMask: () => state.getQuickMask(),
			setQuickMask: ( on ) => state.setQuickMask( on ),
			getFullScreen: () => state.getFullScreen(),
			setFullScreen: ( on ) => state.setFullScreen( on ),
		},
		optionsBar: {
			ctx,
			getSelectionShape: () => editor.selectionShape,
			setSelectionShape: ( shape ) => {
				editor.selectionShape = shape;
				toolset.tools.clearPath();
				selection.set( null );
			},
			hasSelection: () => selection.isActive,
			deselect: () => {
				toolset.tools.clearPath();
				selection.set( null );
			},
			selectAll: () => selection.selectAll(),
			hasCloneSource: () => !! toolset.tools.getCloneSource(),
			clearCloneSource: () => toolset.tools.clearCloneSource(),
			isTypingText: () => true === toolset.text.isEditing,
			setZoom: ( mode ) => {
				if ( 'fit' === mode ) {
					renderer.view.reset();
				} else {
					renderer.view.zoomToActual();
				}
			},
		},
		tools: {
			setBrush: ( patch ) => state.setBrush( patch ),
			getTargetLayerId: () => paintTarget( store, renderer.paint ),
			stamp: ( id, image, x, y, size, colour, opacity, erase ) => {
				editor.strokes?.capture( id, dabRegion( x, y, size ) );
				renderer.paint.stampBrush( id, image, x, y, size, colour, opacity, erase );
			},
			fillMask: ( id, mask, colour, opacity ) => {
				// A flood fill can reach anywhere, so it offers the whole canvas and
				// lets the collector decide whether that is affordable.
				const canvas = store.current.canvas;

				editor.strokes?.capture( id, {
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
				} );
				renderer.paint.fillWithMask( id, mask, colour, opacity );
			},
			composite: ( id, source, x, y, opacity ) => {
				editor.strokes?.capture( id, {
					x,
					y,
					width: source.width,
					height: source.height,
				} );
				renderer.paint.compositeCanvas( id, source, x, y, opacity );
			},
			readDocument: () => renderer.pixels.readPixels(),
			readPristine: () => renderer.readPristinePixels(),
			getSelectionShape: () => editor.selectionShape,
			setSelection: ( next ) => selection.set( next ),
			pan: ( dx, dy ) => renderer.view.pan( dx, dy ),
			zoomAt: ( factor, x, y ) => renderer.view.zoomAt( factor, x, y ),
			onToolStateChange: () => toolset.optionsBar.render(),
			// `place()` rather than `open()`: a press that finishes one piece of text
			// does not also begin the next one.
			onPlaceText: ( point ) => toolset.text.place( point ),
			// One history entry per stroke, not per dab -- and it carries the tiles the
			// stroke overwrote, so undoing it puts the pixels back rather than
			// restoring an identical recipe and appearing to do nothing.
			onStrokeEnd: () => void editor.strokes?.commit(),
		},
		text: {
			getStyle: () => {
				const brush = state.getBrush();

				return {
					size: brush.fontSize,
					family: brush.fontFamily,
					colour: brush.colour,
					bold: brush.bold,
					italic: brush.italic,
				};
			},
			onCommit: ( text, point ) => {
				if ( ! editor.drawText( text, point ) ) {
					return;
				}

				// The text arrives as a layer of its own, and what everyone does next is
				// move it -- so hand the stage to transform, the same way a paste does.
				state.setTool( 'transform' );
			},
			onStateChange: () => toolset.optionsBar.render(),
		},
	} );

	toolset.setRulersVisible( state.getView().rulers );
	shell.stage.classList.toggle( 'has-rulers', state.getView().rulers );

	// Redrawn on zoom and on any brush change, so the ring resizes under a stationary
	// pointer rather than waiting for the next movement.
	editor.onTeardown(
		renderer.view.onChange( toolset.redraw ),
		renderer.view.onChange( selection.sync ),
		state.brushes.add( toolset.cursor.draw ),
		state.brushes.add( toolset.text.restyle ),
		state.tools.add( toolset.cursor.draw )
	);

	return toolset;
}

/**
 * The two halves of the clipboard's needs, in one object.
 *
 * Copying reads the composed document; pasting writes a layer texture. They live on
 * different parts of the engine, so this is where the two are put back together.
 *
 * @param editor The editor.
 */
function clipboardPixels( editor: Editor ): ClipboardPixels | null {
	const renderer = editor.renderer;

	if ( ! renderer ) {
		return null;
	}

	return {
		extractRegion: ( x, y, width, height ) =>
			renderer.pixels.extractRegion( x, y, width, height ),
		addRasterTexture: ( id, source ) =>
			renderer.paint.addRasterTexture( id, source ),
	};
}
