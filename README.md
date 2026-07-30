# Lienzo.

A non-destructive, GPU-accelerated image editor for the WordPress media library.

WordPress has shipped the same image editor since 2008 — rotate, flip, crop, scale — and
`wp-admin/includes/image-edit.php` renders its toolbar as hardcoded `onclick=` markup with no
action hooks inside, so it cannot be extended, only replaced. Lienzo replaces it.

## Status

**All six phases complete, plus layers, selections and an eighteen-tool rail.** Colour and tone, a
live per-frame histogram, crop/straighten/rotate/flip, curves and levels, sharpen/blur/vignette/grain
and saved presets; then a layer stack, four selection shapes, brushes, a magic wand, retouching and
toning brushes, a clone stamp, gradients, shapes, paths and on-canvas text. Adjustments stay
non-destructive — always written as a new attachment with the edit stored as a re-openable recipe.

Lienzo runs as a **native window inside [Desktop Mode](../alcazaba-plugin)**, which it requires.
Opened from the dock, a desktop icon, a double-clicked image, the Media Library row action, the
attachment screen, the media modal or the `core/image` block toolbar — every one of those opens the
same window.

## Design in one page

**JavaScript does the pixels; PHP only stores them.** There is no Imagick or GD dependency for
adjustments. The browser renders via WebGL, and the server's only job is to accept the result and
create an attachment.

**One editor, one surface.** The editor is a single mountable component:

```js
const editor = window.lienzo.mount( element, {
    attachmentId: 123,
    host: 'page',            // 'page' | 'modal' | 'window' — affects chrome only
    onClose: () => {},
} );
// editor.getRecipe() / editor.setRecipe() / editor.destroy()
```

The Desktop Mode native window is the only thing that calls it. The row action, the media modal
button and the block editor button all ask for that window instead of mounting an editor of their
own. Nothing outside `src/api.ts` touches Pixi, the recipe model, or REST.

**One GPU pass, not six.** Exposure, contrast, temperature, tint, saturation and hue are all affine
transforms of RGB, so they are multiplied into a single colour matrix and applied in one shader
pass. Chaining six Pixi filters would write six 8-bit render targets and quantise six times, which
shows up as banding in a sky. Vibrance is the exception — it scales saturation by how saturated a
pixel already is, which is not linear — so it travels as a separate uniform and the same shader
applies it immediately after.

**Non-destructive, where non-destructive means something.** A save writes a *new* attachment and
records the edit as a recipe: the list of adjustments, not the pixels. Re-opening loads the
*original's* pixels plus the recipe, so every render is first-generation and repeated edits never
compound quantisation loss.

That only holds while the recipe describes the whole image. A painted, pasted or dropped layer is
pixels, and no replay of a recipe over the original brings them back — so a save carrying any of them
becomes **its own origin**: no source pointer, no stored recipe, and re-opening shows the flattened
pixels with the sliders at zero. Getting this wrong is subtle and was: the save pointed back at the
original and stored a recipe naming a raster layer whose pixels lived nowhere, so the file in the
library was correct and re-opening it showed the original with an empty layer where the painting had
been. `lienzo_recipe_is_reproducible()` is the one place that decides.

**Resolution independence is what makes the preview honest.** The on-screen sprite is scaled to fit
the viewport and Pixi runs filters at rendered size, so dragging a slider on a 6000px photo costs
what a thumbnail costs. Saving re-runs the identical filter against the unscaled texture. The two
agree because every phase-1 op is per-pixel colour maths with no spatial radius. *An op with a pixel
radius — blur, sharpen, grain — breaks that and must scale its radius with the render size.*

## The sidebar is a panel registry

Every tool in the sidebar — histogram, adjustments, output, image info — is a *registered panel*,
not markup baked into the editor. Each collapses independently and remembers that; the `⋯` picker
chooses which are on screen at all.

```js
window.lienzo.registerPanel( {
    id: 'layers',
    title: 'Layers',
    order: 15,
    defaultCollapsed: false,
    render( host, ctx ) {
        // ctx.payload, ctx.getRecipe(), ctx.setOp(), ctx.setOutput(),
        // ctx.onHistogram(), ctx.onRecipeChange()
        return () => {/* teardown */};
    },
} );
```

Panels appear immediately in an already-open editor, so registration can happen at any time.
Registering an existing `id` replaces it — that is how a plugin overrides a built-in rather than
only adding beside it.

The built-ins in `src/ui/built-in-panels.ts` use exactly this API; there is no privileged path. That
is the point: **if Layers or Curves cannot be built against `PanelContext`, the context is wrong and
should be widened rather than bypassed.**

Accordion rather than tabs, deliberately: a histogram is something you watch *while* dragging a
slider, so putting it behind a tab switch would break the one workflow it exists for. Anything you
would rather not see gets switched off in the picker instead.

## Sixteen tools, four mechanisms

The rail on the leading edge holds the tools, two columns wide and grouped by what they do to the
image. Exactly one owns the stage at a time, because they all want the same pointer events on the
same surface — `StageTools` routes every gesture through one `toCanvas()`, so a brush stroke and a
selection rectangle cannot disagree about where the pointer is.

| Group | Tools | Keys |
|---|---|---|
| Select | Move & transform, Select (rectangle / ellipse / freeform / polygon), Magic wand, Crop | `V` `M` `W` `C` |
| Retouch | Eyedropper, Retouch (blur / sharpen / smudge / heal), Clone stamp, Dodge & burn (dodge / burn / desaturate / saturate) | `I` `R` `S` `O` |
| Paint | Brush, History brush, Eraser, Fill | `B` `Y` `E` `G` |
| Draw | Gradient, Shape (rectangle / rounded / ellipse / line / triangle / star), Path, Text | `N` `U` `P` `T` |
| View | Hand, Zoom | `H` `Z` |

`X` swaps the foreground and background swatches, `D` restores black on white — the swatches sit at
the foot of the rail because almost every tool reads one of them. `Q` toggles the quick mask, which
fills the selection in translucent red instead of outlining it: marching ants say where an edge is,
a mask says how soft it is, which an outline cannot show at all. `F` fills the screen — via the
Fullscreen API when it is allowed, and a CSS class when it is not, because inside a Desktop Mode
window the request is usually refused and an editor that silently ignores a keypress is worse than
one that just grows. `⋯` lists every tool by name with its shortcut, since sixteen glyphs are quick
to click and slow to learn.

Two Photoshop slots are deliberately absent: the frame tool, which places an empty image
placeholder and has nothing to do in a library editor, and the separate lasso slot — freeform and
polygon are shapes of the one Select tool, chosen in its options bar, which is where every other
selection setting already lives.

Sixteen tools, but only four gestures, and each one is a single method:

- **Stroking** — brush, eraser and the retouching brushes. A stroke is interpolated into evenly
  spaced dabs, so how fast you drag does not change the result.
- **Dragging a region** — select, gradient, shape. A dashed screen-space outline follows the drag and
  the pixels are only committed on release: allocating and uploading a canvas-sized bitmap on every
  pointer move would stall a 20-megapixel document to show what an outline conveys perfectly.
- **Clicking a point** — fill, wand, eyedropper, zoom.
- **Typing on the canvas** — text, which lands as an *object* rather than as paint: each commit
  becomes its own layer, named after its words, with a texture the size of the glyphs and a transform
  that puts it where it was typed. That is what makes it movable, scalable and deletable on its own —
  none of which survives being flattened into a canvas-sized sheet alongside every brush stroke.
  Pasted pixels take the same path. Strokes go to a full-canvas sheet instead, because painting into
  an object would promote its texture to canvas size with the content re-centred, and the object
  would jump the moment a brush touched it.

  Clicking opens a caret where the glyphs will land,
  styled with the same font, size and colour the render will use and scaled to the current zoom, so
  what you type is what appears. It rasterises through the same `textCanvas()` the caret is styled
  from, which is what stops the editing surface and the output drifting apart. A `<textarea>` rather
  than a contenteditable div, for a native caret, native selection and plain text on paste.
- **Panning** — hand, which moves the view rather than the pixels.

Three shared engines do the actual work, and each is reused by several tools rather than owned by
one:

`engine/pixel-tools.ts` is the retouching engine. Blur, sharpen, smudge, heal, dodge, burn, sponge
and clone all read the pixels under a round dab, compute new ones, and blend the result back with a
soft falloff — only the middle step differs, so there is one dab routine and eight small kernels. It
is CPU code on purpose: eight GLSL programs would be eight more shaders to compile, against the
whole point of the single-pass adjustment shader. Two decisions make it fast enough to be usable:
each dab snapshots only its own *neighbourhood* (a full-document copy per dab was 67 MB twenty-five
times in one stroke — ten seconds for a single blur), and the blur is a separable running-sum pass,
so a 64-pixel kernel costs the same per pixel as a 2-pixel one. Only the dab's dirty rectangle is
uploaded back to the GPU, so the cost tracks the brush rather than the image.

`engine/paint-shapes.ts` draws gradients, shapes and text — all three as one canvas-sized bitmap
composited through the selection mask, which is what makes them three `<canvas>` draw calls instead
of three features.

Undo reaches painted pixels, and does it in one press. A recipe is a few hundred bytes, so history
snapshots it whole; a layer is 67MB, so it cannot work the same way. `model/pixel-history.ts`
therefore remembers only the 256-pixel *tiles* a stroke touched, and only the version of them that
existed beforehand — a stroke across a photo costs a few hundred kilobytes rather than the document.
Redo needs the pixels the stroke *produced*, which only exist once it has happened, so the patch is
exchanged for its opposite as it is applied: the cost is paid when someone actually undoes something
rather than on every stroke. A flood fill can legitimately touch everything, so past a cap the action
records no patch and says so, instead of restoring half a change and claiming success.

Copying respects the shape you drew. A texture can only be read as a rectangle, so the
lifted block is clipped back through the selection mask with `destination-in` — without
that, copying an ellipse or a lasso gave you its bounding box, corners and all.

`model/selection.ts` gained `traceMask()`, and that is why the magic wand was cheap: it reuses the
paint bucket's flood fill, then traces the region into a closed path. The rest of the editor speaks
in paths, so converting once here means the outline renderer, the mask rasteriser and the brush
clipper all work unchanged. Only the outer contour is traced, so a region with holes selects through
them — a real limitation, and the right trade against carrying two selection models.

Retouching reads the *composed document* rather than the layer, because the base image layer is not
canvas-aligned: reading it directly would blur the wrong pixels the moment the image had been moved.
Results land on a raster layer above the image, exactly like a brush stroke, so the original pixels
are never touched. Their extent is in canvas pixels, so a wide blur on a 5000-pixel photo is
invisible at fit zoom and obvious at 100% — that is arithmetic, not a bug.

## A Desktop Mode application

Lienzo requires the [Desktop Mode](../alcazaba-plugin) plugin and runs as a **native window** in
the desktop shell, rendering into the shell's own DOM. That is the whole design, not a preference:
the shell's `<wpd-*>` components, its drag bridge and its PixiJS all live in the parent frame, and a
chromeless iframe can reach none of them — no component is registered there at all. There is
therefore one editing surface, and the row action, the media modal button and the block editor button
are all ways of asking for it rather than places the editor mounts.

The requirement is checked by **capability, not by plugin slug** — do the functions being called
exist — so a fork, a rename or a bundled copy all work. It is checked on `plugins_loaded`, and that
detail is load-bearing: plugins load alphabetically, so `lienzo` runs *before* `desktop-mode` and
none of its functions exist yet at file scope. Checking there would fail on every site, every time,
and the plugin would silently never load. `Requires Plugins:` governs activation, not load order.

With Desktop Mode absent or switched off, nothing registers but a notice on the plugins screen
saying why. Classic admin therefore has no editor — the deliberate cost of running natively.

### The controls come from the shell

Per tag, never per plugin:

```ts
hasComponent( 'wpd-range-field' ) ? createWpdSlider( … ) : createNativeSlider( … )
```

The shell registers a core subset of `<wpd-*>` eagerly and the rest only when a bundle importing them
loads, so "is Desktop Mode running" is the wrong question — the only trustworthy one is whether *this*
tag is in the registry right now. An unregistered tag renders as inert markup with no error, which is
why this is a hard gate, and it is a *layered* one: `createNumberField()` asks for
`<wpd-number-field>` first, then `<wpd-text-field type="number">`, then a bare input. That middle tier
is what actually runs most of the time, because the shell does not register the number field until
some bundle imports it. On the QA site `wpd-range-field`, `wpd-select`, `wpd-segmented`,
`wpd-color-field`, `wpd-text-field` and `wpd-checkbox-label` are all registered while
`wpd-number-field` and `wpd-section` are not — a per-plugin check would have rendered two inert tags.

Adapters do the same for behaviour. `src/platform.ts` funnels `request()`, `toast()` and
`confirmAction()` through feature detection, so no other module branches on the shell.

### Drag an image in, get a layer

Dropping a photo on the editor **adds it as a layer** where it was released, scaled to
sit inside the canvas. Deliberately not "open this instead": a drop onto a document
already in progress means *combine them*, and replacing it would throw away the work.
An empty window has nothing to combine with, so there a drop opens.

Three quite different things arrive at one handler, because three quite different drags
end up here:

- **An attachment**, from a My WordPress media tile or a desktop icon, through the
  shell's drag manager. Its pixels load via the same CORS-safe path the document uses, so
  a CDN-served file falls back to the byte proxy instead of tainting the canvas.
- **A media record**, which is what dragging a thumbnail out of the **Media Library**
  carries: Desktop Mode's enhancement makes every `.attachment` draggable and writes the
  whole record as JSON on `application/x-wp-media-attachment`. That is the canonical
  contract for a WordPress media drag, and reading it beats inferring an id from markup.
- **A URL**, from `text/uri-list`, `text/plain` or an `<img src>` in `text/html`, for
  drags carrying no record. A generated size (`photo-150x150.jpg`) is stripped to load
  the original, falling back to the URL as dragged — a file legitimately named
  `poster-1920x1080.jpg` looks exactly like a generated size.
- **A file**, from Finder or Explorer. No upload needed: blob URL straight into a
  texture, like a paste.

These are listened for on the **document** and then hit-tested against the window body's
bounds, not bound to the body itself. A drag across the desktop passes over the shell's
own furniture — overlays, drag layers, window chrome — and an event whose target is one
of those never reaches a listener on an element it is not inside. Bubbling to the
document always happens; the hit test is what stops us claiming drops meant for someone
else. Capture phase, so the drop is claimed before the shell's document-level handlers,
which yield to anything that has already called `preventDefault()`.

A drop that lands on the editor and cannot be read now says so, listing the types it
found. Silence is indistinguishable from a broken feature — which is precisely how the
Media Library case went unnoticed twice.

Layer textures are retained for **every state on the undo stack**, not just the current
one. That is what makes redo work: a dropped, pasted or typed layer keeps its pixels in a
GPU texture and nowhere else, so freeing them the moment the layer left the current
document meant undo destroyed what redo needed — the layer came back as an empty frame
with handles around nothing.

### Theming

The editor **defines** Desktop Mode's component palette on its own root, and this is not optional
polish: nothing in either plugin declares `--wpd-fg`, `--wpd-fg-muted`, `--wpd-border` or the rest, so
every component was falling back to its light-theme literals and painting `#646970` labels and white
input backgrounds onto a dark panel. Labels measured about 2:1. One block of variables on
`.lz-editor` themes every `<wpd-*>` the editor will ever mount, including ones added later, and takes
those labels to 5.5:1.

The surround stays dark in every host, deliberately: judging an exposure against a white panel is
judging the panel. So the editor does *not* adopt Desktop Mode's window palette, which is light
(`--desktop-mode-window-bg: #fff`) because it dresses the frame rather than the content. What it does
adopt is the accent and the corner radius — `--desktop-mode-window-link-accent`, falling back to
`--wp-admin-theme-color` — so the editor follows the user's desktop theme and their admin colour
scheme. An earlier version of that chain read `--wpd-accent`, which nothing defines; it fell through
to a hardcoded blue every time.

### The bundle is evaluated twice

WordPress enqueues the script, and the shell's lazy-load payload injects the same URL again when a
native window first opens. Two IIFE evaluations, two module scopes — so `window.lienzo` belongs to
one copy and the live window's loader to the other, and a request to open an image reached a set of
window loaders the live window had never been added to. It reported success and did nothing.

Mutable desktop state therefore lives on a single `window.__lienzoDesktop` singleton, and the
one-time registrations are guarded. **Anything in `src/hosts/desktop-mode.ts` that must be singular
has to live there**, not in a module-level variable.

## PixiJS comes from the shell

Lienzo ships no rendering library. Desktop Mode vendors PixiJS v8 (MIT) and registers it in its
module registry, so `src/engine/pixi-loader.ts` asks for it with
`wp.desktop.loadModules( [ 'pixijs' ] )` and reads `window.PIXI`.

That is smaller and safer than carrying a second copy: two Pixi 8 instances on a page share GPU
resource registries through globals, and tearing one down can invalidate textures belonging to the
other. There is no version to keep in step and nothing to go stale. For the same reason the renderer
never calls `app.destroy( true )`, which would release those global registries out from under
unrelated Pixi apps on the page.

`pixi.js` stays in `devDependencies` for its TypeScript types only, and is never bundled.

## Layout

```
lienzo.php               plugin bootstrap, constants
includes/
  helpers.php              capabilities, source resolution, render ceiling
  recipe.php               op schema + validation  (contract twin of src/model/recipe.ts)
  rest.php                 lienzo/v1 routes
  assets.php               script/style registration + the config blob
  render.php               blob -> sideload -> attachment -> recipe meta
  presets.php              per-user saved looks
  admin-page.php           the full-screen editor page
  media-actions.php        row action + attachment-screen button
  desktop-mode.php         every Desktop Mode touchpoint, behind function_exists
src/
  api.ts                   mount() — the only public entry point
  platform.ts              host adapters (fetch / toast / confirm / component detection)
  model/recipe.ts          types, defaults, validation
  model/history.ts         undo stack with drag coalescing
  engine/color-matrix.ts   PURE: ops -> one 4x5 matrix
  engine/geometry.ts       PURE: crop/rotate/flip maths, all normalised
  engine/histogram.ts      PURE: pixels -> bucket counts
  engine/lut.ts            PURE: curves + levels -> one 256x1 table
  engine/brush.ts          PURE: stamps, stroke interpolation, flood fill
  engine/pixel-tools.ts    PURE: one dab routine, eight retouching kernels
  engine/paint-shapes.ts   gradients, shapes and text -> one bitmap each
  engine/renderer.ts       Pixi app, geometry pass, single-pass filter
  engine/shaders/adjust.ts the one shader
  net/                     REST client, image loading with CORS fallback
  ui/panels.ts             panel registry + collapsible chrome
  ui/built-in-panels.ts    every shipped panel, via the public registerPanel()
  ui/tool-rail.ts          the sixteen tools, two columns, keyboard shortcuts
  ui/stage-tools.ts        every canvas gesture, through one coordinate conversion
  ui/options-bar.ts        the contextual strip; a second view of one model
  ui/crop-overlay.ts       the draggable crop rectangle
  ui/curve-editor.ts       the tone curve graph
  ui/controls.ts           the adaptive control kit, one factory per control
  ui/swatches.ts           foreground/background pair, swap, reset, palette
  ui/                      histogram plot, rulers, transform handles
  hosts/                   one adapter per surface
```

The pure modules carry no Pixi import on purpose: the maths is where the bugs would be, and it is
all unit-testable in jsdom without a GPU.

## Development

```bash
npm install
npm run build          # builds the bundles and syncs them to the local QA site
npm run dev            # watch build
npm run deploy         # sync only, without rebuilding
npm run typecheck      # tsc --noEmit
npm run test           # vitest — the pure modules
npm run env:start      # wp-env at http://localhost:8894 (admin / password)
npm run test:php:install
npm run test:php       # phpunit, @group lienzo
```

### Releasing

```bash
npm run plugin:build    # typecheck, tests, then both bundles. No deploy, no QA site needed.
npm run plugin:check    # WordPress's own Plugin Check, the tool the review queue runs
npm run plugin:package  # dist/lienzo.zip, plus dist/assets/ for the directory art
```

`bin/ships.mjs` is the single list of what belongs in a distributed copy, imported by
both the local deploy and the packager, because the two answering differently is how a
zip ends up carrying `node_modules` or missing a file the QA site has been running for
weeks. The zip contains one `lienzo/` folder so it unpacks to the right slug however it
is installed, and it is staged into `dist/lienzo/` first so you can list and diff the
exact tree a reviewer will see.

The banner and icon art lives in `.wordpress-org/` and is deliberately **not** in the
zip: the plugin directory serves it from its own `assets/` path in SVN, and shipping it
would add half a megabyte to every download. `plugin:package` copies it to
`dist/assets/` so both halves of an SVN commit are ready side by side.

`plugin:check` runs against the repository as wp-env maps it, not the package, so it
excludes the build tooling explicitly; that list mirrors `bin/ships.mjs` in Plugin
Check's own form. Unzip the package if you want to see the real tree.

### Two sites, and why builds deploy themselves

| Site | What it is | How code gets there |
|---|---|---|
| `localhost:8894` | wp-env, spun up by this repo | Bind-mounted — the repo *is* the plugin directory |
| `localhost:8889` | The `wordpress-alcazaba` compose project | `bin/deploy.mjs`, run automatically by `npm run build` |

The wp-env site mounts this repo directly, so a change is live the moment it is saved (PHP) or
rebuilt (JS/CSS). The `:8889` QA site is a separate WordPress checkout that only mounts *its own*
tree, so `bin/deploy.mjs` mirrors the plugin into
`../wordpress-alcazaba/src/wp-content/plugins/lienzo` at the end of every build — no zip, no
WordPress upload screen, and it is live immediately because that checkout is itself bind-mounted
into the container.

The mirror copies only what runs in production; `src/`, `tests/`, `bin/`, `node_modules/` and the
build config are excluded. It deletes files the source no longer has, so a renamed file cannot
linger and mask a bug — and it therefore refuses to write into any directory that does not already
contain `lienzo.php`. When no WordPress checkout is present it prints a note and exits zero rather
than failing the build. Override with `LIENZO_DEPLOY_TARGET`, or skip with `LIENZO_SKIP_DEPLOY=1`.

`npm run env:start` maps both plugins in but activates neither: wp-env's `plugins` list mounts a
directory under its *own basename* as well, which would put a second copy of Lienzo on the site, and
it treats a failed activation as fatal — which `Requires Plugins: desktop-mode` guarantees when
Desktop Mode is not active yet. The mappings put both at their correct slugs; activate them from the
Plugins screen.

Lint PHP with `vendor/bin/phpcs` inside the container:

```bash
npx wp-env run tests-cli --env-cwd=wp-content/plugins/lienzo vendor/bin/phpcs
```

## What runs in how many passes

One pass does almost everything: the six linear adjustments (as a single composed matrix), vibrance,
sharpen, vignette, grain, and the baked tone table for curves and levels. That is one round of 8-bit
quantisation for the whole colour pipeline.

Two things sit outside it, for reasons rather than convenience:

- **Geometry** renders into an intermediate texture first, but *only* when it is not the identity —
  which most edits are. A crop changes what the downstream pipeline is even looking at, so it cannot
  be a per-pixel operation.
- **Blur** is a separable Gaussian, which means two passes by definition. It joins the filter chain
  only when the slider is off zero, so an edit without blur still pays for exactly one pass.

Sharpen and blur have a spatial extent, so they are the ops that could break the
preview-matches-save guarantee. Both are stored as a fraction of the image's longest edge and
converted to pixels against whatever is actually being rendered — which is why a sharpen set on a
900px preview still looks the same saved at 6000px.

## Adding an adjustment

Four places, and all four are required or the op silently misbehaves:

1. `lienzo_op_schema()` in `includes/recipe.php` — bounds and rest position.
2. `OpType` / `PANEL_OP_ORDER` / `MATRIX_OP_ORDER` in `src/model/recipe.ts`.
3. `matrixForOp()` in `src/engine/color-matrix.ts`, or a new shader uniform if it is not linear.
4. `OP_DISPLAY` in `src/api.ts` — the user-facing scale and suffix.

The server accepts and stores whatever the schema allows, so registering an op there without a
browser implementation gives you a slider that validates and then does nothing.

## Extension points

| Hook | Purpose |
|---|---|
| `lienzo_op_schema` | Add or re-bound adjustments |
| `lienzo_supported_mime_types` | Which images may be opened |
| `lienzo_max_render_pixels` | Ceiling on a single GPU render |
| `lienzo_max_upload_bytes` | Ceiling on a saved render |
| `lienzo_config` | The blob handed to the browser |
| `lienzo_rest_media_payload` | The open-image response |

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 0 | Skeleton, build, read routes, test harness | ✅ |
| 1 | Engine, colour and tone, live histogram | ✅ |
| 2 | Save: full-res render, `POST /render`, recipe persistence, re-open | ✅ |
| 3 | Media modal, row actions, block editor toolbar | ✅ |
| 4 | Desktop Mode native window, icon, file opener, drag in/out | ✅ |
| 5 | Crop, straighten, rotate, flip; curves and levels via a LUT | ✅ |
| 6 | Sharpen, blur, vignette, grain, presets | ✅ |
| — | Layers, selection, painting, copy/paste, rulers, snapping | ✅ |
| — | Eighteen-tool rail: wand, retouch, clone, dodge/burn, history brush, gradient, shape, path, text, hand, zoom, quick mask, full screen | ✅ |

Not yet done, and honestly out of scope so far: linear-light compositing, 16-bit intermediates,
batch apply across a selection, and a WGSL program so the filter can run on WebGPU.

One known limit worth stating plainly rather than discovering: **the magic wand and the paint bucket
are slow on very large images** — a few seconds on a 20-megapixel photo, because the flood fill walks
every pixel on the CPU. They work; they are not yet instant.

## Licence

GPL-2.0-or-later. Bundles PixiJS (MIT) — see `assets/vendor/pixi-LICENSE.txt`.
