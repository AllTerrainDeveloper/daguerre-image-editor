/**
 * The public mount API.
 *
 * Kept as a module of its own because `window.lienzo.mount` is a published entry
 * point and third parties import it by path. The implementation lives in `editor/`.
 */

export { mount } from './editor';
export type { DroppedImage, EditorInstance, MountOptions } from './editor';
