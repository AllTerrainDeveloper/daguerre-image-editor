# Daguerre

A non-destructive, GPU-accelerated image editor for the WordPress media library.

WordPress has shipped the same image editor since 2008 — rotate, flip, crop, scale — and
`wp-admin/includes/image-edit.php` renders its toolbar as hardcoded `onclick=` markup with no
action hooks inside, so it cannot be extended, only replaced. Daguerre replaces it.

## Status

**All six phases complete, plus layers, selections and a sixteen-tool rail.** Colour and tone, a live
per-frame histogram, crop/straighten/rotate/flip, curves and levels, sharpen/blur/vignette/grain and
saved presets; then a layer stack, four selection shapes, brushes, a magic wand, retouching and
toning brushes, a clone stamp, gradients, shapes and text. Adjustments stay non-destructive — always
written as a new attachment with the edit stored as a re-openable recipe.

Reachable from five surfaces: Media → Edit Photos, the list-mode row action, the attachment edit
screen, the media modal, and the `core/image` block toolbar — plus a native Desktop Mode window when
that plugin is active.

## Design in one page

**JavaScript does the pixels; PHP only stores them.** There is no Imagick or GD dependency for
adjustments. The browser renders via WebGL, and the server's only job is to accept the result and
create an attachment.

**One editor, five hosts.** The editor is a single mountable component:

```js
const editor = window.daguerre.mount( element, {
    attachmentId: 123,
    host: 'page',            // 'page' | 'modal' | 'window' — affects chrome only
    onClose: () => {},
} );
// editor.getRecipe() / editor.setRecipe() / editor.destroy()
```

The admin page, the media modal, the block editor, a Desktop Mode window and anything a third party
builds are all thin adapters over that one call. Nothing outside `src/api.ts` touches Pixi, the
recipe model, or REST.

**One GPU pass, not six.** Exposure, contrast, temperature, tint, saturation and hue are all affine
transforms of RGB, so they are multiplied into a single colour matrix and applied in one shader
pass. Chaining six Pixi filters would write six 8-bit render targets and quantise six times, which
shows up as banding in a sky. Vibrance is the exception — it scales saturation by how saturated a
pixel already is, which is not linear — so it travels as a separate uniform and the same shader
applies it immediately after.

**Non-destructive.** A save writes a *new* attachment and records the edit as a recipe — the list of
adjustments, not the pixels. Re-opening a Daguerre-produced image loads the *original's* pixels plus
the recipe, so every render is first-generation and repeated edits never compound quantisation loss.

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
window.daguerre.registerPanel( {
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
| Paint | Brush, Eraser, Fill, Gradient | `B` `E` `G` `N` |
| Draw | Shape (rectangle / rounded / ellipse / line / triangle / star), Text | `U` `T` |
| View | Hand, Zoom | `H` `Z` |

`X` swaps the foreground and background swatches, `D` restores black on white — the swatches sit at
the foot of the rail because almost every tool reads one of them.

Sixteen tools, but only four gestures, and each one is a single method:

- **Stroking** — brush, eraser and the retouching brushes. A stroke is interpolated into evenly
  spaced dabs, so how fast you drag does not change the result.
- **Dragging a region** — select, gradient, shape. A dashed screen-space outline follows the drag and
  the pixels are only committed on release: allocating and uploading a canvas-sized bitmap on every
  pointer move would stall a 20-megapixel document to show what an outline conveys perfectly.
- **Clicking a point** — fill, wand, eyedropper, text, zoom.
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

## Standalone first, Desktop Mode when present

Daguerre is a standalone plugin. It requires nothing else, and there is deliberately no
`Requires Plugins:` header. When the [Desktop Mode](../alcazaba-plugin) plugin is also active,
Daguerre notices and adapts.

Adaptation is **per capability, never per plugin**. `src/platform.ts` funnels every difference
through feature-detected adapters — `request()`, `toast()`, `confirmAction()` — so no other module
branches on whether Desktop Mode is running.

Controls do the same, per tag rather than per plugin:

```ts
hasComponent( 'wpd-range-field' ) ? createWpdSlider( … ) : createNativeSlider( … )
```

The shell registers a core subset of `<wpd-*>` eagerly and the rest only when a bundle importing
them loads, so "is Desktop Mode running" is the wrong question — the only trustworthy one is whether
*this* tag is in the custom element registry right now. An unregistered tag renders as inert markup
with no error, which is why this is a hard gate. The native fallbacks read Desktop Mode's CSS custom
properties (`--wpd-fg`, `--wpd-accent`, …), so even the fallback path inherits the desktop palette.

Verified in both worlds. With Desktop Mode inactive the editor runs on the admin page with native
controls. With it active, the admin page loads inside a Desktop Mode *iframe* window and still works
— on native controls, because a chromeless iframe has no `wpd-*` registry at all and the shell's
components live in the parent frame. The registered **native** window renders into that parent frame,
which is where the adaptive kit actually reaches the components.

The per-tag gate earns its keep there rather than being defensive dressing: on the QA site
`wpd-range-field`, `wpd-select`, `wpd-segmented`, `wpd-color-field`, `wpd-text-field` and
`wpd-checkbox-label` are all registered while `wpd-number-field` and `wpd-section` are not — that
build simply predates them. A per-plugin check would have rendered two inert tags; the per-tag check
falls back on exactly those two and uses the components for the rest.

## PixiJS is vendored, never fetched

`assets/vendor/pixi.min.js` (v8, MIT) ships inside the plugin and is committed to the repository.
WordPress.org forbids loading code from a CDN, and the plugin must be installable straight from a
checkout without an `npm install`.

It is **not bundled**. `src/engine/pixi-loader.ts` checks `window.PIXI` first and only injects the
vendored script when nothing is there, because Desktop Mode ships its own copy and two Pixi 8
instances in one frame share GPU resource registries through globals — tearing one down can
invalidate the other's textures. For the same reason the renderer never calls `app.destroy( true )`,
which would release those global registries out from under unrelated Pixi apps on the page.

Refresh the vendored copy with `npm run vendor:pixi`.

## Layout

```
daguerre.php               plugin bootstrap, constants
includes/
  helpers.php              capabilities, source resolution, render ceiling
  recipe.php               op schema + validation  (contract twin of src/model/recipe.ts)
  rest.php                 daguerre/v1 routes
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
  ui/swatches.ts           foreground/background pair with swap and reset
  ui/crop-overlay.ts       the draggable crop rectangle
  ui/curve-editor.ts       the tone curve graph
  ui/controls.ts           the adaptive control kit, one factory per control
  ui/                      histogram plot, rulers, transform handles
  hosts/                   one adapter per surface
```

The pure modules carry no Pixi import on purpose: the maths is where the bugs would be, and it is
all unit-testable in jsdom without a GPU.

## Development

```bash
npm install
npm run build          # vendors Pixi, builds the bundles, deploys to the local site
npm run dev            # watch build
npm run deploy         # sync only, without rebuilding
npm run typecheck      # tsc --noEmit
npm run test           # vitest — the pure modules
npm run env:start      # wp-env at http://localhost:8894 (admin / password)
npm run test:php:install
npm run test:php       # phpunit, @group daguerre
```

### Two sites, and why builds deploy themselves

| Site | What it is | How code gets there |
|---|---|---|
| `localhost:8894` | wp-env, spun up by this repo | Bind-mounted — the repo *is* the plugin directory |
| `localhost:8889` | The `wordpress-alcazaba` compose project | `bin/deploy.mjs`, run automatically by `npm run build` |

The wp-env site mounts this repo directly, so a change is live the moment it is saved (PHP) or
rebuilt (JS/CSS). The `:8889` QA site is a separate WordPress checkout that only mounts *its own*
tree, so `bin/deploy.mjs` mirrors the plugin into
`../wordpress-alcazaba/src/wp-content/plugins/daguerre` at the end of every build — no zip, no
WordPress upload screen, and it is live immediately because that checkout is itself bind-mounted
into the container.

The mirror copies only what runs in production; `src/`, `tests/`, `bin/`, `node_modules/` and the
build config are excluded. It deletes files the source no longer has, so a renamed file cannot
linger and mask a bug — and it therefore refuses to write into any directory that does not already
contain `daguerre.php`. When no WordPress checkout is present it prints a note and exits zero rather
than failing the build. Override with `DAGUERRE_DEPLOY_TARGET`, or skip with `DAGUERRE_SKIP_DEPLOY=1`.

`npm run env:start` maps Desktop Mode in from `../alcazaba-plugin` but leaves it **inactive**, so the
default QA state is standalone. Activate it to exercise the integration; deactivating it again and
re-running the manual checks is the load-bearing test.

Lint PHP with `vendor/bin/phpcs` inside the container:

```bash
npx wp-env run tests-cli --env-cwd=wp-content/plugins/daguerre vendor/bin/phpcs
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

1. `daguerre_op_schema()` in `includes/recipe.php` — bounds and rest position.
2. `OpType` / `PANEL_OP_ORDER` / `MATRIX_OP_ORDER` in `src/model/recipe.ts`.
3. `matrixForOp()` in `src/engine/color-matrix.ts`, or a new shader uniform if it is not linear.
4. `OP_DISPLAY` in `src/api.ts` — the user-facing scale and suffix.

The server accepts and stores whatever the schema allows, so registering an op there without a
browser implementation gives you a slider that validates and then does nothing.

## Extension points

| Hook | Purpose |
|---|---|
| `daguerre_op_schema` | Add or re-bound adjustments |
| `daguerre_supported_mime_types` | Which images may be opened |
| `daguerre_max_render_pixels` | Ceiling on a single GPU render |
| `daguerre_max_upload_bytes` | Ceiling on a saved render |
| `daguerre_config` | The blob handed to the browser |
| `daguerre_rest_media_payload` | The open-image response |

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 0 | Skeleton, build, vendored Pixi, read routes, test harness | ✅ |
| 1 | Engine, colour and tone, live histogram, admin page | ✅ |
| 2 | Save: full-res render, `POST /render`, recipe persistence, re-open | ✅ |
| 3 | Media modal, row actions, block editor toolbar | ✅ |
| 4 | Desktop Mode native window, icon, file opener, drag in/out | ✅ |
| 5 | Crop, straighten, rotate, flip; curves and levels via a LUT | ✅ |
| 6 | Sharpen, blur, vignette, grain, presets | ✅ |
| — | Layers, selection, painting, copy/paste, rulers, snapping | ✅ |
| — | Sixteen-tool rail: wand, retouch, clone, dodge/burn, gradient, shape, text, hand, zoom | ✅ |

Not yet done, and honestly out of scope so far: linear-light compositing, 16-bit intermediates,
batch apply across a selection, and a WGSL program so the filter can run on WebGPU.

Two known limits worth stating plainly rather than discovering:

- **Undo does not reach painted pixels.** History snapshots the recipe, and a brush stroke, a
  gradient or a retouch is pixels in a layer texture, not a setting. Removing the layer is the way
  back. Pixel-level undo means snapshotting layer textures, which is a real feature, not an
  oversight to patch quietly.
- **The magic wand and the paint bucket are slow on very large images** — a few seconds on a
  20-megapixel photo, because the flood fill walks every pixel on the CPU. They work; they are not
  yet instant.

## Licence

GPL-2.0-or-later. Bundles PixiJS (MIT) — see `assets/vendor/pixi-LICENSE.txt`.
