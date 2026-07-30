=== Lienzo. ===
Contributors: daniellopez
Tags: image editor, media, photo, layers, filters
Requires at least: 6.0
Requires Plugins: desktop-mode
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A small painting studio inside WordPress. Brushes, layers and filters, straight in the Media Library.

== Description ==

WordPress has shipped the same image editor since 2008: rotate, flip, crop, scale. Lienzo adds everything that was missing, and puts it in a window on your desktop rather than on a page you have to navigate away to.

It is a real editor. You can adjust exposure and colour while watching a live histogram, paint with brushes that have shape and softness, select an area and paint only inside it, stack layers, drag a photo in from the Media Library, and type text directly onto the canvas.

= Adjust =

* Exposure, contrast, temperature, tint, saturation, vibrance and hue
* Curves, on RGB and on each channel separately
* Levels, with black point, white point and gamma
* Sharpen, blur, vignette and grain
* A live histogram that follows the slider as you drag it
* Presets, so a look you like can be reused on the next photo

= Paint =

Eighteen tools on a two column rail, grouped the way you would expect:

* Move and transform, with handles that scale, rotate and snap
* Select as a rectangle, an ellipse, a freeform lasso or a polygon
* Magic wand, which selects the region around the colour you click
* Crop, with aspect presets
* Eyedropper, brush, eraser, paint bucket and gradient
* Retouch: blur, sharpen, smudge and heal
* Clone stamp, with an Alt click to set the sample point
* Dodge, burn, desaturate and saturate
* History brush, which paints the original image back
* Shapes, paths and text
* Hand and zoom, plus a quick mask and a full screen mode

Brushes have a size, a shape and a hardness, and the cursor is a ring the real size of the brush against the image, so you are never guessing at how much a stroke will cover.

= Layers =

Text, pasted pixels and dropped photos each arrive as their own layer, so you can move one without disturbing the others, reorder them, hide them or throw one away. Undo reaches painted pixels too, not only settings.

= Drag a photo in =

Drag an image from the Media Library, from the desktop, or from your computer straight onto the canvas. It lands as a new layer, where you dropped it, scaled to fit.

= Your originals are never touched =

Saving writes a new attachment and records the edit as a recipe: the list of adjustments, not the pixels. Re-opening a photo restores every slider exactly where you left it and renders again from the original. Editing the same image ten times costs nothing in quality, because every render is a first generation one.

= Fast, because of how it renders =

Adjustments are composed into a single GPU pass rather than chained one after another. That is not only quicker. It also means the image is quantised once instead of once per adjustment, which is the difference between a clean gradient and visible banding in a sky.

== Requires Desktop Mode ==

Lienzo runs as a window inside the Desktop Mode plugin, which turns wp-admin into a desktop. That is not decoration. Rendering inside the desktop is what gives Lienzo its window chrome, its interface components and its drag and drop, and it borrows its rendering engine from the desktop rather than shipping a second copy for your browser to download twice.

Install and activate Desktop Mode first, then switch it on for your user. Without it, Lienzo tells you what it needs and otherwise stays out of the way.

== Installation ==

1. Install and activate the Desktop Mode plugin, then switch it on for your user.
2. Upload the `lienzo` folder to `/wp-content/plugins/`, or install it from the Plugins screen.
3. Activate Lienzo through the Plugins menu.
4. Open Lienzo from the dock or the desktop, or choose "Edit with Lienzo" on any image in the Media Library.

== Frequently Asked Questions ==

= Does this change my original images? =

No. Every save creates a new attachment and links it back to the original. Your original file is never rewritten.

= Do I need ImageMagick or GD? =

Not for the editing. All of it happens in your browser using WebGL. WordPress still uses its normal image library to generate the thumbnail sizes of whatever you save.

= Which browsers are supported? =

Any browser with WebGL 2, which is every current version of Chrome, Firefox, Safari and Edge.

= My images are served from a CDN. Will it work? =

Yes. When a CDN does not send the CORS headers a GPU canvas requires, Lienzo streams the original through your own site instead.

= Why is GIF not supported? =

Rendering an animated GIF through a canvas silently flattens it to a single frame. Rather than quietly destroy the animation, Lienzo does not offer to edit them.

= Are brush strokes stored in the recipe? =

No. Adjustments, crops and transforms are described in the recipe and come back when you re-open the image. Painted pixels are pixels, so they live in the copy you save. Save a copy to keep them.

= Can I use it in the classic admin? =

No. Lienzo renders inside the desktop, so it needs Desktop Mode switched on.

== Screenshots ==

1. The editor open as a desktop window, with the tool rail, the layer stack and a live histogram.
2. Adjusting exposure and colour while the histogram follows.
3. Painting inside a selection, with the brush cursor showing the real size of the brush.
4. Text typed directly onto the canvas, as a layer of its own.

== Third-party libraries ==

This plugin bundles no third-party libraries and makes no external or CDN requests.

Rendering uses PixiJS (MIT), which is bundled by the Desktop Mode plugin and loaded from your own server by the desktop. Lienzo asks the desktop for it rather than shipping a second copy: two instances of the same rendering library on one page share GPU resources through globals, and tearing one down can break the other.

== Changelog ==

= 0.1.0 =
* First release.
* Exposure, contrast, temperature, tint, saturation, vibrance and hue, composed into a single GPU pass.
* Curves and levels, baked into one lookup table.
* Sharpen, blur, vignette and grain.
* Live RGB and luma histogram.
* Crop, straighten, rotate and flip, with the canvas independent of the image sitting on it.
* Layers, with reorder, hide and delete.
* Selections as a rectangle, an ellipse, a lasso or a polygon, plus a magic wand.
* Brushes, eraser, paint bucket, gradient, shapes, paths and text typed on the canvas.
* Retouching: blur, sharpen, smudge, heal and clone stamp.
* Dodge, burn, desaturate and saturate.
* History brush, quick mask and full screen.
* Copy and paste that respects the shape you selected rather than its bounding box.
* Drag and drop from the Media Library, the desktop or your computer.
* Undo and redo that reach painted pixels, not only settings.
* Presets.
* Non-destructive saving, with the edit stored as a re-openable recipe.
