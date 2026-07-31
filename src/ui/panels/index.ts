/**
 * The sidebar panel system.
 *
 * Four pieces behind one entry point: the types a panel is written against, the
 * registry it registers into, the persisted state of which panels are open, and the
 * host that renders them. The built-in panels sit under `built-in/` and are imported
 * separately, so nothing here depends on them -- an embedder wanting a bare sidebar
 * simply never calls `registerBuiltInPanels()`.
 */

export type {
	ActiveTool,
	PanelContext,
	PanelDef,
	ViewPrefs,
	Viewport,
} from './types';
export { PAINTING_TOOLS } from './types';

export {
	listPanels,
	onPanelsChanged,
	registerPanel,
	unregisterPanel,
} from './registry';

export { PanelHost } from './host';
