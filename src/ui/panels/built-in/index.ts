/**
 * The panels Lienzo ships with.
 *
 * These use exactly the public `registerPanel()` API a third party would use --
 * there is no privileged path for built-ins. If Layers or Curves cannot be built
 * against this surface, the surface is wrong and should be widened rather than
 * bypassed.
 *
 * One panel per module, so adding a fourteenth means adding a file and a line here
 * rather than scrolling through the other thirteen.
 */

import { registerAdjustmentPanels } from './adjustments';
import { registerBrushPanel } from './brush';
import { registerCanvasPanel } from './canvas';
import { registerHistogramPanel } from './histogram';
import { registerLayersPanel } from './layers';
import { registerOutputPanel } from './output';
import { registerPresetsPanel } from './presets';
import { registerTonePanels } from './tone';
import { registerTransformPanel } from './transform';
import { registerViewPanels } from './view';

/**
 * Registers the built-in panels.
 *
 * Idempotent: `registerPanel()` replaces by id, so calling this twice is harmless.
 */
export function registerBuiltInPanels(): void {
	registerHistogramPanel();
	registerLayersPanel();
	registerBrushPanel();
	registerAdjustmentPanels();
	registerTransformPanel();
	registerCanvasPanel();
	registerTonePanels();
	registerPresetsPanel();
	registerOutputPanel();
	registerViewPanels();
}
