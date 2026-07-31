/**
 * The marquee.
 *
 * Pure geometry plus one canvas rasteriser, so most of it is unit-testable.
 */

export type { Point, Selection, SelectionShape } from './types';
export { SELECTION_SHAPES } from './types';

export { isEmptySelection, selectionBounds } from './bounds';
export { appendPathPoint, selectionFromDrag, selectionToPath } from './path';
export { buildSelectionMask, clipToSelection } from './mask';
export { traceMask } from './trace';
