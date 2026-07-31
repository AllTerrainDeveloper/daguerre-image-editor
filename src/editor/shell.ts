/**
 * The editor's static layout.
 *
 * Everything that exists before an image does: the toolbar row, the stage, the canvas
 * backdrop, the loading message and the sidebar with its reopen tab. Built once in the
 * constructor so a host can place the editor before knowing how long the image will
 * take to load.
 */

import { __ } from '../i18n';
import { isDesktopModeEnabled } from '../platform';
import { createSidebarToggle } from './sidebar-tab';
import type { SidebarToggle } from './sidebar-tab';

export interface ShellOptions {
	/** Element to fill. Its contents are replaced. */
	root: HTMLElement;
	/** Which surface is hosting the editor. Affects chrome only, never the engine. */
	host: 'page' | 'modal' | 'window';
	/** Called after the sidebar is shown or hidden, so the canvas can be re-fitted. */
	onSidebarToggle: () => void;
}

/**
 * The editor's chrome.
 */
export class EditorShell {
	readonly root: HTMLElement;

	/** The toolbar row. The options bar is inserted after it. */
	readonly topbar: HTMLElement;

	/** The canvas area. Overlays attach here. */
	readonly stage: HTMLElement;

	/** Shows where the canvas is, behind the rendered output. */
	readonly backdrop: HTMLElement;

	/** The sidebar the panel host fills. */
	readonly sidebar: HTMLElement;

	/** Where toolbar buttons go. */
	readonly actions: HTMLElement;

	private title: HTMLElement;

	private status: HTMLElement;

	/** The tab that restores a hidden sidebar. */
	private sidebarTab: SidebarToggle;

	/**
	 * @param options Shell configuration.
	 */
	constructor( options: ShellOptions ) {
		this.root = options.root;

		this.root.replaceChildren();
		this.root.classList.add( 'lz-editor' );
		this.root.classList.add( `lz-editor--${ options.host }` );

		// Which house style the *fallback* controls wear. A component the shell has
		// registered brings its own styling; a native input does not, and inside a
		// chromeless iframe no component is registered at all -- so this is the only
		// thing keeping the editor from looking like two plugins glued together.
		this.root.classList.toggle( 'is-desktop-mode', isDesktopModeEnabled() );

		this.topbar = document.createElement( 'div' );
		this.topbar.className = 'lz-topbar';
		this.topbar.setAttribute( 'role', 'toolbar' );
		this.topbar.setAttribute( 'aria-label', __( 'Editor actions' ) );

		this.title = document.createElement( 'h1' );
		this.title.className = 'lz-topbar__title';
		this.title.textContent = __( 'Loading image…' );

		this.actions = document.createElement( 'div' );
		this.actions.className = 'lz-topbar__actions';

		this.topbar.append( this.title, this.actions );

		const body = document.createElement( 'div' );
		body.className = 'lz-body';

		this.stage = document.createElement( 'div' );
		this.stage.className = 'lz-stage';

		// Marks out the canvas itself. The checkerboard belongs here rather than on
		// the whole stage: inside the canvas it means "transparent pixels", outside
		// it means nothing at all, and using it for both made the canvas edge
		// invisible the moment a layer was moved off centre.
		this.backdrop = document.createElement( 'div' );
		this.backdrop.className = 'lz-canvas-backdrop';
		this.backdrop.setAttribute( 'aria-hidden', 'true' );
		this.stage.appendChild( this.backdrop );

		this.status = document.createElement( 'p' );
		this.status.className = 'lz-status';
		this.status.textContent = __( 'Loading image…' );
		this.stage.appendChild( this.status );

		this.sidebar = document.createElement( 'aside' );
		this.sidebar.className = 'lz-sidebar';
		this.sidebar.id = 'lz-sidebar';
		this.sidebar.setAttribute( 'aria-label', __( 'Tools' ) );

		this.sidebarTab = createSidebarToggle( this.root, options.onSidebarToggle );

		body.append( this.stage, this.sidebar, this.sidebarTab.el );
		this.root.append( this.topbar, body );
	}

	/**
	 * Shows a message in the stage area.
	 *
	 * @param message What to say.
	 */
	setStatus( message: string ): void {
		this.status.textContent = message;

		if ( ! this.status.isConnected ) {
			this.stage.appendChild( this.status );
		}
	}

	/**
	 * Shows a message the user cannot recover from.
	 *
	 * @param message What went wrong.
	 */
	setError( message: string ): void {
		this.status.classList.add( 'lz-status--error' );
		this.setStatus( message );
	}

	/** Takes the loading message down. */
	clearStatus(): void {
		this.status.remove();
	}

	/**
	 * Puts the image title in the toolbar.
	 *
	 * @param title Image title.
	 */
	setTitle( title: string ): void {
		this.title.textContent = title || __( 'Untitled image' );
	}

	/** Restores the remembered sidebar state. */
	restoreSidebar(): void {
		this.sidebarTab.restore();
	}

	/**
	 * Shows or hides the sidebar.
	 *
	 * @param open Whether the sidebar should be visible.
	 */
	setSidebarOpen( open: boolean ): void {
		this.sidebarTab.setOpen( open );
	}

	/**
	 * Positions the canvas backdrop over wherever the canvas currently is.
	 *
	 * @param viewport Where the canvas sits, or null when nothing is loaded.
	 */
	syncBackdrop(
		viewport: { x: number; y: number; width: number; height: number } | null
	): void {
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

	/** Empties the root and gives back its classes. */
	destroy(): void {
		this.root.replaceChildren();
		this.root.classList.remove( 'lz-editor' );
	}
}
