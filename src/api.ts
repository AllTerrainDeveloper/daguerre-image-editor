/**
 * The public mount API.
 *
 * There are five places the editor has to appear: the full-screen admin page, the
 * media modal, the block editor, a Desktop Mode native window, and eventually
 * anything a third party builds. Rather than five implementations, there is one
 * mountable editor and five thin adapters that call `mount()`. Nothing outside this
 * module touches Pixi, the recipe model or REST.
 */

import { EditorRenderer } from './engine/renderer';
import { __, sprintf } from './i18n';
import { History } from './model/history';
import { TileCollector, dabRegion } from './model/pixel-history';
import type { PixelPatch, PixelRect, TilePatch } from './model/pixel-history';
import type { Curves, Levels } from './engine/lut';
import {
	createRasterLayer,
} from './model/document';
import type { CanvasSize, Layer, LayerTransform } from './model/document';
import {
	buildSelectionMask,
	isEmptySelection,
	selectionBounds,
	selectionToPath,
} from './model/selection';
import type { Selection, SelectionShape } from './model/selection';
import { OptionsBar } from './ui/options-bar';
import {
	defaultRecipe,
	isIdentity,
	resetOps,
	setCurve,
	setDocument,
	setLayer,
	setLayers,
	setLevels,
	setOp,
	validateRecipe,
} from './model/recipe';
import type { OpType, Recipe } from './model/recipe';
import { loadSourceImage } from './net/image-loader';
import type { LoadedImage } from './net/image-loader';
import { RestClient } from './net/rest';
import { isDesktopModeEnabled, toast } from './platform';
import type { DaguerreConfig, MediaPayload, Preset, SaveResult } from './types';
import { registerBuiltInPanels } from './ui/built-in-panels';
import { createButton } from './ui/controls';
import type { ButtonHandle } from './ui/controls';
import { StageTools, defaultBrush } from './ui/stage-tools';
import type { BrushSettings } from './ui/stage-tools';
import { BrushCursor } from './ui/brush-cursor';
import { Rulers } from './ui/rulers';
import { ToolRail } from './ui/tool-rail';
import { PanelHost } from './ui/panels';
import type { ActiveTool, PanelContext, ViewPrefs } from './ui/panels';

export interface MountOptions {
	/** Attachment to open. */
	attachmentId: number;
	/** Which surface is hosting the editor. Affects chrome only, never the engine. */
	host?: 'page' | 'modal' | 'window';
	/** Called when the user asks to leave. */
	onClose?: () => void;
	/** Called after a successful save, with the attachment that was created. */
	onSave?: ( result: SaveResult ) => void;
}

export interface EditorInstance {
	/** Releases the canvas, the GPU resources and every listener. */
	destroy: () => void;
	/** Renderer internals, for diagnosing render problems. */
	debug: () => Record< string, unknown >;
	/** The edit as it currently stands. */
	getRecipe: () => Recipe;
	/** Replaces the edit and re-renders. */
	setRecipe: ( recipe: Recipe ) => void;
}

/**
 * Mounts the editor into an element.
 *
 * Returns synchronously with a usable handle; loading happens in the background
 * behind a progress state. That matters because the media modal and Desktop Mode
 * both want to place the editor before they know how long the image will take.
 *
 * @param element Element to fill. Its contents are replaced.
 * @param options Mount options.
 */
export function mount( element: HTMLElement, options: MountOptions ): EditorInstance {
	const editor = new Editor( element, options );

	void editor.boot();

	return editor;
}

/**
 * Reads the configuration PHP localized onto the page.
 *
 * @throws {Error} When the bundle was loaded without its configuration.
 */
function readConfig(): DaguerreConfig {
	const config = ( window as unknown as { daguerreConfig?: DaguerreConfig } )
		.daguerreConfig;

	if ( ! config ) {
		throw new Error(
			'Daguerre configuration is missing. The editor script was loaded without daguerre_enqueue_editor().'
		);
	}

	return config;
}

/**
 * The editor.
 */
class Editor implements EditorInstance {
	private root: HTMLElement;

	private options: MountOptions;

	private config: DaguerreConfig;

	private client: RestClient;

	private payload: MediaPayload | null = null;

	private renderer: EditorRenderer | null = null;

	private loaded: LoadedImage | null = null;

	private history: History< Recipe >;

	private buttons: ButtonHandle[] = [];

	private panelHost: PanelHost | null = null;

	/** Notified whenever the recipe changes, so panels can follow the model. */
	private recipeListeners = new Set< ( recipe: Recipe ) => void >();

	/**
	 * Which tool owns the stage.
	 *
	 * Transform by default: an image you have just opened should be draggable
	 * immediately, without hunting for a panel to expand first.
	 */
	private activeTool: ActiveTool = 'transform';

	private toolListeners = new Set< ( tool: ActiveTool ) => void >();

	/**
	 * Shared by every drawing tool.
	 *
	 * One object rather than one per tool, because the settings overlap almost
	 * completely -- size, opacity and colour belong to nearly all of them -- and
	 * because the options bar and the sidebar panel are then two views of one model.
	 */
	private brush: BrushSettings = defaultBrush();

	private brushListeners = new Set< ( brush: BrushSettings ) => void >();

	/** Rulers and snapping. Presentation, so persisted locally rather than saved. */
	private view: ViewPrefs = readViewPrefs();

	private rulers: Rulers | null = null;

	/** The ring showing how big the brush actually is. */
	private brushCursor: BrushCursor | null = null;

	/** The marquee. */
	private selection: Selection | null = null;

	/** Which shape the marquee tool draws. */
	private selectionShape: SelectionShape = 'rect';

	/**
	 * Whether the selection is shown as a translucent red overlay.
	 *
	 * Marching ants tell you where an edge is; a quick mask tells you how soft it is,
	 * which an outline cannot show at all.
	 */
	private quickMask = false;

	/** Whether the editor has been expanded to fill the screen. */
	private fullScreen = false;

	private optionsBar: OptionsBar | null = null;

	/** Pixels lifted by the last copy. */
	private clipboard: HTMLCanvasElement | null = null;

	/**
	 * Tiles the stroke in progress has overwritten, so it can be undone.
	 *
	 * Collected as the stroke happens rather than snapshotted at either end: the region
	 * a stroke will cover is unknown when it starts, and by the time it finishes the
	 * old pixels are gone.
	 */
	private strokeTiles: TileCollector | null = null;

	/** The layer the stroke in progress is painting into. */
	private strokeLayer = '';

	private stageTools: StageTools | null = null;

	private toolRail: ToolRail | null = null;

	private selectionBox: HTMLElement | null = null;

	private stage!: HTMLElement;

	/** Shows where the canvas is, behind the rendered output. */
	private backdrop!: HTMLElement;

	/** The tab that restores a hidden sidebar. */
	private sidebarTab!: HTMLButtonElement;

	private sidebar!: HTMLElement;

	private status!: HTMLElement;

	private undoButton: ButtonHandle | null = null;

	private redoButton: ButtonHandle | null = null;

	private resetButton: ButtonHandle | null = null;

	private saveButton: ButtonHandle | null = null;

	private exportButton: ButtonHandle | null = null;

	/** True while a full-resolution render is in flight, to prevent a double save. */
	private busy = false;

	private destroyed = false;

	private detachKeys: Array< () => void > = [];

	constructor( element: HTMLElement, options: MountOptions ) {
		this.root = element;
		this.options = options;
		this.config = readConfig();
		this.client = new RestClient( this.config );
		this.history = new History( defaultRecipe( options.attachmentId ) );

		this.buildShell();
	}

	/** Renderer internals, for diagnosing render problems from the console. */
	debug(): Record< string, unknown > {
		return {
			renderer: this.renderer?.debugState() ?? null,
			activeTool: this.activeTool,
			selection: this.selection,
			hasClipboard: !! this.clipboard,
			recipeLayers: this.history.current.layers.map( ( l ) => ( {
				id: l.id,
				kind: l.kind,
			} ) ),
			activeLayerId: this.history.current.activeLayerId,
		};
	}

	/** Current edit. */
	getRecipe(): Recipe {
		return this.history.current;
	}

	/**
	 * Replaces the current edit.
	 *
	 * @param recipe New recipe.
	 */
	setRecipe( recipe: Recipe ): void {
		this.history.push( recipe, 'set-recipe' );
		this.syncFromRecipe();
	}

	/** Builds the static layout and the loading state. */
	private buildShell(): void {
		this.root.replaceChildren();
		this.root.classList.add( 'dg-editor' );
		this.root.classList.add( `dg-editor--${ this.options.host ?? 'page' }` );

		// Which house style the *fallback* controls wear. A component the shell has
		// registered brings its own styling; a native input does not, and inside a
		// chromeless iframe no component is registered at all -- so this is the only
		// thing keeping the editor from looking like two plugins glued together.
		this.root.classList.toggle( 'is-desktop-mode', isDesktopModeEnabled() );

		const topbar = document.createElement( 'div' );
		topbar.className = 'dg-topbar';
		topbar.setAttribute( 'role', 'toolbar' );
		topbar.setAttribute( 'aria-label', __( 'Editor actions' ) );

		const title = document.createElement( 'h1' );
		title.className = 'dg-topbar__title';
		title.textContent = __( 'Loading image…' );

		const actions = document.createElement( 'div' );
		actions.className = 'dg-topbar__actions';

		this.undoButton = createButton( {
			label: __( 'Undo' ),
			title: __( 'Undo (Ctrl+Z)' ),
			variant: 'ghost',
			onClick: () => this.undo(),
		} );

		this.redoButton = createButton( {
			label: __( 'Redo' ),
			title: __( 'Redo (Ctrl+Shift+Z)' ),
			variant: 'ghost',
			onClick: () => this.redo(),
		} );

		const compare = createButton( {
			label: __( 'Compare' ),
			title: __( 'Hold to see the original' ),
			variant: 'ghost',
			onClick: () => {},
		} );

		this.attachCompare( compare );

		this.resetButton = createButton( {
			label: __( 'Reset' ),
			title: __( 'Return every adjustment to zero' ),
			variant: 'secondary',
			onClick: () => this.resetAll(),
		} );

		const recenter = createButton( {
			label: '⊕',
			// Easy to scroll into empty pasteboard and lose the picture entirely;
			// this is the way back that does not require knowing the shortcut.
			title: __( 'Recentre the view (0)' ),
			variant: 'ghost',
			onClick: () => this.renderer?.resetView(),
		} );

		this.buttons.push( recenter );
		actions.appendChild( recenter.el );

		this.exportButton = createButton( {
			label: __( 'Export' ),
			title: __( 'Download the edited image to this device' ),
			variant: 'secondary',
			onClick: () => void this.exportToDevice(),
		} );

		this.saveButton = createButton( {
			label: __( 'Save a copy' ),
			title: __( 'Save as a new image, leaving the original untouched' ),
			variant: 'primary',
			onClick: () => void this.save(),
		} );

		this.buttons.push(
			this.undoButton,
			this.redoButton,
			compare,
			this.resetButton,
			this.exportButton,
			this.saveButton
		);

		actions.append(
			this.undoButton.el,
			this.redoButton.el,
			compare.el,
			this.resetButton.el,
			this.exportButton.el,
			this.saveButton.el
		);

		if ( this.options.onClose ) {
			const close = createButton( {
				label: __( 'Close' ),
				variant: 'ghost',
				onClick: () => this.options.onClose?.(),
			} );

			this.buttons.push( close );
			actions.appendChild( close.el );
		}

		topbar.append( title, actions );

		const body = document.createElement( 'div' );
		body.className = 'dg-body';

		this.stage = document.createElement( 'div' );
		this.stage.className = 'dg-stage';

		// Marks out the canvas itself. The checkerboard belongs here rather than on
		// the whole stage: inside the canvas it means "transparent pixels", outside
		// it means nothing at all, and using it for both made the canvas edge
		// invisible the moment a layer was moved off centre.
		this.backdrop = document.createElement( 'div' );
		this.backdrop.className = 'dg-canvas-backdrop';
		this.backdrop.setAttribute( 'aria-hidden', 'true' );
		this.stage.appendChild( this.backdrop );

		this.status = document.createElement( 'p' );
		this.status.className = 'dg-status';
		this.status.textContent = __( 'Loading image…' );
		this.stage.appendChild( this.status );

		this.sidebar = document.createElement( 'aside' );
		this.sidebar.className = 'dg-sidebar';
		this.sidebar.id = 'dg-sidebar';
		this.sidebar.setAttribute( 'aria-label', __( 'Tools' ) );

		// The tab that brings the sidebar back. A real button rather than a styled
		// div, so it is reachable by keyboard and announces its state.
		this.sidebarTab = document.createElement( 'button' );
		this.sidebarTab.type = 'button';
		this.sidebarTab.className = 'dg-sidebar-tab';

		// The rotated text lives in a child. Setting `writing-mode` on the button
		// itself would re-map its own logical properties to the vertical axis, so
		// `inset-block-start` would mean "from the right" and the tab would land in
		// the wrong corner.
		const tabLabel = document.createElement( 'span' );
		tabLabel.className = 'dg-sidebar-tab__label';
		tabLabel.textContent = __( 'Tools' );
		this.sidebarTab.appendChild( tabLabel );
		this.sidebarTab.setAttribute( 'aria-controls', 'dg-sidebar' );
		this.sidebarTab.addEventListener( 'click', () => this.setSidebarOpen( true ) );

		body.append( this.stage, this.sidebar, this.sidebarTab );
		this.root.append( topbar, body );

		this.syncToolbar();
	}

	/**
	 * Wires the compare button so the original shows only while it is held.
	 *
	 * A hold rather than a toggle, because the useful question is "what did I
	 * change?" and the answer is clearest when the two states flip under one finger.
	 * Backslash does the same thing for the keyboard, matching the convention in
	 * most raw processors.
	 *
	 * @param button Compare button.
	 */
	private attachCompare( button: ButtonHandle ): void {
		const start = () => {
			this.renderer?.setBypass( true );
			button.setPressed( true );
		};

		const end = () => {
			this.renderer?.setBypass( false );
			button.setPressed( false );
		};

		button.el.addEventListener( 'pointerdown', start );
		button.el.addEventListener( 'pointerup', end );
		button.el.addEventListener( 'pointerleave', end );
		button.el.addEventListener( 'pointercancel', end );

		const onKeyDown = ( event: KeyboardEvent ) => {
			if ( event.key === '\\' && ! event.repeat && ! isTypingTarget( event.target ) ) {
				start();
			}
		};

		const onKeyUp = ( event: KeyboardEvent ) => {
			if ( event.key === '\\' ) {
				end();
			}
		};

		document.addEventListener( 'keydown', onKeyDown );
		document.addEventListener( 'keyup', onKeyUp );

		this.detachKeys.push( () => {
			document.removeEventListener( 'keydown', onKeyDown );
			document.removeEventListener( 'keyup', onKeyUp );
		} );
	}

	/** Loads the image and brings the editor up. */
	async boot(): Promise< void > {
		try {
			this.payload = await this.client.getMedia( this.options.attachmentId );

			if ( this.destroyed ) {
				return;
			}

			this.history = new History(
				validateRecipe( this.payload.recipe, this.payload.schema )
			);

			this.setStatus( __( 'Decoding image…' ) );
			this.loaded = await loadSourceImage( this.payload, this.client );

			if ( this.destroyed ) {
				this.loaded.release();
				return;
			}

			this.setStatus( __( 'Starting the renderer…' ) );

			this.renderer = await EditorRenderer.create( {
				host: this.stage,
				pixiUrl: this.config.pixiUrl,
				maxRenderPixels: this.config.maxRenderPixels,
				schema: this.payload.schema,
			} );

			if ( this.destroyed ) {
				this.renderer.destroy();
				this.renderer = null;
				return;
			}

			this.renderer.setImage( this.loaded.image );

			// A recipe that has never been rendered -- or one migrated up from the
			// old crop-the-source model -- has no canvas yet. The image's own size is
			// the only sensible default.
			const stored = this.history.current;
			const canvas =
				stored.canvas.width > 0 && stored.canvas.height > 0
					? stored.canvas
					: this.renderer.imageSize;

			this.history.replace( { ...stored, canvas } );

			this.renderer.setDocument( canvas, stored.layers, stored.activeLayerId );
			this.renderer.setTone( stored.curves, stored.levels );

			this.syncBackdrop();
			this.detachKeys.push( this.renderer.onViewportChange( () => this.syncBackdrop() ) );
			this.attachPasteboard();
			this.attachTools();

			this.status.remove();
			this.buildSidebar();
			this.syncFromRecipe();
			this.attachShortcuts();
			this.setTitle();
		} catch ( error ) {
			this.fail( error );
		}
	}

	/** Shows a message in the stage area. */
	private setStatus( message: string ): void {
		this.status.textContent = message;

		if ( ! this.status.isConnected ) {
			this.stage.appendChild( this.status );
		}
	}

	/**
	 * Renders an unrecoverable error.
	 *
	 * The server's own wording is preferred: "You are not allowed to edit this
	 * image" and "The original file is not readable on disk" call for completely
	 * different responses from the user, and a generic failure tells them nothing.
	 *
	 * @param error The failure.
	 */
	private fail( error: unknown ): void {
		const message =
			error instanceof Error ? error.message : __( 'The image could not be opened.' );

		this.status.classList.add( 'dg-status--error' );
		this.setStatus( message );
		toast( message, 'error' );
	}

	/** Puts the image title in the toolbar. */
	private setTitle(): void {
		const title = this.root.querySelector( '.dg-topbar__title' );

		if ( title && this.payload ) {
			title.textContent = this.payload.title || __( 'Untitled image' );
		}
	}

	/**
	 * Mounts the sidebar's panel stack.
	 *
	 * The editor owns the model and the renderer; the panels own their own markup.
	 * Everything they need arrives through `PanelContext`, which is deliberately the
	 * same surface a third-party tool would get -- a Layers panel added later must
	 * not need anything the built-ins get for free.
	 */
	private buildSidebar(): void {
		if ( ! this.payload || ! this.renderer ) {
			return;
		}

		registerBuiltInPanels();

		this.panelHost = new PanelHost(
			this.sidebar,
			this.panelContext(),
			() => this.setSidebarOpen( false )
		);
		this.setSidebarOpen( readSidebarOpen() );
	}

	/** Everything a panel or the options bar is given. */
	private panelContext(): PanelContext {
		return {
			// Only ever called once an image is loaded, so the non-null assertion is
			// carrying a real invariant rather than papering over one.
			payload: this.payload!,
			getRecipe: () => this.history.current,
			setOp: ( type, value ) => this.applyOp( type, value ),
			setOutput: ( patch ) => this.setOutput( patch ),
			setLayer: ( layer, label ) => this.applyLayer( layer, label ),
			setDocument: ( canvas, layer, label ) => this.applyDocument( canvas, layer, label ),
			getImageSize: () => this.activeLayerSize(),
			getActiveTool: () => this.activeTool,
			setActiveTool: ( tool ) => this.setActiveTool( tool ),
			onActiveToolChange: ( listener ) => {
				this.toolListeners.add( listener );

				return () => {
					this.toolListeners.delete( listener );
				};
			},
			setCurve: ( channel, points ) => this.applyCurve( channel, points ),
			setLevels: ( levels ) => this.applyLevels( levels ),
			stage: this.stage,
			getViewport: () => this.renderer?.getViewport() ?? null,
			onViewportChange: ( listener ) =>
				this.renderer?.onViewportChange( listener ) ?? ( () => {} ),
			onHistogram: ( listener ) =>
				this.renderer?.onHistogram( listener ) ?? ( () => {} ),
			onRecipeChange: ( listener ) => {
				this.recipeListeners.add( listener );

				return () => {
					this.recipeListeners.delete( listener );
				};
			},
			listPresets: () => this.client.getPresets(),
			savePreset: ( name ) => this.client.createPreset( name, this.history.current ),
			deletePreset: ( id ) => this.client.deletePreset( id ),
			applyPreset: ( preset ) => this.applyPreset( preset ),
			getLayers: () => this.history.current.layers,
			getActiveLayerId: () => this.history.current.activeLayerId,
			setLayers: ( layers, activeId ) => this.applyLayers( layers, activeId ),
			addLayer: () => this.addLayer(),
			getBrush: () => this.brush,
			setBrush: ( patch ) => this.setBrush( patch ),
			getView: () => this.view,
			setView: ( patch ) => this.setView( patch ),
			onBrushChange: ( listener ) => {
				this.brushListeners.add( listener );

				return () => {
					this.brushListeners.delete( listener );
				};
			},
		};
	}

	/**
	 * Updates the output settings on the current recipe.
	 *
	 * Not pushed onto the undo stack: format and quality describe how the edit is
	 * encoded, not the edit itself, and interleaving them with adjustment history
	 * would make undo behave unpredictably.
	 *
	 * @param patch Fields to change.
	 */
	private setOutput( patch: { format?: string; quality?: number } ): void {
		const current = this.history.current;

		this.history.replace( {
			...current,
			output: { ...current.output, ...patch },
		} );
	}

	/**
	 * Applies one adjustment and re-renders.
	 *
	 * @param type  Op to change.
	 * @param value New canonical value.
	 */
	private applyOp( type: OpType, value: number ): void {
		if ( ! this.payload ) {
			return;
		}

		const next = setOp( this.history.current, type, value, this.payload.schema );

		// Labelled with the op so History coalesces a whole drag into one undo step.
		this.history.push( next, type );

		this.renderer?.setOps( next.ops );
		this.notifyRecipe();
		this.syncToolbar();
	}

	/**
	 * Shows or hides the sidebar.
	 *
	 * Hiding it entirely, rather than narrowing it, gives the picture the whole
	 * window -- which is the point of hiding it. The tab is what makes that
	 * reversible without hunting for a menu.
	 *
	 * @param open Whether the sidebar should be visible.
	 */
	private setSidebarOpen( open: boolean ): void {
		this.root.classList.toggle( 'is-sidebar-hidden', ! open );
		this.sidebarTab.setAttribute( 'aria-expanded', String( open ) );
		this.sidebarTab.hidden = open;

		writeSidebarOpen( open );

		// The stage just changed width, so the canvas has to be re-fitted and every
		// overlay repositioned against it.
		this.renderer?.fit();
	}

	/**
	 * Changes a view preference.
	 *
	 * @param patch Fields to change.
	 */
	private setView( patch: Partial< ViewPrefs > ): void {
		this.view = { ...this.view, ...patch };

		writeViewPrefs( this.view );
		this.rulers?.setVisible( this.view.rulers );
		this.stage.classList.toggle( 'has-rulers', this.view.rulers );
		this.renderer?.fit();
	}

	/** Builds the tool rail, the selection marquee and the painting controller. */
	private attachTools(): void {
		const renderer = this.renderer;

		if ( ! renderer ) {
			return;
		}

		const ctx = this.panelContext();

		this.toolRail = new ToolRail( {
			getActive: () => this.activeTool,
			onSelect: ( tool ) => this.setActiveTool( tool ),
			getColours: () => ( {
				colour: this.brush.colour,
				background: this.brush.background,
			} ),
			setColours: ( patch ) => this.setBrush( patch ),
			onColoursChange: ( listener ) => {
				const wrapped = () => listener();

				this.brushListeners.add( wrapped );

				return () => {
					this.brushListeners.delete( wrapped );
				};
			},
			getQuickMask: () => this.quickMask,
			setQuickMask: ( on ) => this.setQuickMask( on ),
			getFullScreen: () => this.fullScreen,
			setFullScreen: ( on ) => this.setFullScreen( on ),
		} );

		this.root.querySelector( '.dg-body' )?.prepend( this.toolRail.el );
		this.stage.dataset.tool = this.activeTool;

		this.rulers = new Rulers( {
			stage: this.stage,
			getViewport: () => renderer.getViewport(),
			getCanvas: () => this.history.current.canvas,
		} );

		this.rulers.setVisible( this.view.rulers );
		this.stage.classList.toggle( 'has-rulers', this.view.rulers );
		this.detachKeys.push( renderer.onViewportChange( this.rulers.draw ) );

		// SVG rather than a positioned box: a lasso is not a rectangle, and once the
		// outline has to be a path anyway, one element draws every shape.
		const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
		svg.setAttribute( 'class', 'dg-selection' );
		svg.setAttribute( 'aria-hidden', 'true' );

		// Two paths, opposite colours, one dashed and animated: marching ants that
		// stay visible over both light and dark pixels.
		for ( const cls of [ 'dg-selection__under', 'dg-selection__over' ] ) {
			const path = document.createElementNS( 'http://www.w3.org/2000/svg', 'path' );
			path.setAttribute( 'class', cls );
			svg.appendChild( path );
		}

		this.selectionBox = svg as unknown as HTMLElement;
		this.stage.appendChild( this.selectionBox );
		this.syncSelection();

		this.optionsBar = new OptionsBar( {
			ctx,
			getTool: () => this.activeTool,
			getSelectionShape: () => this.selectionShape,
			setSelectionShape: ( shape ) => {
				this.selectionShape = shape;
				this.stageTools?.clearPath();
				this.setSelection( null );
			},
			hasSelection: () => this.selection !== null,
			deselect: () => {
				this.stageTools?.clearPath();
				this.setSelection( null );
			},
			selectAll: () =>
				this.setSelection( {
					shape: 'rect',
					points: [
						{ x: 0, y: 0 },
						{ x: 1, y: 1 },
					],
				} ),
			hasCloneSource: () => !! this.stageTools?.getCloneSource(),
			clearCloneSource: () => this.stageTools?.clearCloneSource(),
			setZoom: ( mode ) => {
				if ( mode === 'fit' ) {
					renderer.resetView();
				} else {
					renderer.zoomToActual();
				}
			},
		} );

		this.root.querySelector( '.dg-topbar' )?.after( this.optionsBar.el );

		this.stageTools = new StageTools( {
			stage: this.stage,
			getViewport: () => renderer.getViewport(),
			getCanvas: () => this.history.current.canvas,
			getTool: () => this.activeTool,
			getBrush: () => this.brush,
			setBrush: ( patch ) => this.setBrush( patch ),
			getTargetLayerId: () => this.paintTarget(),
			stamp: ( id, image, x, y, size, colour, opacity, erase ) => {
				this.captureTiles( id, dabRegion( x, y, size ) );
				renderer.stampBrush( id, image, x, y, size, colour, opacity, erase );
			},
			fillMask: ( id, mask, colour, opacity ) => {
				// A flood fill can reach anywhere, so it offers the whole canvas and
				// lets the collector decide whether that is affordable.
				const canvas = this.history.current.canvas;

				this.captureTiles( id, {
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
				} );
				renderer.fillWithMask( id, mask, colour, opacity );
			},
			composite: ( id, source, x, y, opacity ) => {
				this.captureTiles( id, {
					x,
					y,
					width: source.width,
					height: source.height,
				} );
				renderer.compositeCanvas( id, source, x, y, opacity );
			},
			readDocument: () => renderer.readDocumentPixels(),
			readPristine: () => renderer.readPristinePixels(),
			getSelectionShape: () => this.selectionShape,
			setSelection: ( selection ) => this.setSelection( selection ),
			pan: ( dx, dy ) => renderer.pan( dx, dy ),
			zoomAt: ( factor, x, y ) => renderer.zoomAt( factor, x, y ),
			onToolStateChange: () => this.optionsBar?.render(),
			onStrokeEnd: () => {
				// One history entry per stroke, not per dab -- and it carries the tiles
				// the stroke overwrote, so undoing it puts the pixels back rather than
				// restoring an identical recipe and appearing to do nothing.
				this.commitStroke();
			},
		} );

		this.brushCursor = new BrushCursor( {
			stage: this.stage,
			getViewport: () => renderer.getViewport(),
			getCanvas: () => this.history.current.canvas,
			getTool: () => this.activeTool,
			getBrush: () => this.brush,
		} );

		// Redrawn on zoom and on any brush change, so the ring resizes under a
		// stationary pointer rather than waiting for the next movement.
		this.detachKeys.push( renderer.onViewportChange( this.brushCursor.draw ) );
		this.brushListeners.add( this.brushCursor.draw );
		this.toolListeners.add( this.brushCursor.draw );

		this.detachKeys.push( renderer.onViewportChange( () => this.syncSelection() ) );
		this.attachClipboard();
	}

	/**
	 * Remembers a region's pixels before a paint operation overwrites them.
	 *
	 * @param layerId Layer about to change.
	 * @param rect    Region about to change, in canvas pixels.
	 */
	private captureTiles( layerId: string, rect: PixelRect ): void {
		const renderer = this.renderer;

		if ( ! renderer ) {
			return;
		}

		const canvas = this.history.current.canvas;

		if ( ! this.strokeTiles || this.strokeLayer !== layerId ) {
			this.strokeTiles = new TileCollector( canvas.width, canvas.height );
			this.strokeLayer = layerId;
		}

		this.strokeTiles.add( rect, ( tile ) =>
			renderer.extractLayerRegion( layerId, tile )
		);
	}

	/**
	 * Closes the stroke in progress and files it as one undo step.
	 *
	 * Exactly one entry per stroke. The previous version pushed a copy of the current
	 * recipe, which was identical to the entry below it -- so the first undo restored a
	 * state indistinguishable from the one already showing, and it took two presses
	 * before anything happened.
	 */
	private commitStroke(): void {
		const collector = this.strokeTiles;
		const layerId = this.strokeLayer;

		this.strokeTiles = null;
		this.strokeLayer = '';

		if ( ! collector || collector.size === 0 ) {
			return;
		}

		this.history.push(
			{ ...this.history.current },
			'paint',
			collector.toPatch( layerId )
		);
		this.syncToolbar();
	}

	/**
	 * The layer a stroke should land on.
	 *
	 * Painting onto the base image layer would destroy the original pixels, and the
	 * whole plugin rests on not doing that -- so a stroke aimed at it silently gets
	 * a new raster layer instead.
	 */
	private paintTarget(): string {
		const recipe = this.history.current;
		const active = recipe.layers.find(
			( layer ) => layer.id === recipe.activeLayerId
		);

		if ( active && active.kind === 'raster' ) {
			return active.id;
		}

		const existing = recipe.layers.find( ( layer ) => layer.kind === 'raster' );

		if ( existing ) {
			return existing.id;
		}

		const layer = createRasterLayer( __( 'Paint' ) );

		this.renderer?.ensurePaintTexture( layer.id );

		// Not an undo step of its own. The layer exists because a stroke needed
		// somewhere to go, so folding it into the current entry keeps one stroke to one
		// undo -- otherwise the first press would remove a stroke's *container* and
		// appear to do nothing at all.
		this.applyLayers( [ ...recipe.layers, layer ], layer.id, false );

		return layer.id;
	}

	/**
	 * Replaces the marquee.
	 *
	 * Rasterises it immediately, because the mask is what actually confines
	 * painting -- keeping it in step with the outline here means no tool has to
	 * remember to rebuild it.
	 *
	 * @param selection Selection, or null to clear it.
	 */
	private setSelection( selection: Selection | null ): void {
		this.selection = isEmptySelection( selection ) ? null : selection;

		const canvas = this.history.current.canvas;

		this.renderer?.setPaintMask(
			buildSelectionMask( this.selection, canvas.width, canvas.height )
		);

		this.syncSelection();
		this.optionsBar?.render();
	}

	/**
	 * Draws the marquee outline over the canvas.
	 *
	 * Hidden with `style.display`, not the `hidden` property. `hidden` is an
	 * HTMLElement IDL attribute and this is an SVG element -- assigning it sets a
	 * property that reflects to nothing, so the CSS never matches and the outline
	 * stays on screen. That is what made a deselect appear to do nothing.
	 *
	 * The path is also emptied rather than merely hidden, so a stale outline cannot
	 * reappear the moment something else makes the element visible again.
	 */
	private syncSelection(): void {
		const svg = this.selectionBox;
		const viewport = this.renderer?.getViewport();

		if ( ! svg ) {
			return;
		}

		if ( ! this.selection || ! viewport ) {
			svg.style.display = 'none';

			for ( const node of svg.querySelectorAll( 'path' ) ) {
				node.setAttribute( 'd', '' );
			}

			return;
		}

		svg.style.display = '';
		svg.style.insetInlineStart = `${ viewport.x }px`;
		svg.style.insetBlockStart = `${ viewport.y }px`;
		svg.setAttribute( 'width', String( viewport.width ) );
		svg.setAttribute( 'height', String( viewport.height ) );

		const path = selectionToPath( this.selection, viewport.width, viewport.height );

		for ( const node of svg.querySelectorAll( 'path' ) ) {
			node.setAttribute( 'd', path );
		}
	}

	/** Binds copy, paste and deselect. */
	private attachClipboard(): void {
		const onKey = ( event: KeyboardEvent ) => {
			if ( isTypingTarget( event.target ) ) {
				return;
			}

			if ( event.key === 'Escape' && this.selection ) {
				event.preventDefault();
				this.stageTools?.clearPath();
				this.setSelection( null );

				return;
			}

			// Enter closes whatever is being placed click by click: a polygon selection,
			// or a path, which is drawn rather than selected.
			if ( event.key === 'Enter' ) {
				if ( this.activeTool === 'path' ) {
					event.preventDefault();

					if ( this.stageTools?.commitPath() ) {
						this.setSelection( null );
					}

					return;
				}

				if ( this.selectionShape === 'polygon' ) {
					event.preventDefault();
					this.stageTools?.clearPath();

					return;
				}
			}

			if ( ( event.metaKey || event.ctrlKey ) && event.key.toLowerCase() === 'a' ) {
				event.preventDefault();
				this.setSelection( {
					shape: 'rect',
					points: [
						{ x: 0, y: 0 },
						{ x: 1, y: 1 },
					],
				} );

				return;
			}

			if ( ( event.metaKey || event.ctrlKey ) && event.key.toLowerCase() === 'd' ) {
				event.preventDefault();
				this.stageTools?.clearPath();
				this.setSelection( null );

				return;
			}

			if ( ! ( event.metaKey || event.ctrlKey ) ) {
				return;
			}

			const key = event.key.toLowerCase();

			if ( key === 'c' ) {
				event.preventDefault();
				this.copySelection();
			} else if ( key === 'v' ) {
				event.preventDefault();
				this.pasteClipboard();
			}
		};

		document.addEventListener( 'keydown', onKey );
		this.detachKeys.push( () => document.removeEventListener( 'keydown', onKey ) );
	}

	/**
	 * Lets the pasteboard be scrolled and zoomed.
	 *
	 * A plain wheel scrolls, which is what a trackpad or a Magic Mouse produces from
	 * a two-finger swipe -- so panning is the default gesture rather than something
	 * behind a modifier. Ctrl or Cmd with the wheel zooms, matching the convention
	 * every map and design tool uses, and is also what a pinch gesture reports.
	 *
	 * The listener is non-passive because it has to call `preventDefault()`: without
	 * that, the admin page scrolls behind the editor and a pinch zooms the browser.
	 */
	private attachPasteboard(): void {
		const onWheel = ( event: WheelEvent ) => {
			const renderer = this.renderer;

			if ( ! renderer ) {
				return;
			}

			event.preventDefault();

			if ( event.ctrlKey || event.metaKey ) {
				const bounds = this.stage.getBoundingClientRect();

				// Exponential so zooming in and out by the same gesture is
				// symmetrical. The coefficient is tuned for a mouse wheel, where one
				// notch reports a delta of about 120: that gives roughly 1.27x per
				// notch, which is a step you can aim with. A trackpad pinch reports
				// much smaller deltas and lands proportionally finer.
				renderer.zoomAt(
					Math.exp( -event.deltaY * 0.002 ),
					event.clientX - bounds.left,
					event.clientY - bounds.top
				);

				return;
			}

			renderer.pan( -event.deltaX, -event.deltaY );
		};

		this.stage.addEventListener( 'wheel', onWheel, { passive: false } );
		this.detachKeys.push( () => this.stage.removeEventListener( 'wheel', onWheel ) );

		const onKey = ( event: KeyboardEvent ) => {
			if ( isTypingTarget( event.target ) ) {
				return;
			}

			// The universal "show me everything again" key.
			if ( event.key === '0' ) {
				this.renderer?.resetView();
			}
		};

		document.addEventListener( 'keydown', onKey );
		this.detachKeys.push( () => document.removeEventListener( 'keydown', onKey ) );
	}

	/** Positions the canvas backdrop over wherever the canvas currently is. */
	private syncBackdrop(): void {
		const viewport = this.renderer?.getViewport();

		if ( ! viewport ) {
			this.backdrop.hidden = true;

			return;
		}

		this.backdrop.hidden = false;
		this.backdrop.style.insetInlineStart = `${ viewport.x }px`;
		this.backdrop.style.insetBlockStart = `${ viewport.y }px`;
		this.backdrop.style.inlineSize = `${ viewport.width }px`;
		this.backdrop.style.blockSize = `${ viewport.height }px`;
	}

	/**
	 * Tells the panels the recipe moved.
	 *
	 * Every mutation goes through here, including the ones that originate on the
	 * stage rather than in a panel. Without it, dragging a transform handle changed
	 * the layer but left the Rotation and Scale sliders showing stale numbers --
	 * two views of the same value disagreeing, which is exactly the sort of thing
	 * that makes an editor feel broken.
	 */
	private notifyRecipe(): void {
		const recipe = this.history.current;

		for ( const listener of this.recipeListeners ) {
			listener( recipe );
		}
	}

	/**
	 * The native pixel size of whatever backs the active layer.
	 *
	 * The transform handles measure this, so a pasted fragment gets a box its own
	 * size rather than the whole photograph's -- which is what made a paste look
	 * like it had been scaled up.
	 */
	private activeLayerSize(): CanvasSize {
		const id = this.history.current.activeLayerId;
		const size = this.renderer?.layerTextureSize( id );

		if ( size && size.width > 0 ) {
			return size;
		}

		return this.renderer?.imageSize ?? { width: 0, height: 0 };
	}

	/**
	 * Hands the stage to a tool.
	 *
	 * @param tool Tool to activate.
	 */
	private setActiveTool( tool: ActiveTool ): void {
		if ( this.activeTool === tool ) {
			return;
		}

		this.activeTool = tool;
		this.toolRail?.sync( tool );
		this.optionsBar?.render();
		this.stage.dataset.tool = tool;

		for ( const listener of this.toolListeners ) {
			listener( tool );
		}
	}

	/**
	 * Shows or hides the selection as a red overlay.
	 *
	 * @param on Whether to show it.
	 */
	private setQuickMask( on: boolean ): void {
		this.quickMask = on;
		this.stage.classList.toggle( 'is-quick-mask', on );
		this.syncSelection();
	}

	/**
	 * Expands the editor to fill the screen, or gives the space back.
	 *
	 * Uses the Fullscreen API when it is available and a CSS class when it is not --
	 * inside a Desktop Mode window the request is often refused, and an editor that
	 * silently does nothing when you press F is worse than one that just grows.
	 *
	 * @param on Whether to fill the screen.
	 */
	private setFullScreen( on: boolean ): void {
		this.fullScreen = on;
		this.root.classList.toggle( 'is-full-screen', on );

		if ( on && this.root.requestFullscreen ) {
			void this.root.requestFullscreen().catch( () => {
				// The CSS class already did the useful part.
			} );
		} else if ( ! on && document.fullscreenElement ) {
			void document.exitFullscreen().catch( () => {} );
		}

		this.renderer?.fit();
	}

	/**
	 * Changes the shared brush settings.
	 *
	 * @param patch Fields to change.
	 */
	private setBrush( patch: Partial< BrushSettings > ): void {
		this.brush = { ...this.brush, ...patch };

		for ( const listener of this.brushListeners ) {
			listener( this.brush );
		}
	}

	/**
	 * Replaces the layer stack.
	 *
	 * @param layers   New stack.
	 * @param activeId Optional. Which layer becomes active.
	 * @param undoable Optional. False folds the change into the current entry, for a
	 *                 layer that exists only because a stroke needed somewhere to go.
	 */
	private applyLayers(
		layers: Layer[],
		activeId?: string,
		undoable = true
	): void {
		const next = setLayers( this.history.current, layers, activeId );

		if ( undoable ) {
			this.history.push( next, 'layers' );
		} else {
			this.history.replace( next );
		}

		this.renderer?.setDocument( next.canvas, next.layers, next.activeLayerId );
		this.notifyRecipe();
		this.syncToolbar();
	}

	/** Adds an empty raster layer above the active one. */
	private addLayer(): void {
		const recipe = this.history.current;
		const layer = createRasterLayer(
			sprintf( __( 'Layer %d' ), recipe.layers.length )
		);

		const index = recipe.layers.findIndex(
			( entry ) => entry.id === recipe.activeLayerId
		);
		const layers = [ ...recipe.layers ];

		layers.splice( index + 1, 0, layer );

		this.renderer?.ensurePaintTexture( layer.id );
		this.applyLayers( layers, layer.id );
	}

	/**
	 * Copies the selected region of the composed document.
	 *
	 * Reads the *composite*, not the active layer: what you see is what you get,
	 * which is the only interpretation that does not need explaining.
	 */
	private copySelection(): void {
		const recipe = this.history.current;
		const rect = this.selection;

		if ( ! rect || ! this.renderer ) {
			toast( __( 'Select an area first.' ), 'info' );

			return;
		}

		const bounds = selectionBounds( rect );
		const copied = this.renderer.extractRegion(
			bounds.x * recipe.canvas.width,
			bounds.y * recipe.canvas.height,
			bounds.w * recipe.canvas.width,
			bounds.h * recipe.canvas.height
		);

		if ( ! copied ) {
			toast( __( 'Nothing to copy.' ), 'error' );

			return;
		}

		this.clipboard = copied;
		toast( __( 'Copied.' ), 'success' );
	}

	/**
	 * Pastes the clipboard as a new layer.
	 *
	 * A new layer rather than pixels stamped into the current one, so the paste can
	 * still be moved, scaled and removed afterwards.
	 */
	private pasteClipboard(): void {
		const source = this.clipboard;
		const recipe = this.history.current;

		if ( ! source || ! this.renderer ) {
			toast( __( 'Nothing to paste.' ), 'info' );

			return;
		}

		// Land it where it was copied from when that is still known, so a paste in
		// place looks like nothing happened rather than jumping to the middle.
		const bounds = this.selection ? selectionBounds( this.selection ) : null;
		const layer = createRasterLayer( __( 'Pasted' ), {
			x: bounds ? bounds.x + bounds.w / 2 : 0.5,
			y: bounds ? bounds.y + bounds.h / 2 : 0.5,
		} );

		this.renderer.addRasterTexture( layer.id, source );
		this.applyLayers( [ ...recipe.layers, layer ], layer.id );

		this.setActiveTool( 'transform' );
		toast( __( 'Pasted as a new layer.' ), 'success' );
	}

	/**
	 * Moves, scales or rotates the layer.
	 *
	 * The canvas is untouched, which is precisely why a transform drag is stable:
	 * the surface the pointer is measured against cannot move underneath it.
	 *
	 * @param layer New layer transform.
	 * @param label History label; a drag passes a stable one so it coalesces.
	 */
	private applyLayer( layer: LayerTransform, label = 'transform' ): void {
		const next = setLayer( this.history.current, layer );

		this.history.push( next, label );
		this.renderer?.setDocument( next.canvas, next.layers, next.activeLayerId );
		this.notifyRecipe();
		this.syncToolbar();
	}

	/**
	 * Resizes the canvas and repositions the layer together.
	 *
	 * @param canvas New canvas size.
	 * @param layer  New layer transform.
	 * @param label  History label.
	 */
	private applyDocument(
		canvas: CanvasSize,
		layer: LayerTransform,
		label = 'canvas'
	): void {
		const next = setDocument( this.history.current, canvas, layer );

		this.history.push( next, label );
		this.renderer?.setDocument( next.canvas, next.layers, next.activeLayerId );
		this.notifyRecipe();
		this.syncToolbar();
	}

	/**
	 * Applies a curve change and re-renders.
	 *
	 * @param channel Curve channel.
	 * @param points  Control points, or undefined to clear.
	 */
	private applyCurve(
		channel: keyof Curves,
		points: [ number, number ][] | undefined
	): void {
		const next = setCurve( this.history.current, channel, points );

		this.history.push( next, `curve-${ channel }` );
		this.renderer?.setTone( next.curves, next.levels );
		this.notifyRecipe();
		this.syncToolbar();
	}

	/**
	 * Applies a levels change and re-renders.
	 *
	 * @param levels New levels.
	 */
	private applyLevels( levels: Levels ): void {
		const next = setLevels( this.history.current, levels );

		this.history.push( next, 'levels' );
		this.renderer?.setTone( next.curves, next.levels );
		this.notifyRecipe();
		this.syncToolbar();
	}

	/**
	 * Applies a saved look, keeping this image's own crop.
	 *
	 * Geometry is deliberately untouched. A preset describes a look; the crop
	 * describes this particular frame, and replacing it would silently re-crop the
	 * photograph the moment a look was applied.
	 *
	 * @param preset Preset to apply.
	 */
	private applyPreset( preset: Preset ): void {
		const current = this.history.current;

		this.history.push(
			{
				...current,
				ops: preset.recipe.ops ?? [],
				curves: preset.recipe.curves ?? {},
				levels: preset.recipe.levels ?? current.levels,
			},
			'preset'
		);

		this.syncFromRecipe();
		toast( __( 'Preset applied.' ), 'success' );
	}

	/**
	 * Pushes the current recipe out to the panels, the renderer and the toolbar.
	 *
	 * Called for changes the panels did not originate -- undo, redo, reset, and
	 * `setRecipe()` -- so their controls follow the model rather than assuming they
	 * are the only thing that can change it.
	 */
	private syncFromRecipe(): void {
		if ( ! this.payload ) {
			return;
		}

		const recipe = this.history.current;

		this.notifyRecipe();

		this.renderer?.setOps( recipe.ops );
		this.renderer?.setDocument( recipe.canvas, recipe.layers, recipe.activeLayerId );
		this.renderer?.setTone( recipe.curves, recipe.levels );
		this.syncToolbar();
	}

	/** Enables or disables the toolbar buttons to match the state. */
	private syncToolbar(): void {
		const identity = isIdentity( this.history.current, this.renderer?.imageSize );

		this.undoButton?.setDisabled( ! this.history.canUndo );
		this.redoButton?.setDisabled( ! this.history.canRedo );
		this.resetButton?.setDisabled( identity );

		// Saving an unedited image would just duplicate it, and saving twice while a
		// render is in flight would create two copies.
		const ready = ! this.busy && this.renderer !== null && ! identity;

		this.saveButton?.setDisabled( ! ready || ! this.payload?.canSave );
		this.exportButton?.setDisabled( ! ready );
	}

	/**
	 * Renders the edit at full resolution.
	 *
	 * @return The encoded image, or null when rendering failed.
	 */
	private async renderOutput(): Promise< Blob | null > {
		if ( ! this.renderer ) {
			return null;
		}

		const { format, quality } = this.history.current.output;

		this.busy = true;
		this.syncToolbar();

		try {
			return await this.renderer.renderFull( format, quality );
		} catch ( error ) {
			toast(
				error instanceof Error ? error.message : __( 'The image could not be rendered.' ),
				'error'
			);

			return null;
		} finally {
			this.busy = false;
			this.syncToolbar();
		}
	}

	/**
	 * Saves the edit as a new attachment.
	 *
	 * Never modifies the original. The success message reports the dimensions the
	 * site actually stored rather than the ones rendered, because WordPress applies
	 * `big_image_size_threshold` to every upload and will quietly downscale a large
	 * render -- claiming otherwise would be a comfortable lie.
	 */
	private async save(): Promise< void > {
		if ( this.busy || ! this.payload ) {
			return;
		}

		const blob = await this.renderOutput();

		if ( ! blob || this.destroyed ) {
			return;
		}

		const rendered = this.renderer?.sourceSize;

		try {
			this.busy = true;
			this.syncToolbar();

			const result = await this.client.saveRender(
				this.payload.id,
				blob,
				this.history.current
			);

			const downscaled =
				rendered !== undefined &&
				result.width > 0 &&
				result.width < rendered.width;

			toast(
				downscaled
					? sprintf(
							/* translators: 1: stored width, 2: stored height. */
							__( 'Saved as a copy. This site stores images at up to %1$d × %2$d.' ),
							result.width,
							result.height
					  )
					: sprintf(
							/* translators: 1: stored width, 2: stored height. */
							__( 'Saved as a copy — %1$d × %2$d.' ),
							result.width,
							result.height
					  ),
				'success'
			);

			this.announceSave( result );
			this.options.onSave?.( result );
		} catch ( error ) {
			toast(
				error instanceof Error ? error.message : __( 'The image could not be saved.' ),
				'error'
			);
		} finally {
			this.busy = false;
			this.syncToolbar();
		}
	}

	/**
	 * Offers a link to the copy that was just created.
	 *
	 * A toast disappears; someone who saved and then wanted to open the result would
	 * otherwise have to go hunting through the media library for it.
	 *
	 * @param result Save response.
	 */
	private announceSave( result: SaveResult ): void {
		const existing = this.root.querySelector( '.dg-saved' );

		existing?.remove();

		const banner = document.createElement( 'p' );
		banner.className = 'dg-saved';

		const link = document.createElement( 'a' );
		link.href = result.editUrl;
		link.textContent = __( 'Open the saved copy' );

		banner.append( document.createTextNode( __( 'Saved a copy. ' ) ), link );
		this.sidebar.prepend( banner );
	}

	/**
	 * Downloads the rendered image to the user's device.
	 *
	 * Requires no capability beyond opening the editor: it never touches the media
	 * library, so a user who may view and adjust an image may also take a copy away.
	 */
	private async exportToDevice(): Promise< void > {
		const blob = await this.renderOutput();

		if ( ! blob || this.destroyed ) {
			return;
		}

		const extension = this.history.current.output.format.split( '/' )[ 1 ] ?? 'jpg';
		const base = ( this.payload?.title || 'image' ).replace( /[^\w-]+/g, '-' );

		const url = URL.createObjectURL( blob );
		const link = document.createElement( 'a' );

		link.href = url;
		link.download = `${ base }-edited.${ 'jpeg' === extension ? 'jpg' : extension }`;
		document.body.appendChild( link );
		link.click();
		link.remove();

		// Revoking immediately can abort the download in some browsers; one turn of
		// the event loop is enough for the click to have been consumed.
		window.setTimeout( () => URL.revokeObjectURL( url ), 60_000 );

		toast( __( 'Downloaded.' ), 'success' );
	}

	/**
	 * Steps back one edit.
	 *
	 * A stroke's pixels are restored *before* the recipe moves, because the patch
	 * describes the layer as it stood in the entry being left behind.
	 */
	private undo(): void {
		if ( ! this.history.canUndo ) {
			return;
		}

		this.applyPixelPatch();
		this.history.undo();
		this.syncFromRecipe();
	}

	/** Steps forward one edit. */
	private redo(): void {
		if ( ! this.history.canRedo ) {
			return;
		}

		this.history.redo();
		this.applyPixelPatch();
		this.syncFromRecipe();
	}

	/**
	 * Swaps the pixels an entry carries for the ones currently there.
	 *
	 * The entry's patch holds the tiles as they were before the stroke; putting them
	 * back means the tiles as they are *now* become the way forward, so the two are
	 * exchanged in place. That is what makes redo work without storing both directions
	 * of every stroke -- the cost is paid only when someone actually undoes something.
	 */
	private applyPixelPatch(): void {
		const patch = this.history.meta as PixelPatch | undefined;
		const renderer = this.renderer;

		if ( ! patch || ! renderer || ! patch.complete ) {
			return;
		}

		const swapped: TilePatch[] = [];

		for ( const tile of patch.tiles ) {
			swapped.push( {
				rect: tile.rect,
				pixels: renderer.extractLayerRegion( patch.layerId, tile.rect ),
			} );

			renderer.restoreLayerRegion( patch.layerId, tile.rect, tile.pixels );
		}

		this.history.setMeta( { ...patch, tiles: swapped } );
	}

	/** Returns every adjustment to zero. */
	private resetAll(): void {
		const source = this.renderer?.imageSize;

		if ( isIdentity( this.history.current, source ) ) {
			return;
		}

		this.history.push( resetOps( this.history.current, source ), 'reset' );
		this.syncFromRecipe();
		toast( __( 'Adjustments reset.' ), 'info' );
	}

	/** Binds undo and redo to the usual chords. */
	private attachShortcuts(): void {
		const onKeyDown = ( event: KeyboardEvent ) => {
			if ( ! ( event.metaKey || event.ctrlKey ) || isTypingTarget( event.target ) ) {
				return;
			}

			const key = event.key.toLowerCase();

			if ( key === 'z' && ! event.shiftKey ) {
				event.preventDefault();
				this.undo();
			} else if ( ( key === 'z' && event.shiftKey ) || key === 'y' ) {
				event.preventDefault();
				this.redo();
			}
		};

		document.addEventListener( 'keydown', onKeyDown );
		this.detachKeys.push( () =>
			document.removeEventListener( 'keydown', onKeyDown )
		);
	}

	/** Releases everything this editor owns. */
	destroy(): void {
		if ( this.destroyed ) {
			return;
		}

		this.destroyed = true;

		for ( const detach of this.detachKeys ) {
			detach();
		}
		this.detachKeys = [];

		this.stageTools?.destroy();
		this.stageTools = null;
		this.toolRail?.destroy();
		this.toolRail = null;
		this.optionsBar?.destroy();
		this.optionsBar = null;
		this.rulers?.destroy();
		this.brushCursor?.destroy();
		this.rulers = null;
		this.brushListeners.clear();
		this.panelHost?.destroy();
		this.panelHost = null;
		this.recipeListeners.clear();
		this.toolListeners.clear();

		for ( const button of this.buttons ) {
			button.destroy();
		}
		this.buttons = [];

		this.renderer?.destroy();
		this.renderer = null;

		this.loaded?.release();
		this.loaded = null;

		this.root.replaceChildren();
		this.root.classList.remove( 'dg-editor' );
	}
}

/** Where view preferences are remembered between sessions. */
const VIEW_KEY = 'daguerre.view.v1';

/** Reads remembered view preferences, defaulting both on. */
function readViewPrefs(): ViewPrefs {
	try {
		const raw = window.localStorage.getItem( VIEW_KEY );

		if ( ! raw ) {
			return { rulers: true, snapping: true };
		}

		const stored = JSON.parse( raw ) as Partial< ViewPrefs >;

		return {
			rulers: stored.rulers !== false,
			snapping: stored.snapping !== false,
		};
	} catch {
		return { rulers: true, snapping: true };
	}
}

/**
 * Remembers view preferences.
 *
 * @param prefs Preferences to store.
 */
function writeViewPrefs( prefs: ViewPrefs ): void {
	try {
		window.localStorage.setItem( VIEW_KEY, JSON.stringify( prefs ) );
	} catch {
		// Storage unavailable; the preference simply will not be remembered.
	}
}

/** Where the sidebar's open state is remembered between sessions. */
const SIDEBAR_KEY = 'daguerre.sidebar.v1';

/** Reads the remembered sidebar state, defaulting to open. */
function readSidebarOpen(): boolean {
	try {
		return window.localStorage.getItem( SIDEBAR_KEY ) !== 'closed';
	} catch {
		return true;
	}
}

/**
 * Remembers the sidebar state.
 *
 * @param open Whether the sidebar is visible.
 */
function writeSidebarOpen( open: boolean ): void {
	try {
		window.localStorage.setItem( SIDEBAR_KEY, open ? 'open' : 'closed' );
	} catch {
		// Storage unavailable. The preference simply will not be remembered.
	}
}

/**
 * Whether an event target is somewhere the user is typing.
 *
 * Keeps editor shortcuts from stealing keystrokes out of a caption field.
 *
 * @param target Event target.
 */
function isTypingTarget( target: EventTarget | null ): boolean {
	if ( ! ( target instanceof HTMLElement ) ) {
		return false;
	}

	return (
		target.isContentEditable ||
		[ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( target.tagName )
	);
}
