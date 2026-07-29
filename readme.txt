=== Daguerre ===
Contributors: daniellopez
Tags: image editor, media, photo, filters, histogram
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A modern, non-destructive image editor for the WordPress media library. Exposure, colour and tone, rendered on the GPU in your browser.

== Description ==

WordPress has shipped the same image editor since 2008: rotate, flip, crop, scale. Daguerre adds the part that was missing — actual photo adjustments, with a live histogram, rendered on the GPU.

**Adjustments**

* Exposure, in stops
* Contrast
* Temperature and tint
* Saturation and vibrance
* Hue

**Non-destructive by design**

Saving never touches your original. Daguerre writes a new attachment and records the edit as a *recipe* — the list of adjustments, not the pixels. Re-opening a photo restores every slider exactly where you left it, and re-renders from the original pixels. Editing the same image ten times costs you nothing in quality, because it is always a first-generation render.

**Fast**

Adjustments are composed into a single GPU pass rather than chained. That is not just quicker; it also means the image is quantised once instead of once per adjustment, which is the difference between clean gradients and visible banding in a sky.

**Works with Desktop Mode**

Daguerre is a standalone plugin and needs nothing else. If you also run the Desktop Mode plugin, Daguerre notices and adapts — it uses the desktop's own interface components so it looks native inside a window.

== Installation ==

1. Upload the `daguerre` folder to `/wp-content/plugins/`.
2. Activate the plugin through the Plugins menu.
3. Go to **Media → Edit Photos**, or open any image and choose "Edit with Daguerre".

== Frequently Asked Questions ==

= Does this modify my original images? =

No. Every save creates a new attachment and links it back to the original. Your original file is never rewritten.

= Do I need ImageMagick or GD? =

Not for the adjustments. All rendering happens in your browser using WebGL. WordPress still uses its normal image library to generate the thumbnail sizes of the saved result.

= Which browsers are supported? =

Any browser with WebGL 2, which is every current version of Chrome, Firefox, Safari and Edge.

= My images are served from a CDN. Will it work? =

Yes. When a CDN does not send the CORS headers a GPU canvas requires, Daguerre automatically streams the original through your own site instead.

= Why is GIF not supported? =

Rendering an animated GIF through a canvas silently flattens it to a single frame. Rather than quietly destroy the animation, Daguerre does not offer to edit them.

== Third-party libraries ==

This plugin bundles the following third-party library. It is included in the plugin package and loaded from your own server — no external or CDN requests are made.

* **PixiJS** v8 — https://github.com/pixijs/pixijs — MIT License.
  Bundled at `assets/vendor/pixi.min.js`. Licence text at `assets/vendor/pixi-LICENSE.txt`.
  Source: https://github.com/pixijs/pixijs/releases

== Changelog ==

= 0.1.0 =
* Initial release: exposure, contrast, temperature, tint, saturation, vibrance and hue.
* Live RGB and luminance histogram.
* Hold-to-compare, undo and redo.
* Full-screen editor under Media → Edit Photos.
