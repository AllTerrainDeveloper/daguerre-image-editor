var daguerre = function(exports) {
  "use strict";
  const IDENTITY_TRANSFORM = {
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipH: false,
    flipV: false
  };
  const MIN_CANVAS = 16;
  const MIN_SCALE = 0.02;
  const MAX_SCALE = 20;
  function isIdentityTransform(transform) {
    const e = 1e-4;
    return Math.abs(transform.x - 0.5) < e && Math.abs(transform.y - 0.5) < e && Math.abs(transform.scaleX - 1) < e && Math.abs(transform.scaleY - 1) < e && Math.abs(transform.rotation) < e && !transform.flipH && !transform.flipV;
  }
  function isNativeCanvas(canvas, source) {
    return Math.abs(canvas.width - source.width) < 1 && Math.abs(canvas.height - source.height) < 1;
  }
  function clampCanvas(canvas, maxPixels) {
    let width = Math.max(MIN_CANVAS, Math.round(canvas.width) || MIN_CANVAS);
    let height = Math.max(MIN_CANVAS, Math.round(canvas.height) || MIN_CANVAS);
    const total = width * height;
    if (total > maxPixels) {
      const factor = Math.sqrt(maxPixels / total);
      width = Math.max(MIN_CANVAS, Math.floor(width * factor));
      height = Math.max(MIN_CANVAS, Math.floor(height * factor));
    }
    return { width, height };
  }
  function clampTransform(transform) {
    const axis = (value) => Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Number.isFinite(value) ? value : 1)
    );
    return {
      x: Number.isFinite(transform.x) ? transform.x : 0.5,
      y: Number.isFinite(transform.y) ? transform.y : 0.5,
      scaleX: axis(transform.scaleX),
      scaleY: axis(transform.scaleY),
      rotation: Number.isFinite(transform.rotation) ? normaliseAngle(transform.rotation) : 0,
      flipH: transform.flipH === true,
      flipV: transform.flipV === true
    };
  }
  function normaliseAngle(degrees) {
    let angle = degrees % 360;
    if (angle > 180) {
      angle -= 360;
    }
    if (angle <= -180) {
      angle += 360;
    }
    return angle;
  }
  function fitScale(source, canvas) {
    if (source.width <= 0 || source.height <= 0) {
      return 1;
    }
    return Math.min(canvas.width / source.width, canvas.height / source.height);
  }
  function coverScale(source, canvas) {
    if (source.width <= 0 || source.height <= 0) {
      return 1;
    }
    return Math.max(canvas.width / source.width, canvas.height / source.height);
  }
  function applyCrop(canvas, transform, rect) {
    const next = {
      width: Math.max(MIN_CANVAS, Math.round(canvas.width * rect.w)),
      height: Math.max(MIN_CANVAS, Math.round(canvas.height * rect.h))
    };
    const centreX = transform.x * canvas.width - rect.x * canvas.width;
    const centreY = transform.y * canvas.height - rect.y * canvas.height;
    return {
      canvas: next,
      transform: {
        ...transform,
        x: centreX / (canvas.width * rect.w),
        y: centreY / (canvas.height * rect.h)
      }
    };
  }
  function resizeCanvas(canvas, transform, next, anchor = { x: 0.5, y: 0.5 }) {
    const offsetX = (next.width - canvas.width) * anchor.x;
    const offsetY = (next.height - canvas.height) * anchor.y;
    const centreX = transform.x * canvas.width + offsetX;
    const centreY = transform.y * canvas.height + offsetY;
    return {
      canvas: next,
      transform: {
        ...transform,
        x: next.width === 0 ? 0.5 : centreX / next.width,
        y: next.height === 0 ? 0.5 : centreY / next.height
      }
    };
  }
  function normaliseCanvas(raw, fallback) {
    if (!raw || typeof raw !== "object") {
      return { ...fallback };
    }
    const input = raw;
    const width = Number(input.width);
    const height = Number(input.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return { ...fallback };
    }
    if (width <= 0 || height <= 0) {
      return { width: 0, height: 0 };
    }
    return {
      width: Math.max(MIN_CANVAS, Math.round(width)),
      height: Math.max(MIN_CANVAS, Math.round(height))
    };
  }
  function normaliseTransform(raw) {
    if (!raw || typeof raw !== "object") {
      return { ...IDENTITY_TRANSFORM };
    }
    const input = raw;
    const legacy = raw.scale;
    const uniform = Number.isFinite(Number(legacy)) ? Number(legacy) : 1;
    return clampTransform({
      x: Number(input.x ?? 0.5),
      y: Number(input.y ?? 0.5),
      scaleX: Number(input.scaleX ?? uniform),
      scaleY: Number(input.scaleY ?? uniform),
      rotation: Number(input.rotation ?? 0),
      flipH: input.flipH === true,
      flipV: input.flipV === true
    });
  }
  function centredCrop(aspect, canvasAspect) {
    if (!Number.isFinite(aspect) || aspect <= 0) {
      return { x: 0, y: 0, w: 1, h: 1 };
    }
    const relative = aspect / canvasAspect;
    if (relative >= 1) {
      const h = 1 / relative;
      return { x: 0, y: (1 - h) / 2, w: 1, h };
    }
    return { x: (1 - relative) / 2, y: 0, w: relative, h: 1 };
  }
  function clampRect(rect) {
    const min = 0.01;
    const w = Math.min(1, Math.max(min, rect.w));
    const h = Math.min(1, Math.max(min, rect.h));
    return {
      x: Math.min(1 - w, Math.max(0, rect.x)),
      y: Math.min(1 - h, Math.max(0, rect.y)),
      w,
      h
    };
  }
  const BASE_LAYER_ID = "base";
  function createImageLayer(name) {
    return {
      id: BASE_LAYER_ID,
      name,
      kind: "image",
      transform: { ...IDENTITY_TRANSFORM },
      visible: true,
      opacity: 1
    };
  }
  function createRasterLayer(name, transform = {}) {
    return {
      id: `layer-${Math.random().toString(36).slice(2, 10)}`,
      name,
      kind: "raster",
      transform: { ...IDENTITY_TRANSFORM, ...transform },
      visible: true,
      opacity: 1
    };
  }
  function normaliseLayers(raw, fallback = "Image") {
    if (!Array.isArray(raw) || raw.length === 0) {
      return [createImageLayer(fallback)];
    }
    const layers = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const layer = entry;
      const opacity = Number(layer.opacity ?? 1);
      layers.push({
        id: typeof layer.id === "string" && layer.id ? layer.id : createRasterLayer("").id,
        name: typeof layer.name === "string" ? layer.name : fallback,
        kind: layer.kind === "raster" ? "raster" : "image",
        transform: normaliseTransform(layer.transform),
        visible: layer.visible !== false,
        opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1
      });
    }
    return layers.length > 0 ? layers : [createImageLayer(fallback)];
  }
  function findLayer(layers, id) {
    return layers.find((layer) => layer.id === id);
  }
  function updateLayer(layers, id, patch) {
    return layers.map(
      (layer) => layer.id === id ? { ...layer, ...patch } : layer
    );
  }
  function reorderLayer(layers, id, direction) {
    const index = layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= layers.length) {
      return layers;
    }
    const next = [...layers];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return next;
  }
  const IDENTITY_LEVELS = { black: 0, white: 255, gamma: 1 };
  const LINEAR_CURVE = [
    [0, 0],
    [255, 255]
  ];
  function isIdentityCurves(curves) {
    if (!curves) {
      return true;
    }
    return ["rgb", "r", "g", "b"].every(
      (channel) => isLinear(curves[channel])
    );
  }
  function isLinear(points) {
    if (!points || points.length === 0) {
      return true;
    }
    return points.every(([x, y]) => Math.abs(x - y) < 0.5);
  }
  function isIdentityLevels(levels) {
    if (!levels) {
      return true;
    }
    return levels.black <= 0 && levels.white >= 255 && Math.abs(levels.gamma - 1) < 1e-6;
  }
  function normaliseCurve(points) {
    if (!points || points.length < 2) {
      return LINEAR_CURVE.map((p) => [...p]);
    }
    const clamped = points.map(
      ([x, y]) => [
        Math.min(255, Math.max(0, Math.round(x))),
        Math.min(255, Math.max(0, Math.round(y)))
      ]
    ).sort((a, b) => a[0] - b[0]);
    const unique = [];
    for (const point of clamped) {
      const last = unique[unique.length - 1];
      if (last && last[0] === point[0]) {
        unique[unique.length - 1] = point;
        continue;
      }
      unique.push(point);
    }
    if (unique.length < 2) {
      return LINEAR_CURVE.map((p) => [...p]);
    }
    return unique;
  }
  function sampleCurve(points) {
    const curve = normaliseCurve(points);
    const out = new Uint8ClampedArray(256);
    const n = curve.length;
    const deltas = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = curve[i + 1][0] - curve[i][0];
      deltas.push(dx === 0 ? 0 : (curve[i + 1][1] - curve[i][1]) / dx);
    }
    const tangents = new Array(n);
    tangents[0] = deltas[0];
    tangents[n - 1] = deltas[n - 2];
    for (let i = 1; i < n - 1; i++) {
      tangents[i] = deltas[i - 1] * deltas[i] <= 0 ? 0 : (deltas[i - 1] + deltas[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (deltas[i] === 0) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
        continue;
      }
      const a = tangents[i] / deltas[i];
      const b = tangents[i + 1] / deltas[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * a * deltas[i];
        tangents[i + 1] = t * b * deltas[i];
      }
    }
    let segment = 0;
    for (let x = 0; x < 256; x++) {
      if (x <= curve[0][0]) {
        out[x] = curve[0][1];
        continue;
      }
      if (x >= curve[n - 1][0]) {
        out[x] = curve[n - 1][1];
        continue;
      }
      while (segment < n - 2 && x > curve[segment + 1][0]) {
        segment++;
      }
      const [x0, y0] = curve[segment];
      const [x1, y1] = curve[segment + 1];
      const h = x1 - x0;
      const t = (x - x0) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      out[x] = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * tangents[segment] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * tangents[segment + 1];
    }
    return out;
  }
  function sampleLevels(levels) {
    const out = new Uint8ClampedArray(256);
    const black = Math.min(254, Math.max(0, levels.black));
    const white = Math.max(black + 1, Math.min(255, levels.white));
    const gamma = Math.min(10, Math.max(0.1, levels.gamma));
    const span = white - black;
    for (let x = 0; x < 256; x++) {
      const normalised = Math.min(1, Math.max(0, (x - black) / span));
      out[x] = Math.pow(normalised, 1 / gamma) * 255;
    }
    return out;
  }
  function buildLut(curves, levels) {
    const base = levels && !isIdentityLevels(levels) ? sampleLevels(levels) : identityRamp();
    const master = isLinear(curves?.rgb) ? null : sampleCurve(curves.rgb);
    const channels = ["r", "g", "b"].map(
      (channel) => isLinear(curves?.[channel]) ? null : sampleCurve(curves[channel])
    );
    const lut = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const afterLevels = base[i];
      const afterMaster = master ? master[afterLevels] : afterLevels;
      for (let c = 0; c < 3; c++) {
        const channel = channels[c];
        lut[i * 4 + c] = channel ? channel[afterMaster] : afterMaster;
      }
      lut[i * 4 + 3] = i;
    }
    return lut;
  }
  function identityRamp() {
    const ramp = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      ramp[i] = i;
    }
    return ramp;
  }
  const RECIPE_VERSION = 5;
  const MATRIX_OP_ORDER = [
    "exposure",
    "contrast",
    "temperature",
    "tint",
    "saturation",
    "hue"
  ];
  const PANEL_OP_ORDER = [
    "exposure",
    "contrast",
    "temperature",
    "tint",
    "saturation",
    "vibrance",
    "hue"
  ];
  const EFFECT_OP_ORDER = ["sharpen", "blur", "vignette", "grain"];
  const OP_LABELS = {
    exposure: "Exposure",
    contrast: "Contrast",
    saturation: "Saturation",
    vibrance: "Vibrance",
    temperature: "Temperature",
    tint: "Tint",
    hue: "Hue",
    sharpen: "Sharpen",
    blur: "Blur",
    vignette: "Vignette",
    grain: "Grain"
  };
  function defaultRecipe(source, canvas) {
    return {
      version: RECIPE_VERSION,
      source,
      ops: [],
      // Zero means "not sized yet"; the editor fills it from the image on open.
      canvas: canvas ? { ...canvas } : { width: 0, height: 0 },
      layers: [createImageLayer("Image")],
      activeLayerId: BASE_LAYER_ID,
      curves: {},
      levels: { ...IDENTITY_LEVELS },
      output: { format: "image/jpeg", quality: 0.92 }
    };
  }
  function getOp(recipe, type, schema) {
    const op = recipe.ops.find((candidate) => candidate.type === type);
    if (op) {
      return op.v;
    }
    return schema[type]?.default ?? 0;
  }
  function setOp(recipe, type, value, schema) {
    const spec = schema[type];
    const clamped = spec ? Math.min(spec.max, Math.max(spec.min, value)) : value;
    const isDefault = spec !== void 0 && Math.abs(clamped - spec.default) < 1e-9;
    const ops = recipe.ops.filter((op) => op.type !== type);
    if (!isDefault) {
      ops.push({ type, v: clamped });
    }
    ops.sort(
      (a, b) => PANEL_OP_ORDER.indexOf(a.type) - PANEL_OP_ORDER.indexOf(b.type)
    );
    return { ...recipe, ops };
  }
  function resetOps(recipe, nativeCanvas) {
    return {
      ...recipe,
      ops: [],
      canvas: nativeCanvas ? { ...nativeCanvas } : recipe.canvas,
      // Reset drops added layers along with everything else; the base image is
      // what "reset" means.
      layers: [createImageLayer(recipe.layers[0]?.name ?? "Image")],
      activeLayerId: BASE_LAYER_ID,
      curves: {},
      levels: { ...IDENTITY_LEVELS }
    };
  }
  function setLayer(recipe, transform) {
    return {
      ...recipe,
      layers: updateLayer(recipe.layers, recipe.activeLayerId, {
        transform: normaliseTransform(transform)
      })
    };
  }
  function setLayers(recipe, layers, active) {
    const stack = layers.length > 0 ? layers : recipe.layers;
    const activeLayerId = active && stack.some((layer) => layer.id === active) ? active : stack.some((layer) => layer.id === recipe.activeLayerId) ? recipe.activeLayerId : stack[stack.length - 1].id;
    return { ...recipe, layers: stack, activeLayerId };
  }
  function activeLayer(recipe) {
    return findLayer(recipe.layers, recipe.activeLayerId) ?? recipe.layers[0];
  }
  function setDocument(recipe, canvas, transform) {
    return {
      ...recipe,
      canvas: normaliseCanvas(canvas, recipe.canvas),
      layers: updateLayer(recipe.layers, recipe.activeLayerId, {
        transform: normaliseTransform(transform)
      })
    };
  }
  function setCurve(recipe, channel, points) {
    const curves = { ...recipe.curves };
    if (!points) {
      delete curves[channel];
    } else {
      curves[channel] = normaliseCurve(points);
    }
    return { ...recipe, curves };
  }
  function setLevels(recipe, levels) {
    return { ...recipe, levels };
  }
  function isIdentity(recipe, source) {
    const untouchedCanvas = !source || recipe.canvas.width === 0 || isNativeCanvas(recipe.canvas, source);
    return recipe.ops.length === 0 && untouchedCanvas && recipe.layers.length === 1 && recipe.layers[0].kind === "image" && isIdentityTransform(recipe.layers[0].transform) && isIdentityCurves(recipe.curves) && isIdentityLevels(recipe.levels);
  }
  function migrateRecipe(raw) {
    const version2 = Number(raw.version ?? 1);
    if (version2 >= RECIPE_VERSION) {
      return raw;
    }
    if (version2 >= 3) {
      const single = raw;
      return {
        ...raw,
        version: RECIPE_VERSION,
        layers: single.layers ?? [
          {
            ...createImageLayer("Image"),
            transform: normaliseTransform(single.layer)
          }
        ],
        activeLayerId: BASE_LAYER_ID
      };
    }
    const geometry = raw.geometry ?? {};
    const migrated = { ...raw };
    delete migrated.geometry;
    migrated.version = RECIPE_VERSION;
    migrated.canvas = { width: 0, height: 0 };
    migrated.activeLayerId = BASE_LAYER_ID;
    migrated.layers = [
      {
        ...createImageLayer("Image"),
        transform: {
          ...IDENTITY_TRANSFORM,
          rotation: Number(geometry.rotate ?? 0) + Number(geometry.straighten ?? 0) || 0,
          flipH: geometry.flipH === true,
          flipV: geometry.flipV === true
        }
      }
    ];
    return migrated;
  }
  function validateRecipe(raw, schema) {
    let input = raw;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        throw new Error("The edit recipe was not valid JSON.");
      }
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("The edit recipe must be an object.");
    }
    const rawVersion = Number(input.version ?? 0);
    if (!Number.isInteger(rawVersion) || rawVersion < 1 || rawVersion > RECIPE_VERSION) {
      throw new Error(`Unsupported recipe version ${rawVersion}.`);
    }
    const candidate = migrateRecipe(
      input
    );
    const source = Number(candidate.source ?? 0);
    if (!Number.isInteger(source) || source <= 0) {
      throw new Error("The edit recipe must name the attachment its pixels came from.");
    }
    const rawOps = candidate.ops;
    if (rawOps !== void 0 && !Array.isArray(rawOps)) {
      throw new Error("The edit recipe operations must be a list.");
    }
    const ops = [];
    const seen = /* @__PURE__ */ new Set();
    for (const op of rawOps ?? []) {
      if (!op || typeof op !== "object" || typeof op.type !== "string") {
        throw new Error("Every recipe operation must be an object with a type.");
      }
      const spec = schema[op.type];
      if (!spec) {
        throw new Error(`Unknown recipe operation "${op.type}".`);
      }
      if (seen.has(op.type)) {
        throw new Error(`Recipe operation "${op.type}" appears more than once.`);
      }
      const value = Number(op.v);
      if (!Number.isFinite(value)) {
        throw new Error(`Recipe operation "${op.type}" is missing a numeric value.`);
      }
      if (value < spec.min || value > spec.max) {
        throw new Error(
          `Recipe operation "${op.type}" must be between ${spec.min} and ${spec.max}.`
        );
      }
      seen.add(op.type);
      if (Math.abs(value - spec.default) < 1e-9) {
        continue;
      }
      ops.push({ type: op.type, v: value });
    }
    const output = candidate.output ?? {};
    const format = typeof output.format === "string" ? output.format : "image/jpeg";
    const quality = Number(output.quality ?? 0.92);
    if (!Number.isFinite(quality) || quality < 0.1 || quality > 1) {
      throw new Error("Output quality must be between 0.1 and 1.0.");
    }
    ops.sort(
      (a, b) => PANEL_OP_ORDER.indexOf(a.type) - PANEL_OP_ORDER.indexOf(b.type)
    );
    const layers = normaliseLayers(candidate.layers);
    const activeLayerId = layers.some((layer) => layer.id === candidate.activeLayerId) ? candidate.activeLayerId : layers[layers.length - 1].id;
    return {
      version: RECIPE_VERSION,
      source,
      ops,
      canvas: normaliseCanvas(candidate.canvas, { width: 0, height: 0 }),
      layers,
      activeLayerId,
      curves: normaliseCurves(candidate.curves),
      levels: normaliseLevels(candidate.levels),
      output: { format, quality }
    };
  }
  function normaliseCurves(raw) {
    if (!raw || typeof raw !== "object") {
      return {};
    }
    const input = raw;
    const out = {};
    for (const channel of ["rgb", "r", "g", "b"]) {
      const points = input[channel];
      if (!Array.isArray(points) || points.length < 2) {
        continue;
      }
      const normalised = normaliseCurve(points);
      if (normalised.every(([x, y]) => Math.abs(x - y) < 0.5)) {
        continue;
      }
      out[channel] = normalised;
    }
    return out;
  }
  function normaliseLevels(raw) {
    if (!raw || typeof raw !== "object") {
      return { ...IDENTITY_LEVELS };
    }
    const input = raw;
    const black = Number(input.black ?? 0);
    const white = Number(input.white ?? 255);
    const gamma = Number(input.gamma ?? 1);
    const safeBlack = Number.isFinite(black) ? Math.min(254, Math.max(0, black)) : 0;
    const safeWhite = Number.isFinite(white) ? Math.min(255, Math.max(safeBlack + 1, white)) : 255;
    return {
      black: safeBlack,
      white: safeWhite,
      gamma: Number.isFinite(gamma) ? Math.min(10, Math.max(0.1, gamma)) : 1
    };
  }
  const LUMA_R = 0.2126;
  const LUMA_G = 0.7152;
  const LUMA_B = 0.0722;
  const IDENTITY = [
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0
  ];
  function multiply(b, a) {
    const out = new Array(20).fill(0);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += b[row * 5 + k] * a[k * 5 + col];
        }
        if (col === 4) {
          sum += b[row * 5 + 4];
        }
        out[row * 5 + col] = sum;
      }
    }
    return out;
  }
  function exposureMatrix(v) {
    const scale = Math.pow(2, v * 2);
    return [
      scale,
      0,
      0,
      0,
      0,
      0,
      scale,
      0,
      0,
      0,
      0,
      0,
      scale,
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function contrastMatrix(v) {
    const c = 1 + v;
    const offset = 0.5 * (1 - c);
    return [
      c,
      0,
      0,
      0,
      offset,
      0,
      c,
      0,
      0,
      offset,
      0,
      0,
      c,
      0,
      offset,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function saturationMatrix(v) {
    const s = 1 + v;
    const ir = LUMA_R * (1 - s);
    const ig = LUMA_G * (1 - s);
    const ib = LUMA_B * (1 - s);
    return [
      ir + s,
      ig,
      ib,
      0,
      0,
      ir,
      ig + s,
      ib,
      0,
      0,
      ir,
      ig,
      ib + s,
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function multiply3(b, a) {
    const out = new Array(9).fill(0);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) {
          sum += b[row * 3 + k] * a[k * 3 + col];
        }
        out[row * 3 + col] = sum;
      }
    }
    return out;
  }
  const LUMA_PROJECTION = [
    LUMA_R,
    LUMA_G,
    LUMA_B,
    LUMA_R,
    LUMA_G,
    LUMA_B,
    LUMA_R,
    LUMA_G,
    LUMA_B
  ];
  const CHROMA_PROJECTION = [
    1 - LUMA_R,
    -LUMA_G,
    -LUMA_B,
    -LUMA_R,
    1 - LUMA_G,
    -LUMA_B,
    -LUMA_R,
    -LUMA_G,
    1 - LUMA_B
  ];
  const NEUTRAL_AXIS_CROSS = (() => {
    const n = 1 / Math.sqrt(3);
    return [0, -n, n, n, 0, -n, -n, n, 0];
  })();
  const CHROMA_QUARTER_TURN = multiply3(CHROMA_PROJECTION, NEUTRAL_AXIS_CROSS);
  function hueMatrix(degrees) {
    const radians = degrees * Math.PI / 180;
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const m = new Array(9);
    for (let i = 0; i < 9; i++) {
      m[i] = LUMA_PROJECTION[i] + c * CHROMA_PROJECTION[i] + s * CHROMA_QUARTER_TURN[i];
    }
    return [
      m[0],
      m[1],
      m[2],
      0,
      0,
      m[3],
      m[4],
      m[5],
      0,
      0,
      m[6],
      m[7],
      m[8],
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function temperatureMatrix(v) {
    const r = 1 + 0.2 * v;
    const b = 1 - 0.2 * v;
    return [
      r,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      b,
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function tintMatrix(v) {
    const g = 1 - 0.15 * v;
    const rb = 1 + 0.075 * v;
    return [
      rb,
      0,
      0,
      0,
      0,
      0,
      g,
      0,
      0,
      0,
      0,
      0,
      rb,
      0,
      0,
      0,
      0,
      0,
      1,
      0
    ];
  }
  function matrixForOp(type, v) {
    switch (type) {
      case "exposure":
        return exposureMatrix(v);
      case "contrast":
        return contrastMatrix(v);
      case "saturation":
        return saturationMatrix(v);
      case "temperature":
        return temperatureMatrix(v);
      case "tint":
        return tintMatrix(v);
      case "hue":
        return hueMatrix(v);
      default:
        return IDENTITY;
    }
  }
  function composeAdjustments(ops, schema) {
    const byType = /* @__PURE__ */ new Map();
    for (const op of ops) {
      byType.set(op.type, op.v);
    }
    let matrix = IDENTITY;
    for (const type of MATRIX_OP_ORDER) {
      const value = byType.get(type);
      if (value === void 0) {
        continue;
      }
      const rest = schema[type]?.default ?? 0;
      if (Math.abs(value - rest) < 1e-9) {
        continue;
      }
      matrix = multiply(matrixForOp(type, value), matrix);
    }
    return {
      matrix,
      vibrance: byType.get("vibrance") ?? 0,
      sharpen: byType.get("sharpen") ?? 0,
      vignette: byType.get("vignette") ?? 0,
      grain: byType.get("grain") ?? 0,
      blur: byType.get("blur") ?? 0
    };
  }
  const LUMA_R_256 = 55;
  const LUMA_G_256 = 183;
  const LUMA_B_256 = 18;
  function histogramPeak(channels) {
    let interior = 0;
    let overall = 0;
    for (const bins of channels) {
      for (let i = 0; i < 256; i++) {
        const count = bins[i];
        if (count > overall) {
          overall = count;
        }
        if (i > 0 && i < 255 && count > interior) {
          interior = count;
        }
      }
    }
    return interior > 0 ? interior : overall;
  }
  function computeHistogram(pixels) {
    const r = new Uint32Array(256);
    const g = new Uint32Array(256);
    const b = new Uint32Array(256);
    const luma = new Uint32Array(256);
    let total = 0;
    for (let i = 0; i + 3 < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) {
        continue;
      }
      const red = pixels[i];
      const green = pixels[i + 1];
      const blue = pixels[i + 2];
      r[red]++;
      g[green]++;
      b[blue]++;
      luma[LUMA_R_256 * red + LUMA_G_256 * green + LUMA_B_256 * blue >> 8]++;
      total++;
    }
    return { r, g, b, luma, total, peak: histogramPeak([r, g, b, luma]) };
  }
  function emptyHistogram() {
    return {
      r: new Uint32Array(256),
      g: new Uint32Array(256),
      b: new Uint32Array(256),
      luma: new Uint32Array(256),
      total: 0,
      peak: 0
    };
  }
  const MODULE_ID = "pixijs";
  function shell() {
    return window.wp?.desktop;
  }
  async function loadPixi() {
    if (window.PIXI) {
      return window.PIXI;
    }
    const desktop2 = shell();
    if (!desktop2?.loadModules) {
      throw new Error(
        "Daguerre needs Desktop Mode: PixiJS comes from the desktop shell, which is not on this page."
      );
    }
    await desktop2.loadModules([MODULE_ID]);
    if (!window.PIXI) {
      throw new Error(
        "Desktop Mode loaded its PixiJS module but window.PIXI is still undefined."
      );
    }
    return window.PIXI;
  }
  const ADJUST_VERT = (
    /* glsl */
    `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
	vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

	position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
	position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

	return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
	return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
	gl_Position = filterVertexPosition();
	vTextureCoord = filterTextureCoord();
}
`
  );
  const ADJUST_FRAG = (
    /* glsl */
    `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLut;

/*
 * Filter-stage uniforms Pixi supplies. uInputClamp carries the valid texture
 * coordinates of the filtered area as (minX, minY, maxX, maxY), which is how the
 * vignette finds the centre of the image rather than of whatever padding the
 * filter system allocated around it.
 *
 * uOutputFrame is deliberately not used here: it is a vertex-stage uniform, and
 * declaring it in the fragment shader stops the program linking.
 */
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;

uniform float uColorMatrix[20];
uniform float uVibrance;
uniform float uLutMix;
uniform float uSharpen;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

/**
 * Scales saturation by how unsaturated a pixel already is.
 *
 * Vibrance is the one adjustment that cannot join the colour matrix: the amount of
 * the effect depends on the pixel, so it is not a linear transform. Muted colours
 * get the full push while already-vivid ones are left alone, which is what stops a
 * saturation boost from turning a red jacket into a solid block.
 */
vec3 applyVibrance( vec3 color, float amount )
{
	float mx = max( color.r, max( color.g, color.b ) );
	float mn = min( color.r, min( color.g, color.b ) );
	float chroma = mx - mn;
	float luma = dot( color, LUMA );

	float scale = 1.0 + amount * ( 1.0 - chroma );

	return mix( vec3( luma ), color, scale );
}

/**
 * Cheap hash for film grain.
 *
 * Deterministic in screen space and seeded per render, so the grain is stable while
 * a slider is dragged rather than crawling, but a save does not reproduce the exact
 * pattern the preview showed -- which nobody can tell apart and which costs nothing.
 */
float hash( vec2 p )
{
	return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

void main( void )
{
	vec4 color = texture( uTexture, vTextureCoord );

	if ( uSharpen > 0.0 ) {
		// Unsharp mask: subtract a small blur, add the difference back.
		//
		// The offset is one texel of the *render target*, so the effect scales with
		// whatever is being drawn. That is what keeps a sharpen previewed at 900px
		// looking the same when saved at 6000px, instead of vanishing.
		vec2 texel = uInputSize.zw;

		vec4 blurred =
			texture( uTexture, vTextureCoord + vec2( texel.x, 0.0 ) ) +
			texture( uTexture, vTextureCoord - vec2( texel.x, 0.0 ) ) +
			texture( uTexture, vTextureCoord + vec2( 0.0, texel.y ) ) +
			texture( uTexture, vTextureCoord - vec2( 0.0, texel.y ) );

		blurred *= 0.25;

		color += ( color - blurred ) * uSharpen * 1.5;
	}

	if ( color.a > 0.0 ) {
		color.rgb /= color.a;
	}

	vec4 result;

	result.r = uColorMatrix[0] * color.r + uColorMatrix[1] * color.g
		+ uColorMatrix[2] * color.b + uColorMatrix[3] * color.a + uColorMatrix[4];
	result.g = uColorMatrix[5] * color.r + uColorMatrix[6] * color.g
		+ uColorMatrix[7] * color.b + uColorMatrix[8] * color.a + uColorMatrix[9];
	result.b = uColorMatrix[10] * color.r + uColorMatrix[11] * color.g
		+ uColorMatrix[12] * color.b + uColorMatrix[13] * color.a + uColorMatrix[14];
	result.a = uColorMatrix[15] * color.r + uColorMatrix[16] * color.g
		+ uColorMatrix[17] * color.b + uColorMatrix[18] * color.a + uColorMatrix[19];

	if ( uVibrance != 0.0 ) {
		result.rgb = applyVibrance( clamp( result.rgb, 0.0, 1.0 ), uVibrance );
	}

	result.rgb = clamp( result.rgb, 0.0, 1.0 );

	if ( uVignette != 0.0 || uGrain > 0.0 ) {
		// Position across the filtered area, 0..1, independent of any padding the
		// filter system added around it.
		vec2 span = max( uInputClamp.zw - uInputClamp.xy, vec2( 1e-6 ) );
		vec2 uv = ( vTextureCoord - uInputClamp.xy ) / span;

		if ( uVignette != 0.0 ) {
			// Distance from centre, normalised so the corners sit at 1.
			float d = length( uv - 0.5 ) / 0.7071;
			float falloff = smoothstep( 0.35, 1.0, d );

			result.rgb *= 1.0 - falloff * uVignette;
		}

		if ( uGrain > 0.0 ) {
			float noise = hash( gl_FragCoord.xy + uSeed ) - 0.5;

			// Weighted towards the midtones. Grain in a blown highlight or a
			// crushed shadow only reads as sensor noise, never as film.
			float luma = dot( result.rgb, LUMA );
			float weight = 1.0 - abs( luma - 0.5 ) * 2.0;

			result.rgb += noise * uGrain * 0.25 * weight;
		}

		result.rgb = clamp( result.rgb, 0.0, 1.0 );
	}

	if ( uLutMix > 0.0 ) {
		// One fetch per channel: levels, the master curve and the per-channel curve
		// are all baked into this table before it is uploaded.
		//
		// Sampled at (v * 255 + 0.5) / 256 rather than at v. A 256-texel table's
		// texel centres sit at those half-offsets, and sampling at v instead would
		// land on a boundary and blend two neighbouring entries -- turning an
		// intentionally hard step in a curve into a soft one.
		vec3 coord = ( result.rgb * 255.0 + 0.5 ) / 256.0;

		result.r = texture( uLut, vec2( coord.r, 0.5 ) ).r;
		result.g = texture( uLut, vec2( coord.g, 0.5 ) ).g;
		result.b = texture( uLut, vec2( coord.b, 0.5 ) ).b;
	}

	finalColor = vec4( result.rgb * result.a, result.a );
}
`
  );
  const HISTOGRAM_EDGE = 256;
  const HISTOGRAM_BUDGET_MS = 8;
  const HISTOGRAM_MAX_SKIP = 4;
  class EditorRenderer {
    constructor(pixi, app, options) {
      this.texture = null;
      this.sprite = null;
      this.filter = null;
      this.uniforms = {
        matrix: [],
        vibrance: 0,
        sharpen: 0,
        vignette: 0,
        grain: 0,
        blur: 0
      };
      this.blurFilter = null;
      this.canvas = { width: 0, height: 0 };
      this.layers = [];
      this.activeLayerId = "";
      this.layerTextures = /* @__PURE__ */ new Map();
      this.paintMask = null;
      this.solid = null;
      this.lut = null;
      this.documentTexture = null;
      this.lutActive = false;
      this.seed = Math.floor(Math.random() * 1e3);
      this.bypass = false;
      this.histogramFrame = null;
      this.histogramSkip = 0;
      this.histogramListeners = /* @__PURE__ */ new Set();
      this.viewportListeners = /* @__PURE__ */ new Set();
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.resizeObserver = null;
      this.destroyed = false;
      this.pixi = pixi;
      this.app = app;
      this.host = options.host;
      this.schema = options.schema;
      this.maxRenderPixels = options.maxRenderPixels;
    }
    /**
     * Boots Pixi and attaches a canvas to the host element.
     *
     * WebGL is requested explicitly rather than letting Pixi prefer WebGPU. The
     * adjustment filter ships a GLSL program only, and Pixi silently *skips* a
     * filter that has no program for the active backend -- which would show the
     * unedited image with no error at all. Pinning the backend makes that
     * impossible. Adding a WGSL program later is what would lift this.
     *
     * @param options Renderer options.
     */
    static async create(options) {
      const pixi = await loadPixi();
      const app = new pixi.Application();
      await app.init({
        preference: "webgl",
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1
      });
      app.canvas.classList.add("dg-canvas");
      options.host.appendChild(app.canvas);
      const renderer = new EditorRenderer(pixi, app, options);
      renderer.syncSurface();
      renderer.observeResize();
      return renderer;
    }
    /**
     * Re-fits whenever the host element changes size.
     *
     * A ResizeObserver rather than Pixi's own `resizeTo`, which only listens for
     * *window* resizes. Hiding the sidebar changes the stage's width without the
     * window changing at all, so `resizeTo` never fired -- the renderer kept drawing
     * into the old coordinate space while CSS stretched the canvas element to the
     * new width. The picture ended up scaled and offset from its own handles.
     */
    observeResize() {
      if (typeof ResizeObserver === "undefined") {
        return;
      }
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(this.host);
    }
    /**
     * Matches the renderer's drawing surface to the host element.
     *
     * Called from `fit()` so there is exactly one place that can get this wrong,
     * and every path that repositions the image goes through it.
     *
     * @return The host's size in CSS pixels.
     */
    syncSurface() {
      const bounds = this.host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      const screen = this.app.renderer.screen;
      if (screen.width !== width || screen.height !== height) {
        this.app.renderer.resize(width, height);
      }
      return { width, height };
    }
    /**
     * Builds the single-pass adjustment filter.
     *
     * `uColorMatrix` is declared with `size: 20` so Pixi uploads it as a GLSL array
     * uniform rather than a scalar.
     */
    buildFilter() {
      const uniforms = new this.pixi.UniformGroup({
        uColorMatrix: {
          value: [
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0
          ],
          type: "f32",
          size: 20
        },
        uVibrance: { value: 0, type: "f32" },
        uLutMix: { value: 0, type: "f32" },
        uSharpen: { value: 0, type: "f32" },
        uVignette: { value: 0, type: "f32" },
        uGrain: { value: 0, type: "f32" },
        uSeed: { value: 0, type: "f32" }
      });
      return new this.pixi.Filter({
        glProgram: this.pixi.GlProgram.from({
          vertex: ADJUST_VERT,
          fragment: ADJUST_FRAG,
          name: "daguerre-adjust"
        }),
        resources: {
          adjustUniforms: uniforms,
          // A second texture needs both its source and its sampler style. Binding
          // only the source leaves the sampler unresolved and the program fails to
          // link -- which surfaces as "Could not initialize shader" and a blank
          // canvas, because Pixi silently skips a filter it could not compile.
          uLut: this.lutTexture().source,
          uLutSampler: this.lutTexture().source.style
        }
      });
    }
    /**
     * The tone lookup table texture, created on first use.
     *
     * Sampled with nearest-neighbour filtering. Linear filtering would blend
     * adjacent entries and quietly soften any hard step a user deliberately put in
     * a curve.
     */
    lutTexture() {
      if (!this.lut) {
        this.lut = new this.pixi.Texture({
          source: new this.pixi.BufferImageSource({
            resource: buildLut(),
            width: 256,
            height: 1,
            scaleMode: "nearest",
            alphaMode: "premultiply-alpha-on-upload"
          })
        });
      }
      return this.lut;
    }
    /**
     * Rebuilds the tone table from curves and levels.
     *
     * @param curves Curve set.
     * @param levels Levels.
     */
    setTone(curves, levels) {
      const identity = isIdentityCurves(curves) && isIdentityLevels(levels);
      const texture = this.lutTexture();
      const source = texture.source;
      source.resource.set(buildLut(curves, levels));
      source.update();
      this.lutActive = !identity;
      this.applyUniforms();
      this.scheduleHistogram();
    }
    /**
     * Replaces the document and recomposes it.
     *
     * @param canvas Output surface size.
     * @param layer  Where the image sits on it.
     */
    setDocument(canvas, layers, activeLayerId) {
      this.canvas = clampCanvas(canvas, this.maxRenderPixels);
      this.layers = layers;
      this.activeLayerId = activeLayerId;
      this.releaseOrphanTextures();
      this.composeDocument();
      this.fit();
      this.scheduleHistogram();
    }
    /**
     * Frees textures for layers that no longer exist.
     *
     * Without this, deleting a pasted layer would leave its pixels on the GPU for
     * the lifetime of the editor.
     */
    releaseOrphanTextures() {
      const live = new Set(this.layers.map((layer) => layer.id));
      for (const [id, texture] of this.layerTextures) {
        if (live.has(id) || id === BASE_LAYER_ID) {
          continue;
        }
        texture.destroy(true);
        this.layerTextures.delete(id);
      }
    }
    /**
     * Creates a raster layer's backing texture from an image.
     *
     * @param id     Layer id.
     * @param source Decoded pixels.
     */
    addRasterTexture(id, source) {
      this.layerTextures.get(id)?.destroy(true);
      this.layerTextures.set(id, this.pixi.Texture.from(source));
    }
    /**
     * Creates an empty paintable texture for a layer, canvas-sized.
     *
     * @param id Layer id.
     */
    ensurePaintTexture(id) {
      const existing = this.layerTextures.get(id);
      if (existing instanceof this.pixi.RenderTexture) {
        return existing;
      }
      const target = this.pixi.RenderTexture.create({
        width: Math.max(1, this.canvas.width),
        height: Math.max(1, this.canvas.height)
      });
      if (existing) {
        const sprite = new this.pixi.Sprite(existing);
        sprite.anchor.set(0.5);
        sprite.position.set(this.canvas.width / 2, this.canvas.height / 2);
        this.app.renderer.render({ container: sprite, target, clear: true });
        sprite.destroy();
        existing.destroy(true);
      }
      this.layerTextures.set(id, target);
      return target;
    }
    /**
     * Renders a display object into a layer's texture.
     *
     * This is how a brush stroke becomes permanent: the stroke is drawn once into
     * the layer and never re-drawn, so a long painting session costs the same per
     * frame as an empty one.
     *
     * @param id        Layer to paint into.
     * @param container What to draw.
     */
    paintInto(id, container) {
      const target = this.ensurePaintTexture(id);
      this.app.renderer.render({
        container,
        target,
        clear: false
      });
      this.composeDocument();
      this.scheduleHistogram();
    }
    /** The native size of whatever backs a layer. */
    layerTextureSize(id) {
      const texture = this.layerTextures.get(id);
      return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
    }
    /**
     * Sets the mask confining every paint operation.
     *
     * @param mask Canvas-sized alpha mask, or null for no confinement.
     */
    setPaintMask(mask) {
      this.paintMask?.destroy(true);
      this.paintMask = mask ? this.pixi.Texture.from(mask) : null;
    }
    /**
     * Wraps a sprite in the current selection mask, if there is one.
     *
     * Both the sprite and its mask have to be in the same rendered container, which
     * is why this returns a holder rather than just setting a property.
     *
     * @param sprite What to clip.
     * @return The container to render, and its teardown.
     */
    clipped(sprite) {
      const holder = new this.pixi.Container();
      holder.addChild(sprite);
      if (!this.paintMask) {
        return { container: holder, release: () => holder.destroy({ children: true }) };
      }
      const mask = new this.pixi.Sprite(this.paintMask);
      mask.position.set(0, 0);
      holder.addChild(mask);
      sprite.mask = mask;
      return {
        container: holder,
        release: () => {
          sprite.mask = null;
          holder.destroy({ children: true });
        }
      };
    }
    /**
     * Stamps one brush dab into a layer.
     *
     * The stamp is white with its shape in the alpha, tinted here -- so one cached
     * stamp serves every colour.
     *
     * @param layerId Target layer.
     * @param image   Stamp canvas.
     * @param x       Canvas coordinates of the dab centre.
     * @param y       Canvas coordinates of the dab centre.
     * @param size    Diameter in canvas pixels.
     * @param colour  CSS colour.
     * @param opacity 0..1.
     * @param erase   Whether to remove rather than add.
     */
    stampBrush(layerId, image, x, y, size, colour, opacity, erase) {
      const target = this.ensurePaintTexture(layerId);
      const texture = this.pixi.Texture.from(image);
      const sprite = new this.pixi.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.width = size;
      sprite.height = size;
      sprite.position.set(x, y);
      sprite.alpha = opacity;
      if (erase) {
        sprite.blendMode = "erase";
      } else {
        sprite.tint = colour;
      }
      const clip = this.clipped(sprite);
      this.app.renderer.render({ container: clip.container, target, clear: false });
      clip.release();
      texture.destroy(true);
      this.composeDocument();
      this.scheduleHistogram();
    }
    /**
     * Paints a full-canvas mask into a layer.
     *
     * @param layerId Target layer.
     * @param mask    Canvas-sized mask, opaque where the fill applies.
     * @param colour  CSS colour.
     * @param opacity 0..1.
     */
    fillWithMask(layerId, mask, colour, opacity) {
      const target = this.ensurePaintTexture(layerId);
      const texture = this.pixi.Texture.from(mask);
      const sprite = new this.pixi.Sprite(texture);
      sprite.position.set(0, 0);
      sprite.alpha = opacity;
      sprite.tint = colour;
      const clip = this.clipped(sprite);
      this.app.renderer.render({ container: clip.container, target, clear: false });
      clip.release();
      texture.destroy(true);
      this.composeDocument();
      this.scheduleHistogram();
    }
    /**
     * Composites a bitmap onto a layer.
     *
     * The shared destination for everything that is drawn with the 2D context rather
     * than with a brush stamp: gradients, shapes, text, and the retouching tools'
     * patches. Clipped by the selection like any other paint operation.
     *
     * @param layerId Target layer.
     * @param source  Bitmap to draw.
     * @param x       Where its top-left corner lands, in canvas pixels.
     * @param y       Where its top-left corner lands, in canvas pixels.
     * @param opacity 0..1.
     * @param erase   Whether to cut the shape out rather than draw it.
     */
    compositeCanvas(layerId, source, x = 0, y = 0, opacity = 1, erase = false) {
      const target = this.ensurePaintTexture(layerId);
      const texture = this.pixi.Texture.from(source);
      const sprite = new this.pixi.Sprite(texture);
      sprite.position.set(Math.round(x), Math.round(y));
      sprite.alpha = opacity;
      if (erase) {
        sprite.blendMode = "erase";
      }
      const clip = this.clipped(sprite);
      this.app.renderer.render({ container: clip.container, target, clear: false });
      clip.release();
      texture.destroy(true);
      this.composeDocument();
      this.scheduleHistogram();
    }
    /**
     * Reads one composed pixel.
     *
     * @param x Canvas coordinate.
     * @param y Canvas coordinate.
     * @return Channels 0..255, or null when there is nothing there.
     */
    samplePixel(x, y) {
      const read = this.readDocumentPixels();
      if (!read) {
        return null;
      }
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= read.width || py >= read.height) {
        return null;
      }
      const index = (py * read.width + px) * 4;
      return [
        read.pixels[index],
        read.pixels[index + 1],
        read.pixels[index + 2],
        read.pixels[index + 3]
      ];
    }
    /**
     * Reads one rectangle of a layer's pixels.
     *
     * Renders just that region into a small target rather than extracting the whole
     * texture and cropping: undo captures tiles constantly while a stroke is in
     * progress, and a full-texture transfer per tile would cost more than the painting.
     *
     * @param layerId Layer to read.
     * @param rect    Region, in canvas pixels.
     * @return The pixels, or null when the layer has no texture yet.
     */
    extractLayerRegion(layerId, rect) {
      const texture = this.layerTextures.get(layerId);
      if (!texture || rect.width < 1 || rect.height < 1) {
        return null;
      }
      const target = this.pixi.RenderTexture.create({
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      });
      const sprite = new this.pixi.Sprite(texture);
      sprite.position.set(-Math.round(rect.x), -Math.round(rect.y));
      this.app.renderer.render({ container: sprite, target, clear: true });
      const canvas = this.app.renderer.extract.canvas(target);
      sprite.destroy();
      target.destroy(true);
      return canvas;
    }
    /**
     * Puts one rectangle of a layer back to a previous state.
     *
     * The region is erased first and then redrawn, rather than drawn over. Drawing over
     * would composite the old pixels *onto* the new ones, so a stroke undone would
     * leave both visible -- and an empty region could never be restored at all, because
     * compositing nothing changes nothing.
     *
     * @param layerId Layer to write.
     * @param rect    Region, in canvas pixels.
     * @param pixels  What to put there, or null to leave it empty.
     */
    restoreLayerRegion(layerId, rect, pixels) {
      const target = this.ensurePaintTexture(layerId);
      const eraser = new this.pixi.Sprite(this.solidTexture());
      eraser.position.set(Math.round(rect.x), Math.round(rect.y));
      eraser.width = Math.round(rect.width);
      eraser.height = Math.round(rect.height);
      eraser.blendMode = "erase";
      this.renderDetached(eraser, target);
      if (pixels) {
        const texture = this.pixi.Texture.from(pixels);
        const sprite = new this.pixi.Sprite(texture);
        sprite.position.set(Math.round(rect.x), Math.round(rect.y));
        this.renderDetached(sprite, target);
        texture.destroy(true);
      }
      this.composeDocument();
      this.scheduleHistogram();
    }
    /**
     * Renders one sprite into a texture, honouring its blend mode.
     *
     * The wrapping container is not ceremony. A sprite passed as the render *root* is
     * its own render group, and the batcher never applies a root's blend mode -- so an
     * `erase` sprite rendered directly paints solid white instead of clearing, with no
     * error. `stampBrush()` only avoids this by accident, because the selection clipper
     * already wraps its sprite in a container. This makes the requirement explicit.
     *
     * @param sprite What to draw. Destroyed afterwards.
     * @param target Texture to draw into.
     */
    renderDetached(sprite, target) {
      const holder = new this.pixi.Container();
      holder.addChild(sprite);
      this.app.renderer.render({ container: holder, target, clear: false });
      holder.destroy({ children: true });
    }
    /**
     * A one-pixel opaque white texture, used as an eraser stencil.
     *
     * Built here rather than taken from `Texture.WHITE` so the narrow Pixi surface this
     * file is typed against stays narrow.
     */
    solidTexture() {
      if (!this.solid) {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 1, 1);
        }
        this.solid = this.pixi.Texture.from(canvas);
      }
      return this.solid;
    }
    /**
     * Reads the image alone, with every painted layer left out.
     *
     * What the history brush paints from. Composed on demand rather than snapshotted at
     * load, because holding a second full-resolution copy of a twenty-megapixel photo
     * for the whole session -- against the chance that one brush gets used -- is the
     * kind of cost that only shows up on someone else's machine.
     *
     * @return Canvas-aligned pixels, or null when nothing is loaded.
     */
    readPristinePixels() {
      const base = this.layerTextures.get(BASE_LAYER_ID) ?? this.texture;
      const layer = this.layers.find((entry) => entry.id === BASE_LAYER_ID);
      if (!base || !layer || this.canvas.width <= 0 || this.canvas.height <= 0) {
        return null;
      }
      const target = this.pixi.RenderTexture.create({
        width: this.canvas.width,
        height: this.canvas.height
      });
      const sprite = new this.pixi.Sprite(base);
      const { x, y, scaleX, scaleY, rotation, flipH, flipV } = layer.transform;
      sprite.anchor.set(0.5);
      sprite.scale.set(scaleX * (flipH ? -1 : 1), scaleY * (flipV ? -1 : 1));
      sprite.rotation = rotation * Math.PI / 180;
      sprite.position.set(x * this.canvas.width, y * this.canvas.height);
      this.app.renderer.render({ container: sprite, target, clear: true });
      const { pixels } = this.app.renderer.extract.pixels(target);
      sprite.destroy();
      target.destroy(true);
      return { pixels, width: this.canvas.width, height: this.canvas.height };
    }
    /** Reads the composed document as raw bytes, for flood fill. */
    readDocumentPixels() {
      if (!this.documentTexture) {
        return null;
      }
      const { pixels } = this.app.renderer.extract.pixels(this.documentTexture);
      return {
        pixels,
        width: this.documentTexture.width,
        height: this.documentTexture.height
      };
    }
    /** Reads the composed document back as pixels, for copy. */
    extractRegion(x, y, width, height) {
      if (!this.documentTexture || width < 1 || height < 1) {
        return null;
      }
      const full = this.app.renderer.extract.canvas(
        this.documentTexture
      );
      const out = document.createElement("canvas");
      out.width = Math.round(width);
      out.height = Math.round(height);
      const context = out.getContext("2d");
      if (!context) {
        return null;
      }
      context.drawImage(
        full,
        Math.round(x),
        Math.round(y),
        out.width,
        out.height,
        0,
        0,
        out.width,
        out.height
      );
      return out;
    }
    /** The current output surface size. */
    get canvasSize() {
      return { ...this.canvas };
    }
    /** Native pixel dimensions of the loaded image. */
    get imageSize() {
      return {
        width: this.texture?.width ?? 0,
        height: this.texture?.height ?? 0
      };
    }
    /**
     * Draws the layer onto the canvas.
     *
     * Everything downstream -- the on-screen sprite, the histogram probe, the save --
     * reads this one texture, so the adjustment pipeline never has to know how the
     * image was positioned.
     *
     * Critically, this depends only on the canvas size, never on the viewport. That
     * is what lets a transform handle be dragged without the surface moving under the
     * drag.
     */
    composeDocument() {
      this.documentTexture?.destroy(true);
      this.documentTexture = null;
      if (!this.texture || this.canvas.width <= 0 || this.canvas.height <= 0) {
        this.rebindDisplay();
        return;
      }
      if (!this.layerTextures.has(BASE_LAYER_ID)) {
        this.layerTextures.set(BASE_LAYER_ID, this.texture);
      }
      const target = this.pixi.RenderTexture.create({
        width: this.canvas.width,
        height: this.canvas.height
      });
      const stack = new this.pixi.Container();
      for (const layer of this.layers) {
        const texture = this.layerTextures.get(layer.id);
        if (!texture || !layer.visible || layer.opacity <= 0) {
          continue;
        }
        const sprite = new this.pixi.Sprite(texture);
        const { x, y, scaleX, scaleY, rotation, flipH, flipV } = layer.transform;
        sprite.anchor.set(0.5);
        sprite.scale.set(
          scaleX * (flipH ? -1 : 1),
          scaleY * (flipV ? -1 : 1)
        );
        sprite.rotation = rotation * Math.PI / 180;
        sprite.position.set(x * this.canvas.width, y * this.canvas.height);
        sprite.alpha = layer.opacity;
        stack.addChild(sprite);
      }
      this.app.renderer.render({ container: stack, target, clear: true });
      stack.destroy({ children: true });
      this.documentTexture = target;
      this.rebindDisplay();
      if (this.sprite) {
        this.applySampling(Math.abs(this.sprite.scale.x));
      }
    }
    /** The texture every downstream stage reads. */
    displayTexture() {
      return this.documentTexture ?? this.texture;
    }
    /** Points the on-screen sprite at the current display texture. */
    rebindDisplay() {
      const texture = this.displayTexture();
      if (this.sprite && texture) {
        this.sprite.texture = texture;
      }
    }
    /**
     * Replaces the image being edited.
     *
     * @param image Decoded, untainted image element.
     */
    setImage(image) {
      var _a;
      this.releaseImage();
      this.texture = this.pixi.Texture.from(image);
      this.sprite = new this.pixi.Sprite(this.texture);
      this.sprite.anchor.set(0.5);
      this.filter = this.buildFilter();
      this.rebuildFilterChain();
      (_a = this.sprite).filters ?? (_a.filters = [this.filter]);
      this.app.stage.addChild(this.sprite);
      this.fit();
      this.applyUniforms();
      this.scheduleHistogram();
    }
    /**
     * Pixel dimensions of what the edit currently produces.
     *
     * This is the canvas size once a document is composed -- which is what the save
     * path and the info panel both want.
     */
    get sourceSize() {
      const texture = this.displayTexture();
      return { width: texture?.width ?? 0, height: texture?.height ?? 0 };
    }
    /**
     * Scales and centres the sprite to fit the host, never magnifying past 1:1.
     *
     * Upscaling a small image to fill the viewport would show interpolation
     * artefacts and mislead the user about the detail they actually have.
     */
    fit() {
      const bounds = this.syncSurface();
      const texture = this.displayTexture();
      if (!this.sprite || !texture) {
        return;
      }
      const gutter = this.host.classList.contains("has-rulers") ? 20 : 0;
      const available = {
        width: Math.max(1, bounds.width - 48 - gutter),
        height: Math.max(1, bounds.height - 48 - gutter)
      };
      const fitted = Math.min(
        available.width / texture.width,
        available.height / texture.height,
        1
      );
      const effective = fitted * this.zoom;
      this.sprite.scale.set(effective);
      this.applySampling(effective);
      this.sprite.position.set(
        (bounds.width + gutter) / 2 + this.panX,
        (bounds.height + gutter) / 2 + this.panY
      );
      for (const listener of this.viewportListeners) {
        listener();
      }
    }
    /**
     * Switches every texture between smooth and pixelated sampling.
     *
     * Past 1:1 the user is inspecting individual pixels and wants to see squares;
     * below it they are looking at the picture and linear sampling is what stops a
     * downscale aliasing.
     *
     * Applied to *every* texture in the chain, not just the one on screen. The
     * source image is resampled when it is composited into the document, and the
     * document is resampled again through the adjustment filter -- so leaving any
     * link on linear reintroduces the smoothing the last link just removed. That is
     * exactly what made zooming still look soft after the display texture alone was
     * switched.
     *
     * @param effective On-screen scale, where 1 is one canvas pixel per CSS pixel.
     */
    applySampling(effective) {
      const wanted = effective > 1.05 ? "nearest" : "linear";
      const apply = (texture) => {
        if (!texture) {
          return;
        }
        const source = texture.source;
        if (source.scaleMode === wanted) {
          return;
        }
        source.scaleMode = wanted;
        if (source.style) {
          source.style.scaleMode = wanted;
          source.style.update?.();
        }
      };
      apply(this.texture);
      apply(this.documentTexture);
      for (const texture of this.layerTextures.values()) {
        apply(texture);
      }
    }
    /**
     * Where the image sits inside the stage, in CSS pixels.
     *
     * The crop overlay needs this to draw a rectangle over the image rather than
     * over the letterboxing around it.
     *
     * @return Viewport rectangle, or null when nothing is loaded.
     */
    getViewport() {
      const texture = this.displayTexture();
      if (!this.sprite || !texture) {
        return null;
      }
      const bounds = this.app.renderer.screen;
      const scale = Math.abs(this.sprite.scale.x);
      const width = texture.width * scale;
      const height = texture.height * scale;
      const gutter = this.host.classList.contains("has-rulers") ? 20 : 0;
      return {
        x: (bounds.width - width + gutter) / 2 + this.panX,
        y: (bounds.height - height + gutter) / 2 + this.panY,
        width,
        height
      };
    }
    /**
     * Subscribes to viewport changes, so overlays can follow a resize.
     *
     * @param listener Called after each re-fit.
     * @return Unsubscribe function.
     */
    onViewportChange(listener) {
      this.viewportListeners.add(listener);
      return () => {
        this.viewportListeners.delete(listener);
      };
    }
    /**
     * Scrolls the pasteboard.
     *
     * @param dx Horizontal movement in CSS pixels.
     * @param dy Vertical movement in CSS pixels.
     */
    pan(dx, dy) {
      this.panX += dx;
      this.panY += dy;
      this.fit();
    }
    /**
     * Zooms about a point, keeping whatever is under it in place.
     *
     * Anchoring to the pointer rather than to the centre is what makes wheel-zoom
     * feel like a map instead of a slideshow: the detail you were looking at is
     * still under the cursor afterwards.
     *
     * @param factor  Multiplier on the current zoom.
     * @param originX Anchor point, in stage CSS pixels.
     * @param originY Anchor point, in stage CSS pixels.
     */
    zoomAt(factor, originX, originY) {
      const previous = this.zoom;
      const next = Math.min(16, Math.max(0.05, previous * factor));
      if (next === previous) {
        return;
      }
      const bounds = this.app.renderer.screen;
      const centreX = bounds.width / 2 + this.panX;
      const centreY = bounds.height / 2 + this.panY;
      const ratio = next / previous;
      this.panX += (centreX - originX) * (ratio - 1);
      this.panY += (centreY - originY) * (ratio - 1);
      this.zoom = next;
      this.fit();
    }
    /** Internal state, for diagnosing render problems from the console. */
    debugState() {
      return {
        canvas: { ...this.canvas },
        layerCount: this.layers.length,
        layers: this.layers.map((layer) => ({
          id: layer.id,
          kind: layer.kind,
          visible: layer.visible,
          hasTexture: this.layerTextures.has(layer.id),
          isRenderTexture: this.layerTextures.get(layer.id) instanceof this.pixi.RenderTexture
        })),
        zoom: this.zoom,
        spriteScale: this.sprite ? Math.abs(this.sprite.scale.x) : null,
        documentScaleMode: this.documentTexture ? this.documentTexture.source.scaleMode : null,
        sourceScaleMode: this.texture ? this.texture.source.scaleMode : null,
        hasDocumentTexture: !!this.documentTexture,
        documentSize: this.documentTexture ? { w: this.documentTexture.width, h: this.documentTexture.height } : null
      };
    }
    /** Current zoom, where 1 means fitted to the stage. */
    get viewZoom() {
      return this.zoom;
    }
    /**
     * Zooms so one canvas pixel covers one CSS pixel.
     *
     * `viewZoom` is relative to the fitted size, not absolute, so getting to 100% means
     * cancelling out whatever the fit came to. Worth having as a method rather than
     * leaving callers to work it out: the fit ratio is private, and rightly so.
     */
    zoomToActual() {
      const texture = this.displayTexture();
      if (!texture || !this.sprite) {
        return;
      }
      const fitted = this.sprite.scale.x / Math.max(this.zoom, 1e-6);
      this.zoom = Math.min(16, Math.max(0.05, 1 / Math.max(fitted, 1e-6)));
      this.panX = 0;
      this.panY = 0;
      this.fit();
    }
    /** Returns the view to a centred, fitted position. */
    resetView() {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.fit();
    }
    /**
     * Sets the adjustments to render.
     *
     * @param ops Recipe ops.
     */
    setOps(ops) {
      const previousBlur = this.uniforms.blur;
      this.uniforms = composeAdjustments(ops, this.schema);
      if (previousBlur > 0 !== this.uniforms.blur > 0) {
        this.rebuildFilterChain();
      }
      this.applyBlur();
      this.applyUniforms();
      this.scheduleHistogram();
    }
    /**
     * Adds or removes the blur pass.
     *
     * Blur is the one effect that cannot join the single-pass shader: a Gaussian
     * needs to be separable to be affordable, which means two passes by definition.
     * It is therefore only in the chain when it is actually doing something, so an
     * edit without blur still pays for exactly one pass and one quantisation.
     */
    rebuildFilterChain() {
      if (!this.sprite || !this.filter) {
        return;
      }
      if (this.uniforms.blur > 0) {
        this.blurFilter ?? (this.blurFilter = new this.pixi.BlurFilter({ strength: 1, quality: 3 }));
        this.sprite.filters = [this.blurFilter, this.filter];
        return;
      }
      this.sprite.filters = [this.filter];
    }
    /**
     * Scales the blur radius to whatever is being rendered.
     *
     * The stored value is a fraction of the longest edge, so a blur previewed on a
     * 900px canvas survives being saved at 6000px instead of becoming imperceptible.
     *
     * @param renderWidth Optional. Width being rendered; defaults to the on-screen size.
     */
    applyBlur(renderWidth) {
      if (!this.blurFilter || this.uniforms.blur <= 0) {
        return;
      }
      const viewport = this.getViewport();
      const width = renderWidth ?? viewport?.width ?? this.sourceSize.width;
      this.blurFilter.strength = Math.max(0.1, this.uniforms.blur * 0.04 * width);
    }
    /**
     * Temporarily shows the unedited image, for a before/after comparison.
     *
     * The histogram deliberately keeps tracking the bypassed state too, so holding
     * the compare key shows you both the original pixels and the original curve.
     *
     * @param bypass Whether to skip the adjustments.
     */
    setBypass(bypass) {
      if (this.bypass === bypass) {
        return;
      }
      this.bypass = bypass;
      this.applyUniforms();
      this.scheduleHistogram();
    }
    /** Pushes the current uniforms onto the filter. */
    applyUniforms() {
      if (!this.filter) {
        return;
      }
      const group = this.filter.resources.adjustUniforms;
      if (this.bypass) {
        group.uniforms.uColorMatrix = [
          1,
          0,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          0,
          1,
          0
        ];
        group.uniforms.uVibrance = 0;
        group.uniforms.uLutMix = 0;
        group.uniforms.uSharpen = 0;
        group.uniforms.uVignette = 0;
        group.uniforms.uGrain = 0;
        return;
      }
      group.uniforms.uColorMatrix = this.uniforms.matrix;
      group.uniforms.uVibrance = this.uniforms.vibrance;
      group.uniforms.uLutMix = this.lutActive ? 1 : 0;
      group.uniforms.uSharpen = this.uniforms.sharpen;
      group.uniforms.uVignette = this.uniforms.vignette;
      group.uniforms.uGrain = this.uniforms.grain;
      group.uniforms.uSeed = this.seed;
    }
    /**
     * Subscribes to histogram updates.
     *
     * @param listener Called after each recomputation.
     * @return Unsubscribe function.
     */
    onHistogram(listener) {
      this.histogramListeners.add(listener);
      return () => {
        this.histogramListeners.delete(listener);
      };
    }
    /**
     * Queues a histogram recomputation for the next animation frame.
     *
     * A slider drag fires many pointer moves per frame, so the work is coalesced to
     * one pass per frame -- the display cannot show more than that anyway. Aligning
     * to the frame also means the readback happens once the frame's drawing is
     * already queued, rather than interleaved with it.
     */
    scheduleHistogram() {
      if (this.histogramFrame !== null) {
        return;
      }
      this.histogramFrame = window.requestAnimationFrame(() => {
        this.histogramFrame = null;
        if (this.histogramSkip > 0) {
          this.histogramSkip--;
          this.scheduleHistogram();
          return;
        }
        this.emitHistogram();
      });
    }
    /**
     * Renders a small copy, reads it back, and notifies listeners.
     *
     * Times itself and sets a skip count when it runs long. Reading pixels back
     * forces a synchronous flush of the GPU pipeline, and how expensive that is
     * depends entirely on the machine -- so rather than assume a rate, measure and
     * adapt. On hardware where the pass is cheap this never skips anything.
     */
    emitHistogram() {
      if (this.destroyed || !this.texture || this.histogramListeners.size === 0) {
        return;
      }
      const started = performance.now();
      let target = null;
      try {
        const { width, height } = this.scaleToFit(HISTOGRAM_EDGE);
        target = this.pixi.RenderTexture.create({ width, height });
        const probe = this.makeRenderSprite(width / (this.displayTexture()?.width ?? width));
        this.app.renderer.render({ container: probe, target, clear: true });
        const { pixels } = this.app.renderer.extract.pixels(target);
        probe.destroy({ children: true });
        this.notifyHistogram(computeHistogram(pixels));
      } catch {
        this.notifyHistogram(emptyHistogram());
      } finally {
        target?.destroy(true);
      }
      const cost = performance.now() - started;
      this.histogramSkip = cost > HISTOGRAM_BUDGET_MS ? Math.min(HISTOGRAM_MAX_SKIP, Math.ceil(cost / HISTOGRAM_BUDGET_MS) - 1) : 0;
    }
    /**
     * Emits a histogram to every listener.
     *
     * @param histogram Computed histogram.
     */
    notifyHistogram(histogram) {
      for (const listener of this.histogramListeners) {
        listener(histogram);
      }
    }
    /**
     * Dimensions of the image scaled so its longest edge is at most `edge`.
     *
     * @param edge Longest-edge cap.
     */
    scaleToFit(edge) {
      const texture = this.displayTexture();
      const w = texture?.width ?? 1;
      const h = texture?.height ?? 1;
      const scale = Math.min(edge / Math.max(w, h), 1);
      return {
        width: Math.max(1, Math.round(w * scale)),
        height: Math.max(1, Math.round(h * scale))
      };
    }
    /**
     * Builds a throwaway sprite for offscreen rendering.
     *
     * A separate sprite rather than the on-screen one, because the on-screen sprite
     * carries the fit-to-viewport transform and a centred anchor. Offscreen renders
     * need the image square in the corner at a known scale.
     *
     * It gets its own filter instance carrying the same uniforms: a Pixi filter
     * holds per-instance uniform buffers, so sharing one between two concurrent
     * render targets is asking for the wrong values on one of them.
     *
     * @param scale Scale factor to apply.
     */
    makeRenderSprite(scale) {
      const sprite = new this.pixi.Sprite(this.displayTexture());
      sprite.anchor.set(0);
      sprite.position.set(0, 0);
      sprite.scale.set(scale);
      const filter = this.buildFilter();
      const group = filter.resources.adjustUniforms;
      group.uniforms.uColorMatrix = this.bypass ? [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] : this.uniforms.matrix;
      group.uniforms.uVibrance = this.bypass ? 0 : this.uniforms.vibrance;
      group.uniforms.uLutMix = !this.bypass && this.lutActive ? 1 : 0;
      group.uniforms.uSharpen = this.bypass ? 0 : this.uniforms.sharpen;
      group.uniforms.uVignette = this.bypass ? 0 : this.uniforms.vignette;
      group.uniforms.uGrain = this.bypass ? 0 : this.uniforms.grain;
      group.uniforms.uSeed = this.seed;
      group.uniforms.uSharpen = this.bypass ? 0 : this.uniforms.sharpen;
      group.uniforms.uVignette = this.bypass ? 0 : this.uniforms.vignette;
      group.uniforms.uGrain = this.bypass ? 0 : this.uniforms.grain;
      group.uniforms.uSeed = this.seed;
      if (!this.bypass && this.uniforms.blur > 0) {
        const blur = new this.pixi.BlurFilter({
          strength: Math.max(
            0.1,
            this.uniforms.blur * 0.04 * (this.displayTexture()?.width ?? 1) * scale
          ),
          quality: 3
        });
        sprite.filters = [blur, filter];
        return sprite;
      }
      sprite.filters = [filter];
      return sprite;
    }
    /**
     * Renders the edit at full resolution and encodes it.
     *
     * Runs the same filter as the preview, against the unscaled texture. Because
     * every phase-1 op is per-pixel colour maths with no spatial radius, the result
     * is exactly what the proxy was previewing, just with more pixels.
     *
     * @param format  Output MIME type.
     * @param quality Encoder quality, 0..1. Ignored for PNG.
     * @return The encoded image.
     * @throws {Error} When the image is too large, or encoding fails.
     */
    async renderFull(format, quality) {
      const texture = this.displayTexture();
      if (!texture) {
        throw new Error("No image is loaded.");
      }
      const { width, height } = texture;
      if (width * height > this.maxRenderPixels) {
        throw new Error(
          `This image is too large to render in the browser (${width}x${height}).`
        );
      }
      let target = null;
      const sprite = this.makeRenderSprite(1);
      try {
        target = this.pixi.RenderTexture.create({ width, height });
        this.app.renderer.render({ container: sprite, target, clear: true });
        const canvas = this.app.renderer.extract.canvas(target);
        return await encodeCanvas(canvas, format, quality);
      } finally {
        sprite.destroy({ children: true });
        target?.destroy(true);
      }
    }
    /** Tears down the texture, sprite and filter without touching the app. */
    releaseImage() {
      this.documentTexture?.destroy(true);
      this.documentTexture = null;
      for (const [id, texture] of this.layerTextures) {
        if (id !== BASE_LAYER_ID) {
          texture.destroy(true);
        }
      }
      this.layerTextures.clear();
      if (this.sprite) {
        this.sprite.destroy({ children: true });
        this.sprite = null;
      }
      this.filter = null;
      if (this.texture) {
        this.texture.destroy(true);
        this.texture = null;
      }
    }
    /**
     * Releases everything.
     *
     * `destroy( true )` on the Application is deliberately *not* used: it releases
     * Pixi's global resource registries, which corrupts any other Pixi application
     * alive on the page. Desktop Mode runs its own -- wallpapers, widgets, games --
     * so taking that shortcut here would break unrelated windows.
     */
    destroy() {
      if (this.destroyed) {
        return;
      }
      this.destroyed = true;
      if (this.histogramFrame !== null) {
        window.cancelAnimationFrame(this.histogramFrame);
        this.histogramFrame = null;
      }
      this.histogramListeners.clear();
      this.viewportListeners.clear();
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.releaseImage();
      this.lut?.destroy(true);
      this.lut = null;
      this.paintMask?.destroy(true);
      this.paintMask = null;
      this.app.destroy({ removeView: true }, { children: true, texture: true });
    }
  }
  function encodeCanvas(canvas, format, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(
            new Error(
              `The browser could not encode the image as ${format}. Try a different format.`
            )
          );
        },
        format,
        quality
      );
    });
  }
  function __(text) {
    return window.wp?.i18n?.__?.(text, "daguerre") ?? text;
  }
  function sprintf(text, ...args) {
    const translated = __(text);
    const impl = window.wp?.i18n?.sprintf;
    if (impl) {
      return impl(translated, ...args);
    }
    let index = 0;
    return translated.replace(/%[sd]/g, () => String(args[index++] ?? ""));
  }
  const COALESCE_MS = 600;
  const MAX_ENTRIES = 100;
  class History {
    /**
     * @param initial Starting state, which becomes the bottom of the stack.
     * @param now     Clock, injectable so tests can drive coalescing deterministically.
     */
    constructor(initial, now = () => Date.now()) {
      this.entries = [];
      this.index = -1;
      this.now = now;
      this.entries = [{ state: initial, label: "@initial", at: 0 }];
      this.index = 0;
    }
    /** The state currently in effect. */
    get current() {
      return this.entries[this.index].state;
    }
    /** Whether there is anything to undo. */
    get canUndo() {
      return this.index > 0;
    }
    /** Whether there is anything to redo. */
    get canRedo() {
      return this.index < this.entries.length - 1;
    }
    /**
     * Records a new state.
     *
     * Replaces the top entry instead of adding one when the label matches the
     * previous change and it happened recently, so a slider drag becomes a single
     * undo step rather than one per pointer move. An entry carrying metadata is never
     * merged, because its payload cannot be superseded the way a slider value can.
     *
     * Pushing after an undo discards the redo tail, which is what every editor does.
     *
     * @param state New state.
     * @param label Groups related changes. Use the op name for slider drags.
     * @param meta  Optional. Carried alongside, for changes a snapshot cannot express.
     */
    push(state2, label, meta) {
      const at = this.now();
      const top = this.entries[this.index];
      if (this.index > 0 && top.label === label && at - top.at < COALESCE_MS && !this.canRedo && // Never merge entries carrying a payload. Coalescing exists for slider
      // drags, where each value supersedes the last. A brush stroke is not like
      // that: its patch holds pixels that exist nowhere else, so merging two
      // quick strokes would discard the first stroke's only copy of them and
      // leave undo restoring half of what it claimed to.
      meta === void 0 && top.meta === void 0) {
        this.entries[this.index] = { state: state2, label, at, meta };
        return;
      }
      this.entries = this.entries.slice(0, this.index + 1);
      this.entries.push({ state: state2, label, at, meta });
      if (this.entries.length > MAX_ENTRIES) {
        this.entries.shift();
      }
      this.index = this.entries.length - 1;
    }
    /**
     * Overwrites the current state without creating an undo step.
     *
     * For changes that are not part of the edit being undone -- output format and
     * quality, which describe how the result is encoded rather than what it looks
     * like. Interleaving those with adjustment history would make undo jump between
     * unrelated kinds of change.
     *
     * @param state Replacement state.
     */
    replace(state2) {
      this.entries[this.index] = { ...this.entries[this.index], state: state2 };
    }
    /** Whatever was attached to the entry currently in effect. */
    get meta() {
      return this.entries[this.index].meta;
    }
    /** The label of the entry currently in effect. */
    get label() {
      return this.entries[this.index].label;
    }
    /**
     * Replaces the metadata on the entry in effect.
     *
     * Undoing a stroke needs the pixels the stroke *produced* in order to redo it, and
     * those only exist once it has happened -- so the patch is swapped for its opposite
     * as it is applied, and the entry alternates between undo and redo directions.
     *
     * @param meta Replacement metadata.
     */
    setMeta(meta) {
      this.entries[this.index].meta = meta;
    }
    /**
     * Steps back one entry.
     *
     * @return The state now in effect, unchanged when there was nothing to undo.
     */
    undo() {
      if (this.canUndo) {
        this.index--;
      }
      return this.current;
    }
    /**
     * Steps forward one entry.
     *
     * @return The state now in effect, unchanged when there was nothing to redo.
     */
    redo() {
      if (this.canRedo) {
        this.index++;
      }
      return this.current;
    }
    /** The state the stack started from. */
    get initial() {
      return this.entries[0].state;
    }
  }
  const TILE_SIZE = 256;
  const MAX_TILES = 96;
  function tilesCovering(rect, width, height) {
    if (width < 1 || height < 1 || rect.width <= 0 || rect.height <= 0) {
      return [];
    }
    const left = Math.max(0, Math.floor(rect.x / TILE_SIZE));
    const top = Math.max(0, Math.floor(rect.y / TILE_SIZE));
    const right = Math.min(
      Math.ceil(width / TILE_SIZE),
      Math.ceil((rect.x + rect.width) / TILE_SIZE)
    );
    const bottom = Math.min(
      Math.ceil(height / TILE_SIZE),
      Math.ceil((rect.y + rect.height) / TILE_SIZE)
    );
    const tiles = [];
    for (let ty = top; ty < bottom; ty++) {
      for (let tx = left; tx < right; tx++) {
        tiles.push({
          x: tx * TILE_SIZE,
          y: ty * TILE_SIZE,
          // Clipped, so the last row and column do not run past the canvas.
          width: Math.min(TILE_SIZE, width - tx * TILE_SIZE),
          height: Math.min(TILE_SIZE, height - ty * TILE_SIZE)
        });
      }
    }
    return tiles;
  }
  function tileKey(rect) {
    return `${Math.floor(rect.x / TILE_SIZE)},${Math.floor(
      rect.y / TILE_SIZE
    )}`;
  }
  function dabRegion(x, y, size) {
    const radius = Math.max(1, size / 2) + 1;
    return {
      x: Math.floor(x - radius),
      y: Math.floor(y - radius),
      width: Math.ceil(radius * 2),
      height: Math.ceil(radius * 2)
    };
  }
  class TileCollector {
    /**
     * @param width  Canvas width.
     * @param height Canvas height.
     */
    constructor(width, height) {
      this.tiles = /* @__PURE__ */ new Map();
      this.overflowed = false;
      this.width = width;
      this.height = height;
    }
    /**
     * Captures whatever tiles a region touches and has not been captured yet.
     *
     * @param rect    Region about to change.
     * @param capture Reads a tile's current pixels, or returns null when it is empty.
     */
    add(rect, capture) {
      if (this.overflowed) {
        return;
      }
      for (const tile of tilesCovering(rect, this.width, this.height)) {
        const key = tileKey(tile);
        if (this.tiles.has(key)) {
          continue;
        }
        if (this.tiles.size >= MAX_TILES) {
          this.overflowed = true;
          this.tiles.clear();
          return;
        }
        this.tiles.set(key, { rect: tile, pixels: capture(tile) });
      }
    }
    /** Whether anything has been captured. */
    get size() {
      return this.tiles.size;
    }
    /**
     * The finished patch.
     *
     * @param layerId Layer the tiles belong to.
     */
    toPatch(layerId) {
      return {
        layerId,
        tiles: [...this.tiles.values()],
        complete: !this.overflowed
      };
    }
  }
  const SELECTION_SHAPES = [
    { value: "rect", label: "Rectangle" },
    { value: "ellipse", label: "Ellipse" },
    { value: "lasso", label: "Freeform" },
    { value: "polygon", label: "Polygon" }
  ];
  const MAX_LASSO_POINTS = 600;
  function isEmptySelection(selection) {
    if (!selection || selection.points.length < 2) {
      return true;
    }
    const bounds = selectionBounds(selection);
    return bounds.w < 2e-3 || bounds.h < 2e-3;
  }
  function selectionBounds(selection) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of selection.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX)) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  function selectionToPath(selection, width, height) {
    const at = (point) => `${point.x * width} ${point.y * height}`;
    if (selection.shape === "rect" || selection.shape === "ellipse") {
      const b = selectionBounds(selection);
      const x = b.x * width;
      const y = b.y * height;
      const w = b.w * width;
      const h = b.h * height;
      if (selection.shape === "rect") {
        return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
      }
      const rx = w / 2;
      const ry = h / 2;
      return `M ${x} ${y + ry} a ${rx} ${ry} 0 1 0 ${w} 0 a ${rx} ${ry} 0 1 0 ${-w} 0 Z`;
    }
    if (selection.points.length < 2) {
      return "";
    }
    return `M ${at(selection.points[0])} ` + selection.points.slice(1).map((point) => `L ${at(point)}`).join(" ") + " Z";
  }
  function buildSelectionMask(selection, width, height) {
    if (!selection || isEmptySelection(selection) || width < 1 || height < 1) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    const bounds = selectionBounds(selection);
    if (selection.shape === "ellipse") {
      ctx.ellipse(
        (bounds.x + bounds.w / 2) * canvas.width,
        (bounds.y + bounds.h / 2) * canvas.height,
        bounds.w / 2 * canvas.width,
        bounds.h / 2 * canvas.height,
        0,
        0,
        Math.PI * 2
      );
    } else if (selection.shape === "rect") {
      ctx.rect(
        bounds.x * canvas.width,
        bounds.y * canvas.height,
        bounds.w * canvas.width,
        bounds.h * canvas.height
      );
    } else {
      selection.points.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.closePath();
    }
    ctx.fill();
    return canvas;
  }
  function traceMask(mask, maxPoints = 400) {
    const { width, height, data } = mask;
    const filled = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 127;
    let start = null;
    for (let y = 0; y < height && !start; y++) {
      for (let x = 0; x < width; x++) {
        if (filled(x, y)) {
          start = { x, y };
          break;
        }
      }
    }
    if (!start) {
      return [];
    }
    const ring = [
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1]
    ];
    const contour = [start];
    let current = start;
    let entry = 0;
    const limit = width * height * 4 + 8;
    for (let step = 0; step < limit; step++) {
      let moved = false;
      for (let i = 1; i <= 8; i++) {
        const direction = (entry + i) % 8;
        const next = {
          x: current.x + ring[direction][0],
          y: current.y + ring[direction][1]
        };
        if (!filled(next.x, next.y)) {
          continue;
        }
        entry = (direction + 5) % 8;
        current = next;
        moved = true;
        break;
      }
      if (!moved) {
        break;
      }
      if (current.x === start.x && current.y === start.y) {
        break;
      }
      contour.push(current);
    }
    return thinPath(contour, maxPoints, width, height);
  }
  function thinPath(contour, maxPoints, width, height) {
    const stride = Math.max(1, Math.ceil(contour.length / Math.max(3, maxPoints)));
    const out = [];
    for (let i = 0; i < contour.length; i += stride) {
      out.push({
        x: contour[i].x / width,
        y: contour[i].y / height
      });
    }
    return out;
  }
  function selectionFromDrag(shape, from, to) {
    return {
      shape,
      points: [
        { x: clamp01$1(Math.min(from.x, to.x)), y: clamp01$1(Math.min(from.y, to.y)) },
        { x: clamp01$1(Math.max(from.x, to.x)), y: clamp01$1(Math.max(from.y, to.y)) }
      ]
    };
  }
  function appendPathPoint(points, point, minStep = 4e-3) {
    const last = points[points.length - 1];
    if (last && Math.abs(last.x - point.x) < minStep && Math.abs(last.y - point.y) < minStep) {
      return points;
    }
    const next = [...points, { x: clamp01$1(point.x), y: clamp01$1(point.y) }];
    return next.length > MAX_LASSO_POINTS ? next.slice(next.length - MAX_LASSO_POINTS) : next;
  }
  function clamp01$1(value) {
    return Math.min(1, Math.max(0, value));
  }
  const BRUSH_SHAPES = [
    { value: "hard", label: "Hard round" },
    { value: "soft", label: "Soft round" },
    { value: "hairy", label: "Bristle" },
    { value: "square", label: "Square" }
  ];
  const STAMP_SPACING = 0.18;
  const cache = /* @__PURE__ */ new Map();
  const MAX_CACHED = 24;
  function brushStamp(shape, size, hardness) {
    const diameter = Math.max(1, Math.round(size));
    const key = `${shape}:${diameter}:${Math.round(hardness * 20)}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const canvas = document.createElement("canvas");
    canvas.width = diameter;
    canvas.height = diameter;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      paintStamp(ctx, shape, diameter, hardness);
    }
    if (cache.size >= MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest !== void 0) {
        cache.delete(oldest);
      }
    }
    cache.set(key, canvas);
    return canvas;
  }
  function paintStamp(ctx, shape, diameter, hardness) {
    const r = diameter / 2;
    if (shape === "square") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, diameter, diameter);
      return;
    }
    if (shape === "hairy") {
      const bristles = Math.max(24, Math.round(diameter * 3));
      let seed = diameter * 9301;
      const random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      for (let i = 0; i < bristles; i++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * r;
        const x = r + Math.cos(angle) * distance;
        const y = r + Math.sin(angle) * distance;
        const dot = Math.max(0.5, diameter / 40 * (0.4 + random()));
        ctx.globalAlpha = 0.12 + random() * 0.35;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, dot, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    const core = shape === "hard" ? Math.max(0.75, hardness) : hardness * 0.85;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(Math.min(0.99, core), "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function interpolateStroke(from, to, spacing) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.max(0.5, spacing);
    if (distance < step) {
      return [to];
    }
    const count = Math.floor(distance / step);
    const points = [];
    for (let i = 1; i <= count; i++) {
      const t = i * step / distance;
      points.push({ x: from.x + dx * t, y: from.y + dy * t });
    }
    points.push(to);
    return points;
  }
  function floodFillMask(pixels, width, height, startX, startY, tolerance) {
    const x0 = Math.round(startX);
    const y0 = Math.round(startY);
    if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
      return null;
    }
    const at = (x, y) => (y * width + x) * 4;
    const seed = at(x0, y0);
    const target = [
      pixels[seed],
      pixels[seed + 1],
      pixels[seed + 2],
      pixels[seed + 3]
    ];
    const matches = (index) => Math.abs(pixels[index] - target[0]) <= tolerance && Math.abs(pixels[index + 1] - target[1]) <= tolerance && Math.abs(pixels[index + 2] - target[2]) <= tolerance && Math.abs(pixels[index + 3] - target[3]) <= tolerance;
    return scanlineFill(width, height, x0, y0, matches, at);
  }
  function scanlineFill(width, height, x0, y0, matches, at) {
    const filled = new Uint8Array(width * height);
    const stack = [x0, y0];
    let count = 0;
    while (stack.length > 0) {
      const y = stack.pop();
      const seedX = stack.pop();
      if (y < 0 || y >= height || filled[y * width + seedX]) {
        continue;
      }
      let left = seedX;
      let right = seedX;
      while (left > 0 && matches(at(left - 1, y)) && !filled[y * width + left - 1]) {
        left--;
      }
      while (right < width - 1 && matches(at(right + 1, y)) && !filled[y * width + right + 1]) {
        right++;
      }
      for (let x = left; x <= right; x++) {
        filled[y * width + x] = 1;
        count++;
        for (const ny of [y - 1, y + 1]) {
          if (ny < 0 || ny >= height) {
            continue;
          }
          if (matches(at(x, ny)) && !filled[ny * width + x]) {
            stack.push(x, ny);
          }
        }
      }
    }
    if (count === 0) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    const mask = ctx.createImageData(width, height);
    for (let i = 0; i < filled.length; i++) {
      if (!filled[i]) {
        continue;
      }
      mask.data[i * 4] = 255;
      mask.data[i * 4 + 1] = 255;
      mask.data[i * 4 + 2] = 255;
      mask.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(mask, 0, 0);
    return canvas;
  }
  const GRADIENT_KINDS = [
    { value: "linear", label: "Linear" },
    { value: "radial", label: "Radial" }
  ];
  const SHAPE_KINDS = [
    { value: "rect", label: "Rectangle" },
    { value: "rounded", label: "Rounded" },
    { value: "ellipse", label: "Ellipse" },
    { value: "line", label: "Line" },
    { value: "triangle", label: "Triangle" },
    { value: "star", label: "Star" }
  ];
  function rectFromDrag(from, to) {
    return {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y)
    };
  }
  function squareDrag(from, to) {
    const size = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    return {
      x: from.x + Math.sign(to.x - from.x || 1) * size,
      y: from.y + Math.sign(to.y - from.y || 1) * size
    };
  }
  function starPoints(rect, points = 5, inner = 0.5) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const rx = rect.width / 2;
    const ry = rect.height / 2;
    const out = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = i / (points * 2) * Math.PI * 2 - Math.PI / 2;
      const scale = i % 2 === 0 ? 1 : inner;
      out.push({
        x: cx + Math.cos(angle) * rx * scale,
        y: cy + Math.sin(angle) * ry * scale
      });
    }
    return out;
  }
  function shapeCanvas(width, height, from, to, options) {
    const surface = makeCanvas(width, height);
    if (!surface) {
      return null;
    }
    const { canvas, ctx } = surface;
    const rect = rectFromDrag(from, to);
    if (options.kind !== "line" && (rect.width < 1 || rect.height < 1)) {
      return null;
    }
    ctx.beginPath();
    switch (options.kind) {
      case "rect":
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        break;
      case "rounded": {
        const radius = Math.min(
          options.radius ?? 16,
          rect.width / 2,
          rect.height / 2
        );
        roundedRect(ctx, rect, radius);
        break;
      }
      case "ellipse":
        ctx.ellipse(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          rect.width / 2,
          rect.height / 2,
          0,
          0,
          Math.PI * 2
        );
        break;
      case "line":
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        break;
      case "triangle":
        ctx.moveTo(rect.x + rect.width / 2, rect.y);
        ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
        ctx.lineTo(rect.x, rect.y + rect.height);
        ctx.closePath();
        break;
      case "star":
        starPoints(rect).forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.closePath();
        break;
    }
    if (options.style === "fill" && options.kind !== "line") {
      ctx.fillStyle = options.colour;
      ctx.fill();
    } else {
      ctx.strokeStyle = options.colour;
      ctx.lineWidth = Math.max(1, options.strokeWidth);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }
    return canvas;
  }
  function roundedRect(ctx, rect, radius) {
    const r = Math.max(0, radius);
    ctx.moveTo(rect.x + r, rect.y);
    ctx.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, r);
    ctx.arcTo(
      rect.x + rect.width,
      rect.y + rect.height,
      rect.x,
      rect.y + rect.height,
      r
    );
    ctx.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, r);
    ctx.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, r);
    ctx.closePath();
  }
  function gradientCanvas(width, height, kind, from, to, start, end, fade = false) {
    const surface = makeCanvas(width, height);
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (!surface || span < 1) {
      return null;
    }
    const { canvas, ctx } = surface;
    const ramp = kind === "linear" ? ctx.createLinearGradient(from.x, from.y, to.x, to.y) : ctx.createRadialGradient(from.x, from.y, 0, from.x, from.y, span);
    ramp.addColorStop(0, start);
    ramp.addColorStop(1, fade ? withAlpha(start, 0) : end);
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }
  function textCanvas(options) {
    const text = options.text.trim();
    if (!text) {
      return null;
    }
    const font = cssFont(options);
    const measure = makeCanvas(1, 1);
    if (!measure) {
      return null;
    }
    measure.ctx.font = font;
    const lines = options.text.split("\n");
    const lineHeight = Math.ceil(options.size * 1.25);
    const pad = Math.ceil((options.strokeWidth ?? 0) + options.size * 0.35);
    const widest = Math.max(
      1,
      ...lines.map((line) => measure.ctx.measureText(line).width)
    );
    const surface = makeCanvas(
      Math.ceil(widest) + pad * 2,
      lineHeight * lines.length + pad * 2
    );
    if (!surface) {
      return null;
    }
    const { canvas, ctx } = surface;
    ctx.font = font;
    ctx.textBaseline = "top";
    ctx.fillStyle = options.colour;
    ctx.strokeStyle = options.colour;
    ctx.lineWidth = Math.max(1, options.strokeWidth ?? 1);
    ctx.lineJoin = "round";
    lines.forEach((line, index) => {
      const y = pad + index * lineHeight;
      if (options.strokeWidth) {
        ctx.strokeText(line, pad, y);
      } else {
        ctx.fillText(line, pad, y);
      }
    });
    return { canvas, offsetX: -pad, offsetY: -pad };
  }
  function cssFont(options) {
    return [
      options.italic ? "italic" : "",
      options.bold ? "700" : "400",
      `${Math.max(1, Math.round(options.size))}px`,
      options.family || "sans-serif"
    ].filter(Boolean).join(" ");
  }
  const FONT_STACKS = [
    { value: "system-ui, sans-serif", label: "System" },
    { value: "Helvetica, Arial, sans-serif", label: "Sans" },
    { value: 'Georgia, "Times New Roman", serif', label: "Serif" },
    { value: "ui-monospace, Menlo, Consolas, monospace", label: "Mono" }
  ];
  function withAlpha(colour, alpha) {
    const rgb = hexToRgb(colour);
    if (!rgb) {
      return colour;
    }
    return `rgba( ${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha} )`;
  }
  function hexToRgb(colour) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
    if (!match) {
      return null;
    }
    const hex = match[1];
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16)
    ];
  }
  function rgbToHex(r, g, b) {
    const byte = (value) => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0");
    return `#${byte(r)}${byte(g)}${byte(b)}`;
  }
  function makeCanvas(width, height) {
    if (width < 1 || height < 1) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext("2d");
    return ctx ? { canvas, ctx } : null;
  }
  const MAX_KERNEL = 64;
  function applyPixelDab(request2) {
    const { target, op } = request2;
    const source = request2.source ?? target;
    const radius = Math.max(0.5, request2.radius / 2);
    const strength = clamp01(request2.strength);
    const rect = dabRect(target, request2.x, request2.y, radius);
    if (!rect) {
      return null;
    }
    const kernel = Math.max(
      1,
      Math.min(MAX_KERNEL, Math.round(radius * 0.35))
    );
    const hardness = clamp01(request2.hardness ?? 0.5);
    const offsetX = Math.round(request2.offsetX ?? 0);
    const offsetY = Math.round(request2.offsetY ?? 0);
    const needsSnapshot = op === "blur" || op === "sharpen" || op === "smudge" || op === "heal";
    const margin = op === "heal" ? Math.ceil(radius * 0.4) + 2 : kernel;
    const read = needsSnapshot ? grow(source, rect, margin) : rect;
    const snapshot = needsSnapshot ? subBuffer(source, read) : source;
    const readAt = (x, y) => needsSnapshot ? sampleAt(snapshot, x - read.x, y - read.y) : sampleAt(snapshot, x, y);
    const blurred = op === "blur" || op === "sharpen" ? boxBlur(snapshot, kernel) : null;
    const patch = op === "heal" ? ringAverage(
      snapshot,
      request2.x - read.x,
      request2.y - read.y,
      radius
    ) : null;
    let carry;
    if (op === "smudge") {
      carry = request2.carry ? [...request2.carry] : readAt(request2.x, request2.y);
    }
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const falloff = dabFalloff(x, y, request2.x, request2.y, radius, hardness);
        if (falloff <= 0) {
          continue;
        }
        const weight = falloff * strength;
        const index = (y * target.width + x) * 4;
        switch (op) {
          case "blur":
            blend(
              target,
              index,
              sampleAt(blurred, x - read.x, y - read.y),
              weight
            );
            break;
          case "sharpen": {
            const soft = sampleAt(
              blurred,
              x - read.x,
              y - read.y
            );
            const here = readAt(x, y);
            blend(
              target,
              index,
              [
                here[0] + (here[0] - soft[0]) * 1.5,
                here[1] + (here[1] - soft[1]) * 1.5,
                here[2] + (here[2] - soft[2]) * 1.5,
                here[3]
              ],
              weight
            );
            break;
          }
          case "smudge": {
            const here = readAt(x, y);
            blend(target, index, carry, weight);
            for (let c = 0; c < 4; c++) {
              carry[c] += (here[c] - carry[c]) * (1 - strength) * 0.5;
            }
            break;
          }
          case "heal":
            if (patch) {
              blend(target, index, patch, weight);
            }
            break;
          case "dodge": {
            const here = sampleIndex(target, index);
            blend(
              target,
              index,
              [
                here[0] + (255 - here[0]) * weight,
                here[1] + (255 - here[1]) * weight,
                here[2] + (255 - here[2]) * weight,
                here[3]
              ],
              1
            );
            break;
          }
          case "burn": {
            const here = sampleIndex(target, index);
            blend(
              target,
              index,
              [
                here[0] * (1 - weight),
                here[1] * (1 - weight),
                here[2] * (1 - weight),
                here[3]
              ],
              1
            );
            break;
          }
          case "sponge":
          case "saturate": {
            const here = sampleIndex(target, index);
            const luma = 0.2126 * here[0] + 0.7152 * here[1] + 0.0722 * here[2];
            const amount = op === "sponge" ? -weight : weight;
            blend(
              target,
              index,
              [
                luma + (here[0] - luma) * (1 + amount),
                luma + (here[1] - luma) * (1 + amount),
                luma + (here[2] - luma) * (1 + amount),
                here[3]
              ],
              1
            );
            break;
          }
          case "clone":
            blend(
              target,
              index,
              sampleAt(source, x - offsetX, y - offsetY),
              weight
            );
            break;
          case "restore":
            blend(target, index, sampleAt(source, x, y), weight);
            break;
        }
      }
    }
    return carry ? { rect, carry } : { rect };
  }
  function dabRect(buffer, cx, cy, radius) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(buffer.width, Math.ceil(cx + radius) + 1);
    const y1 = Math.min(buffer.height, Math.ceil(cy + radius) + 1);
    if (x1 <= x0 || y1 <= y0) {
      return null;
    }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  function dabFalloff(x, y, cx, cy, radius, hardness) {
    const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (distance >= radius) {
      return 0;
    }
    const inner = radius * clamp01(hardness);
    if (distance <= inner) {
      return 1;
    }
    const t = 1 - (distance - inner) / Math.max(radius - inner, 1e-6);
    return t * t * (3 - 2 * t);
  }
  function ringAverage(buffer, cx, cy, radius) {
    const total = [0, 0, 0, 0];
    let count = 0;
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * radius * 1.35);
      const y = Math.round(cy + Math.sin(angle) * radius * 1.35);
      if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) {
        continue;
      }
      const sample = sampleAt(buffer, x, y);
      for (let c = 0; c < 4; c++) {
        total[c] += sample[c];
      }
      count++;
    }
    if (count === 0) {
      return null;
    }
    return [
      total[0] / count,
      total[1] / count,
      total[2] / count,
      total[3] / count
    ];
  }
  function boxBlur(buffer, radius) {
    const { width, height } = buffer;
    const span = Math.max(1, Math.round(radius));
    const window2 = span * 2 + 1;
    const horizontal = new Uint8ClampedArray(buffer.data.length);
    const out = new Uint8ClampedArray(buffer.data.length);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const sums = [0, 0, 0, 0];
      for (let i = -span; i <= span; i++) {
        const index = (row + clampInt(i, 0, width - 1)) * 4;
        for (let c = 0; c < 4; c++) {
          sums[c] += buffer.data[index + c];
        }
      }
      for (let x = 0; x < width; x++) {
        const index = (row + x) * 4;
        for (let c = 0; c < 4; c++) {
          horizontal[index + c] = sums[c] / window2;
        }
        const leaving = (row + clampInt(x - span, 0, width - 1)) * 4;
        const entering = (row + clampInt(x + span + 1, 0, width - 1)) * 4;
        for (let c = 0; c < 4; c++) {
          sums[c] += buffer.data[entering + c] - buffer.data[leaving + c];
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const sums = [0, 0, 0, 0];
      for (let i = -span; i <= span; i++) {
        const index = (clampInt(i, 0, height - 1) * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          sums[c] += horizontal[index + c];
        }
      }
      for (let y = 0; y < height; y++) {
        const index = (y * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          out[index + c] = sums[c] / window2;
        }
        const leaving = (clampInt(y - span, 0, height - 1) * width + x) * 4;
        const entering = (clampInt(y + span + 1, 0, height - 1) * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          sums[c] += horizontal[entering + c] - horizontal[leaving + c];
        }
      }
    }
    return { data: out, width, height };
  }
  function grow(buffer, rect, margin) {
    const x0 = Math.max(0, rect.x - margin);
    const y0 = Math.max(0, rect.y - margin);
    const x1 = Math.min(buffer.width, rect.x + rect.width + margin);
    const y1 = Math.min(buffer.height, rect.y + rect.height + margin);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  function subBuffer(buffer, rect) {
    const data = new Uint8ClampedArray(rect.width * rect.height * 4);
    for (let row = 0; row < rect.height; row++) {
      const from = ((rect.y + row) * buffer.width + rect.x) * 4;
      data.set(
        buffer.data.subarray(from, from + rect.width * 4),
        row * rect.width * 4
      );
    }
    return { data, width: rect.width, height: rect.height };
  }
  function sampleAt(buffer, x, y) {
    const index = (clampInt(Math.round(y), 0, buffer.height - 1) * buffer.width + clampInt(Math.round(x), 0, buffer.width - 1)) * 4;
    return sampleIndex(buffer, index);
  }
  function sampleIndex(buffer, index) {
    return [
      buffer.data[index],
      buffer.data[index + 1],
      buffer.data[index + 2],
      buffer.data[index + 3]
    ];
  }
  function blend(buffer, index, colour, weight) {
    const w = clamp01(weight);
    for (let c = 0; c < 3; c++) {
      buffer.data[index + c] += (colour[c] - buffer.data[index + c]) * w;
    }
  }
  function clamp01(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }
  function clampInt(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  const RETOUCH_MODES = [
    { value: "blur", label: "Blur" },
    { value: "sharpen", label: "Sharpen" },
    { value: "smudge", label: "Smudge" },
    { value: "heal", label: "Heal" }
  ];
  const TONE_MODES = [
    { value: "dodge", label: "Dodge" },
    { value: "burn", label: "Burn" },
    { value: "sponge", label: "Desaturate" },
    { value: "saturate", label: "Saturate" }
  ];
  function desktop$1() {
    const api = window.wp?.desktop;
    return api?.isActive?.() ? api : void 0;
  }
  function isDesktopMode() {
    return desktop$1() !== void 0;
  }
  function isDesktopModeEnabled() {
    const config = window.daguerreConfig;
    const flag = config?.desktopMode;
    return flag === true || flag === "1" || flag === 1 || isDesktopMode();
  }
  function pickComponent(tags) {
    for (const tag of tags) {
      if (hasComponent(tag)) {
        return tag;
      }
    }
    return null;
  }
  function hasComponent(tag) {
    return typeof customElements !== "undefined" && customElements.get(tag) !== void 0;
  }
  function request(input, init) {
    const api = desktop$1();
    if (api?.fetch) {
      return api.fetch(input, init);
    }
    return window.fetch(input, init);
  }
  function toast(message, type = "info") {
    const api = desktop$1();
    if (api?.showToast) {
      api.showToast({ message, type });
      return;
    }
    fallbackToast(message, type);
  }
  let toastHost = null;
  function fallbackToast(message, type) {
    if (!toastHost || !toastHost.isConnected) {
      toastHost = document.createElement("div");
      toastHost.className = "dg-toasts";
      toastHost.setAttribute("role", "status");
      toastHost.setAttribute("aria-live", "polite");
      document.body.appendChild(toastHost);
    }
    const node = document.createElement("div");
    node.className = `dg-toast dg-toast--${type}`;
    node.textContent = message;
    toastHost.appendChild(node);
    window.setTimeout(() => {
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 300);
    }, type === "error" ? 6e3 : 3500);
  }
  let idCounter = 1;
  function fieldId(kind) {
    return `dg-${kind}-${(idCounter++).toString(36)}`;
  }
  function nameControl(input, label, kind) {
    const id = fieldId(kind);
    input.id = id;
    input.name = id;
    if (label) {
      label.htmlFor = id;
    }
  }
  function createSlider(options) {
    const row = document.createElement("div");
    row.className = "dg-adjust";
    const handle = hasComponent("wpd-range-field") ? createWpdSlider(options) : createNativeSlider(options);
    row.appendChild(handle.el);
    const reset = createButton({
      label: "↺",
      title: `Reset ${options.label}`,
      variant: "ghost",
      onClick: () => {
        handle.setValue(options.resetTo);
        options.onInput(options.resetTo);
        options.onCommit?.();
      }
    });
    reset.el.classList.add("dg-adjust__reset");
    row.appendChild(reset.el);
    return {
      el: row,
      setValue: handle.setValue,
      destroy: () => {
        handle.destroy();
        reset.destroy();
      }
    };
  }
  function createWpdSlider(options) {
    const field = document.createElement("wpd-range-field");
    field.setAttribute("label", options.label);
    field.setAttribute("min", String(options.min));
    field.setAttribute("max", String(options.max));
    field.setAttribute("step", String(options.step));
    field.setAttribute("value", String(options.value));
    if (options.suffix) {
      field.setAttribute("suffix", options.suffix);
    }
    const onChange = (event) => {
      const detail = event.detail;
      if (detail && typeof detail.value === "number") {
        options.onInput(detail.value);
      }
    };
    field.addEventListener("wpd-range-change", onChange);
    const onRelease = () => options.onCommit?.();
    field.addEventListener("pointerup", onRelease);
    field.addEventListener("keyup", onRelease);
    return {
      el: field,
      setValue: (value) => field.setAttribute("value", String(value)),
      destroy: () => {
        field.removeEventListener("wpd-range-change", onChange);
        field.removeEventListener("pointerup", onRelease);
        field.removeEventListener("keyup", onRelease);
      }
    };
  }
  function createNativeSlider(options) {
    const wrap = document.createElement("div");
    wrap.className = "dg-slider";
    const id = fieldId("slider");
    const label = document.createElement("label");
    label.className = "dg-slider__label";
    label.htmlFor = id;
    label.textContent = options.label;
    const readout = document.createElement("output");
    readout.className = "dg-slider__value";
    readout.htmlFor = id;
    const input = document.createElement("input");
    input.type = "range";
    input.id = id;
    input.name = id;
    input.className = "dg-slider__input";
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.value = String(options.value);
    const paint = (value) => {
      readout.textContent = `${value}${options.suffix ?? ""}`;
      const ratio = (value - options.min) / (options.max - options.min || 1);
      wrap.style.setProperty("--dg-slider-fill", String(ratio));
      wrap.classList.toggle("is-modified", value !== options.resetTo);
    };
    paint(options.value);
    const onInput = () => {
      const value = Number(input.value);
      paint(value);
      options.onInput(value);
    };
    const onChange = () => options.onCommit?.();
    input.addEventListener("input", onInput);
    input.addEventListener("change", onChange);
    const head = document.createElement("div");
    head.className = "dg-slider__head";
    head.append(label, readout);
    wrap.append(head, input);
    return {
      el: wrap,
      setValue: (value) => {
        input.value = String(value);
        paint(value);
      },
      destroy: () => {
        input.removeEventListener("input", onInput);
        input.removeEventListener("change", onChange);
      }
    };
  }
  function createButton(options) {
    const useWpd = hasComponent("wpd-button");
    const el = document.createElement(useWpd ? "wpd-button" : "button");
    el.classList.add("dg-button");
    el.textContent = options.label;
    if (options.title) {
      el.setAttribute("title", options.title);
      el.setAttribute("aria-label", options.title);
    }
    if (useWpd) {
      el.setAttribute("variant", options.variant ?? "ghost");
    } else {
      el.type = "button";
      el.classList.add(`dg-button--${options.variant ?? "ghost"}`);
    }
    el.addEventListener("click", options.onClick);
    return {
      el,
      setDisabled: (disabled) => {
        el.toggleAttribute("disabled", disabled);
        el.classList.toggle("is-disabled", disabled);
        if (useWpd) {
          el.setAttribute("aria-disabled", String(disabled));
        }
      },
      setPressed: (pressed) => {
        el.classList.toggle("is-pressed", pressed);
        el.setAttribute("aria-pressed", String(pressed));
      },
      destroy: () => el.removeEventListener("click", options.onClick)
    };
  }
  function createSelect(options) {
    const useWpd = hasComponent("wpd-select");
    const wrap = document.createElement("div");
    wrap.className = "dg-field";
    const label = document.createElement("label");
    label.className = "dg-field__label";
    label.textContent = options.label;
    const select = document.createElement(useWpd ? "wpd-select" : "select");
    select.className = "dg-field__control";
    if (useWpd) {
      const id = fieldId("select");
      select.id = id;
      label.htmlFor = id;
    } else {
      nameControl(select, label, "select");
    }
    for (const option of options.options) {
      const node = document.createElement(useWpd ? "wpd-option" : "option");
      node.setAttribute("value", option.value);
      node.textContent = option.label;
      select.appendChild(node);
    }
    if (useWpd) {
      select.setAttribute("value", options.value);
    } else {
      select.value = options.value;
    }
    const read = () => useWpd ? select.getAttribute("value") ?? options.value : select.value;
    const onChange = () => options.onChange(read());
    select.addEventListener("change", onChange);
    select.addEventListener("wpd-change", onChange);
    wrap.append(label, select);
    return {
      el: wrap,
      getValue: read,
      destroy: () => {
        select.removeEventListener("change", onChange);
        select.removeEventListener("wpd-change", onChange);
      }
    };
  }
  function createNumberField(options) {
    const tag = pickComponent(["wpd-number-field", "wpd-text-field"]);
    if (tag) {
      const numeric = tag === "wpd-number-field";
      const field = document.createElement(tag);
      if (!options.compact) {
        field.setAttribute("label", options.label);
      } else {
        field.setAttribute("aria-label", options.label);
      }
      field.setAttribute("value", String(Math.round(options.value)));
      field.classList.add("dg-field--compact");
      if (numeric) {
        field.setAttribute("min", String(options.min));
        field.setAttribute("max", String(options.max));
        field.setAttribute("step", String(options.step ?? 1));
      } else {
        field.setAttribute("type", "number");
      }
      if (options.suffix) {
        field.setAttribute("suffix", options.suffix);
      }
      const onChange = (event) => {
        const detail = event.detail;
        if (!detail) {
          return;
        }
        const next = Number(detail.value);
        if (!Number.isFinite(next)) {
          return;
        }
        options.onChange(
          numeric ? next : Math.min(options.max, Math.max(options.min, next))
        );
      };
      field.addEventListener("wpd-input-change", onChange);
      field.addEventListener("wpd-input-commit", onChange);
      const handle = {
        el: field,
        setValue: (value) => field.setAttribute("value", String(value)),
        destroy: () => {
          field.removeEventListener("wpd-input-change", onChange);
          field.removeEventListener("wpd-input-commit", onChange);
        }
      };
      if (!options.compact) {
        return handle;
      }
      const row = document.createElement("div");
      const text2 = document.createElement("span");
      row.className = "dg-field dg-field--compact dg-field--narrow";
      text2.className = "dg-field__label";
      text2.textContent = options.label;
      row.append(text2, field);
      return { ...handle, el: row };
    }
    const wrap = document.createElement("label");
    wrap.className = "dg-field dg-field--compact";
    if (options.compact) {
      wrap.classList.add("dg-field--narrow");
    }
    const text = document.createElement("span");
    text.className = "dg-field__label";
    text.textContent = options.label;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "dg-field__control";
    nameControl(input, null, "number");
    input.value = String(Math.round(options.value));
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step ?? 1);
    const onInput = () => {
      const next = Number(input.value);
      if (Number.isFinite(next)) {
        options.onChange(Math.min(options.max, Math.max(options.min, next)));
      }
    };
    input.addEventListener("input", onInput);
    wrap.append(text, input);
    return {
      el: wrap,
      setValue: (value) => {
        input.value = String(value);
      },
      destroy: () => input.removeEventListener("input", onInput)
    };
  }
  function createColourField(options) {
    if (hasComponent("wpd-color-field")) {
      const field = document.createElement("wpd-color-field");
      field.setAttribute("label", options.label);
      field.setAttribute("value", options.value);
      const onChange = (event) => {
        const detail = event.detail;
        if (detail?.value) {
          options.onChange(detail.value);
        }
      };
      field.addEventListener("wpd-color-change", onChange);
      return {
        el: field,
        setValue: (value) => field.setAttribute("value", String(value)),
        destroy: () => field.removeEventListener("wpd-color-change", onChange)
      };
    }
    const wrap = document.createElement("label");
    wrap.className = "dg-field dg-field--compact";
    const text = document.createElement("span");
    text.className = "dg-field__label";
    text.textContent = options.label;
    const input = document.createElement("input");
    input.type = "color";
    input.className = "dg-field__control dg-colour";
    nameControl(input, null, "colour");
    input.value = options.value;
    const onInput = () => options.onChange(input.value);
    input.addEventListener("input", onInput);
    wrap.append(text, input);
    return {
      el: wrap,
      setValue: (value) => {
        input.value = String(value);
      },
      destroy: () => input.removeEventListener("input", onInput)
    };
  }
  function createSegmented(options) {
    const wrap = document.createElement("div");
    wrap.className = "dg-field dg-field--compact";
    const text = document.createElement("span");
    text.className = "dg-field__label";
    text.textContent = options.label;
    if (hasComponent("wpd-segmented")) {
      const group2 = document.createElement("wpd-segmented");
      group2.setAttribute("value", options.value);
      group2.setAttribute("label", options.label);
      for (const option of options.options) {
        const segment = document.createElement("wpd-segment");
        segment.setAttribute("value", option.value);
        segment.textContent = option.label;
        group2.appendChild(segment);
      }
      const onPick = (event) => {
        const detail = event.detail;
        if (detail?.value) {
          options.onChange(detail.value);
        }
      };
      group2.addEventListener("wpd-pick", onPick);
      wrap.append(text, group2);
      return {
        el: wrap,
        setValue: (value) => group2.setAttribute("value", String(value)),
        destroy: () => group2.removeEventListener("wpd-pick", onPick)
      };
    }
    const group = document.createElement("div");
    group.className = "dg-segmented";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", options.label);
    const buttons = [];
    let current = options.value;
    const paint = () => {
      for (const button of buttons) {
        const on = button.dataset.value === current;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-checked", String(on));
      }
    };
    for (const option of options.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dg-segmented__item";
      button.dataset.value = option.value;
      button.textContent = option.label;
      button.setAttribute("role", "radio");
      button.addEventListener("click", () => {
        current = option.value;
        paint();
        options.onChange(option.value);
      });
      buttons.push(button);
      group.appendChild(button);
    }
    paint();
    wrap.append(text, group);
    return {
      el: wrap,
      setValue: (value) => {
        current = String(value);
        paint();
      },
      destroy: () => {
      }
    };
  }
  function createTextField(options) {
    if (hasComponent("wpd-text-field")) {
      const field = document.createElement("wpd-text-field");
      field.setAttribute("label", options.label);
      field.setAttribute("value", options.value);
      if (options.placeholder) {
        field.setAttribute("placeholder", options.placeholder);
      }
      const read = (event) => event.detail?.value ?? "";
      const onChange = (event) => options.onChange(read(event));
      const onCommit2 = (event) => options.onCommit?.(read(event));
      field.addEventListener("wpd-input-change", onChange);
      field.addEventListener("wpd-input-commit", onCommit2);
      field.addEventListener("wpd-submit", onCommit2);
      return {
        el: field,
        setValue: (value) => field.setAttribute("value", String(value)),
        destroy: () => {
          field.removeEventListener("wpd-input-change", onChange);
          field.removeEventListener("wpd-input-commit", onCommit2);
          field.removeEventListener("wpd-submit", onCommit2);
        }
      };
    }
    const wrap = document.createElement("label");
    wrap.className = "dg-field";
    const text = document.createElement("span");
    text.className = "dg-field__label";
    text.textContent = options.label;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "dg-field__control";
    nameControl(input, null, "text");
    input.value = options.value;
    if (options.placeholder) {
      input.placeholder = options.placeholder;
    }
    const onInput = () => options.onChange(input.value);
    const onCommit = () => options.onCommit?.(input.value);
    input.addEventListener("input", onInput);
    input.addEventListener("change", onCommit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        onCommit();
      }
    });
    wrap.append(text, input);
    return {
      el: wrap,
      setValue: (value) => {
        input.value = String(value);
      },
      destroy: () => {
        input.removeEventListener("input", onInput);
        input.removeEventListener("change", onCommit);
      }
    };
  }
  function createCheckbox(options) {
    if (hasComponent("wpd-checkbox-label")) {
      const field = document.createElement("wpd-checkbox-label");
      field.setAttribute("label", options.label);
      field.toggleAttribute("checked", options.checked);
      if (options.title) {
        field.setAttribute("title", options.title);
      }
      const onChange2 = (event) => {
        const detail = event.detail;
        options.onChange(detail?.checked === true);
      };
      field.addEventListener("wpd-checkbox-change", onChange2);
      return {
        el: field,
        setChecked: (checked) => field.toggleAttribute("checked", checked),
        destroy: () => field.removeEventListener("wpd-checkbox-change", onChange2)
      };
    }
    const wrap = document.createElement("label");
    wrap.className = "dg-check";
    if (options.title) {
      wrap.title = options.title;
    }
    const box = document.createElement("input");
    box.type = "checkbox";
    nameControl(box, null, "check");
    box.checked = options.checked;
    const onChange = () => options.onChange(box.checked);
    box.addEventListener("change", onChange);
    wrap.append(box, document.createTextNode(options.label));
    return {
      el: wrap,
      setChecked: (checked) => {
        box.checked = checked;
      },
      destroy: () => box.removeEventListener("change", onChange)
    };
  }
  function createSection(heading) {
    if (hasComponent("wpd-section")) {
      const section2 = document.createElement("wpd-section");
      section2.setAttribute("heading", heading);
      section2.setAttribute("stack", "");
      section2.classList.add("dg-section");
      return section2;
    }
    const section = document.createElement("section");
    section.className = "dg-section";
    const title = document.createElement("h3");
    title.className = "dg-section__heading";
    title.textContent = heading;
    section.appendChild(title);
    return section;
  }
  function createIconButton(options) {
    const useWpd = hasComponent("wpd-button");
    const el = document.createElement(useWpd ? "wpd-button" : "button");
    el.classList.add("dg-icon-button");
    if (options.className) {
      el.classList.add(options.className);
    }
    el.textContent = options.glyph;
    el.setAttribute("title", options.label);
    el.setAttribute("aria-label", options.label);
    if (useWpd) {
      el.setAttribute("variant", options.variant ?? "ghost");
      el.setAttribute("icon-only", "");
    } else {
      el.type = "button";
      el.classList.add(`dg-button--${options.variant ?? "ghost"}`);
    }
    el.addEventListener("click", options.onClick);
    return {
      el,
      setGlyph: (glyph) => {
        el.textContent = glyph;
      },
      setDisabled: (disabled) => {
        el.toggleAttribute("disabled", disabled);
        el.classList.toggle("is-disabled", disabled);
        if (useWpd) {
          el.setAttribute("aria-disabled", String(disabled));
        }
      },
      setPressed: (pressed) => {
        el.classList.toggle("is-active", pressed);
        el.setAttribute("aria-pressed", String(pressed));
      },
      destroy: () => el.removeEventListener("click", options.onClick)
    };
  }
  function createSwatchGrid(options) {
    const useWpd = hasComponent("wpd-swatch-grid") && hasComponent("wpd-swatch");
    const el = document.createElement(useWpd ? "wpd-swatch-grid" : "div");
    const listeners2 = [];
    el.classList.add("dg-palette");
    el.setAttribute("aria-label", options.label);
    if (!useWpd) {
      el.setAttribute("role", "group");
    }
    const chips = /* @__PURE__ */ new Map();
    for (const colour of options.colours) {
      const chip = document.createElement(useWpd ? "wpd-swatch" : "button");
      chip.classList.add("dg-palette__chip");
      chip.setAttribute("title", colour);
      chip.setAttribute("aria-label", colour);
      if (useWpd) {
        chip.setAttribute("value", colour);
        chip.setAttribute("preview", colour);
        chip.setAttribute("size", "small");
      } else {
        chip.type = "button";
        chip.style.background = colour;
      }
      const onPick = () => options.onChange(colour);
      const event = useWpd ? "wpd-pick" : "click";
      chip.addEventListener(event, onPick);
      listeners2.push(() => chip.removeEventListener(event, onPick));
      chips.set(colour, chip);
      el.appendChild(chip);
    }
    const setValue = (value) => {
      for (const [colour, chip] of chips) {
        const on = colour.toLowerCase() === value.toLowerCase();
        chip.toggleAttribute("selected", on);
        chip.classList.toggle("is-selected", on);
      }
    };
    if (options.value) {
      setValue(options.value);
    }
    return {
      el,
      setValue,
      destroy: () => {
        for (const off of listeners2) {
          off();
        }
      }
    };
  }
  function floatingHost(anchor) {
    return anchor.closest(".dg-editor") ?? document.body;
  }
  function positionFloating(el, anchor, placement = "inline-end") {
    const from = anchor.getBoundingClientRect();
    el.style.position = "fixed";
    el.style.insetInlineStart = "auto";
    el.style.insetBlockStart = "auto";
    const box = el.getBoundingClientRect();
    const gap = 6;
    let left = placement === "inline-end" ? from.right + gap : from.left;
    let top = placement === "inline-end" ? from.top : from.bottom + gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - box.width - gap));
    top = Math.max(gap, Math.min(top, window.innerHeight - box.height - gap));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }
  class OptionsBar {
    constructor(options) {
      this.fields = [];
      this.syncers = [];
      this.render = () => {
        const tool = this.options.getTool();
        for (const field of this.fields) {
          field.destroy();
        }
        this.fields = [];
        this.syncers = [];
        this.el.replaceChildren();
        const name = document.createElement("span");
        name.className = "dg-options__tool";
        name.textContent = TOOL_NAMES[tool] ? __(TOOL_NAMES[tool]) : "";
        this.el.appendChild(name);
        switch (tool) {
          case "select":
            this.renderSelectOptions();
            return;
          case "wand":
            this.renderWandOptions();
            return;
          case "brush":
          case "eraser":
            this.renderBrushOptions(tool === "eraser");
            return;
          case "history":
            this.renderHistoryOptions();
            return;
          case "path":
            this.renderPathOptions();
            return;
          case "retouch":
          case "tone":
            this.renderPixelToolOptions(tool);
            return;
          case "clone":
            this.renderCloneOptions();
            return;
          case "fill":
            this.renderFillOptions();
            return;
          case "gradient":
            this.renderGradientOptions();
            return;
          case "shape":
            this.renderShapeOptions();
            return;
          case "text":
            this.renderTextOptions();
            return;
          case "zoom":
            this.renderZoomOptions();
            return;
        }
        this.hint(TOOL_HINTS[tool] ? __(TOOL_HINTS[tool]) : "");
      };
      this.sync = () => {
        for (const syncer of this.syncers) {
          syncer();
        }
      };
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "dg-options";
      this.el.setAttribute("role", "toolbar");
      this.el.setAttribute("aria-label", __("Tool options"));
      this.offBrush = options.ctx.onBrushChange(() => this.sync());
      this.render();
    }
    /** Shape picker, plus select-all and deselect. */
    renderSelectOptions() {
      this.add(
        createSegmented({
          label: __("Shape"),
          value: this.options.getSelectionShape(),
          options: SELECTION_SHAPES.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => {
            this.options.setSelectionShape(value);
            this.render();
          }
        })
      );
      this.divider();
      this.addSelectionButtons();
      this.hint(
        this.options.getSelectionShape() === "polygon" ? __("Click to add points, Enter to close.") : __("Drag on the image. Escape deselects.")
      );
    }
    /** Tolerance for the wand, plus the same selection buttons. */
    renderWandOptions() {
      this.addToleranceField();
      this.divider();
      this.addSelectionButtons();
      this.hint(__("Click a colour to select the region around it."));
    }
    /** Select-all and deselect, shared by every selection tool. */
    addSelectionButtons() {
      this.add(
        createButton({
          label: __("Select all"),
          variant: "secondary",
          onClick: () => this.options.selectAll()
        })
      );
      const deselect = createButton({
        label: __("Deselect"),
        variant: "ghost",
        onClick: () => {
          this.options.deselect();
          this.render();
        }
      });
      deselect.setDisabled(!this.options.hasSelection());
      this.add(deselect);
    }
    /**
     * Brush size, shape, hardness, opacity and colour.
     *
     * @param erasing Whether the eraser is active, which has no colour.
     */
    renderBrushOptions(erasing) {
      const brush = this.options.ctx.getBrush();
      const shape = createSegmented({
        label: __("Shape"),
        value: brush.shape,
        options: BRUSH_SHAPES.map((entry) => ({
          value: entry.value,
          label: __(entry.label)
        })),
        onChange: (value) => this.options.ctx.setBrush({ shape: value })
      });
      this.add(shape, () => shape.setValue(this.options.ctx.getBrush().shape));
      this.divider();
      this.addSizeField();
      this.addPercentField("hardness", __("Hardness"), 0);
      this.addPercentField("opacity", __("Opacity"), 1);
      if (!erasing) {
        this.divider();
        this.addColourField();
      }
    }
    /**
     * Mode, size, strength and hardness for the retouching and toning brushes.
     *
     * @param tool Which of the two.
     */
    renderPixelToolOptions(tool) {
      const brush = this.options.ctx.getBrush();
      const modes = tool === "retouch" ? RETOUCH_MODES : TONE_MODES;
      const key = tool === "retouch" ? "retouch" : "tone";
      this.add(
        createSegmented({
          label: __("Mode"),
          value: brush[key],
          options: modes.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => this.options.ctx.setBrush({ [key]: value })
        })
      );
      this.divider();
      this.addSizeField();
      this.addPercentField("strength", __("Strength"), 0.5);
      this.addPercentField("hardness", __("Hardness"), 0);
      this.hint(
        tool === "retouch" && brush.retouch === "heal" ? __("Dab over a blemish; it fills from the pixels around it.") : ""
      );
    }
    /** The history brush: size, strength, hardness. */
    renderHistoryOptions() {
      this.addSizeField();
      this.addPercentField("strength", __("Strength"), 1);
      this.addPercentField("hardness", __("Hardness"), 0);
      this.hint(
        __("Paint the original image back, wherever it has been painted over.")
      );
    }
    /** The path tool: fill or outline, width, colour. */
    renderPathOptions() {
      const brush = this.options.ctx.getBrush();
      this.add(
        createSegmented({
          label: __("Style"),
          value: brush.shapeStyle,
          options: [
            { value: "fill", label: __("Fill") },
            { value: "stroke", label: __("Outline") }
          ],
          onChange: (value) => {
            this.options.ctx.setBrush({ shapeStyle: value });
            this.render();
          }
        })
      );
      if (brush.shapeStyle === "stroke") {
        this.add(
          createNumberField({
            compact: true,
            label: __("Width"),
            value: brush.strokeWidth,
            min: 1,
            max: 200,
            suffix: "px",
            onChange: (value) => this.options.ctx.setBrush({ strokeWidth: value })
          })
        );
      }
      this.divider();
      this.addColourField();
      this.addPercentField("opacity", __("Opacity"), 1);
      this.hint(__("Click to place points, Enter to close and draw it."));
    }
    /** Clone stamp: size, strength, and the sample point. */
    renderCloneOptions() {
      this.addSizeField();
      this.addPercentField("strength", __("Strength"), 1);
      this.addPercentField("hardness", __("Hardness"), 0);
      this.divider();
      const clear = createButton({
        label: __("Clear source"),
        variant: "ghost",
        onClick: () => {
          this.options.clearCloneSource();
          this.render();
        }
      });
      clear.setDisabled(!this.options.hasCloneSource());
      this.add(clear);
      this.hint(
        this.options.hasCloneSource() ? __("Drag to paint from the sample point. Alt-click to move it.") : __("Alt-click to set the point you want to copy from.")
      );
    }
    /** Fill tolerance and colour. */
    renderFillOptions() {
      this.addToleranceField();
      this.addPercentField("opacity", __("Opacity"), 1);
      this.divider();
      this.addColourField();
    }
    /** Gradient kind, endpoints and opacity. */
    renderGradientOptions() {
      const brush = this.options.ctx.getBrush();
      this.add(
        createSegmented({
          label: __("Ramp"),
          value: brush.gradient,
          options: GRADIENT_KINDS.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => this.options.ctx.setBrush({ gradient: value })
        })
      );
      this.divider();
      this.addColourField();
      if (!brush.gradientFade) {
        const to = createColourField({
          label: __("To"),
          value: brush.background,
          onChange: (value) => this.options.ctx.setBrush({ background: value })
        });
        this.add(
          to,
          () => to.setValue(this.options.ctx.getBrush().background)
        );
      }
      this.add(
        createCheckbox({
          label: __("Fade out"),
          checked: brush.gradientFade,
          title: __("End transparent instead of at the background colour."),
          onChange: (checked) => {
            this.options.ctx.setBrush({ gradientFade: checked });
            this.render();
          }
        })
      );
      this.addPercentField("opacity", __("Opacity"), 1);
      this.hint(__("Drag to set the direction and length of the ramp."));
    }
    /** Shape kind, fill or outline, width and colour. */
    renderShapeOptions() {
      const brush = this.options.ctx.getBrush();
      this.add(
        createSelect({
          label: __("Shape"),
          value: brush.shapeKind,
          options: SHAPE_KINDS.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => {
            this.options.ctx.setBrush({ shapeKind: value });
            this.render();
          }
        })
      );
      if (brush.shapeKind !== "line") {
        this.add(
          createSegmented({
            label: __("Style"),
            value: brush.shapeStyle,
            options: [
              { value: "fill", label: __("Fill") },
              { value: "stroke", label: __("Outline") }
            ],
            onChange: (value) => {
              this.options.ctx.setBrush({ shapeStyle: value });
              this.render();
            }
          })
        );
      }
      if (brush.shapeKind === "line" || brush.shapeStyle === "stroke") {
        this.add(
          createNumberField({
            compact: true,
            label: __("Width"),
            value: brush.strokeWidth,
            min: 1,
            max: 200,
            suffix: "px",
            onChange: (value) => this.options.ctx.setBrush({ strokeWidth: value })
          })
        );
      }
      this.divider();
      this.addColourField();
      this.addPercentField("opacity", __("Opacity"), 1);
      this.hint(__("Drag on the image. Hold Shift to keep it square."));
    }
    /** The text itself, its size, family and weight. */
    renderTextOptions() {
      const brush = this.options.ctx.getBrush();
      this.add(
        createSelect({
          label: __("Font"),
          value: brush.fontFamily,
          options: FONT_STACKS.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => this.options.ctx.setBrush({ fontFamily: value })
        })
      );
      this.add(
        createNumberField({
          compact: true,
          label: __("Size"),
          value: brush.fontSize,
          min: 6,
          max: 1200,
          suffix: "px",
          onChange: (value) => this.options.ctx.setBrush({ fontSize: value })
        })
      );
      this.add(
        createCheckbox({
          label: __("Bold"),
          checked: brush.bold,
          onChange: (checked) => this.options.ctx.setBrush({ bold: checked })
        })
      );
      this.add(
        createCheckbox({
          label: __("Italic"),
          checked: brush.italic,
          onChange: (checked) => this.options.ctx.setBrush({ italic: checked })
        })
      );
      this.divider();
      this.addColourField();
      this.hint(
        this.options.isTypingText() ? __("Enter for a new line. Cmd/Ctrl+Enter finishes, Escape cancels.") : __("Click on the image and type.")
      );
    }
    /** Fit and actual-size buttons. */
    renderZoomOptions() {
      this.add(
        createButton({
          label: __("Fit"),
          variant: "secondary",
          onClick: () => this.options.setZoom("fit")
        })
      );
      this.add(
        createButton({
          label: __("100%"),
          variant: "secondary",
          onClick: () => this.options.setZoom("actual")
        })
      );
      this.hint(__("Click to zoom in, Alt-click to zoom out."));
    }
    /** The brush diameter, shared by every stroking tool. */
    addSizeField() {
      const field = createNumberField({
        compact: true,
        label: __("Size"),
        value: this.options.ctx.getBrush().size,
        min: 1,
        max: 400,
        suffix: "px",
        onChange: (value) => this.options.ctx.setBrush({ size: value })
      });
      this.add(field, () => field.setValue(this.options.ctx.getBrush().size));
    }
    /** Flood fill and wand match tolerance. */
    addToleranceField() {
      const field = createNumberField({
        compact: true,
        label: __("Tolerance"),
        value: this.options.ctx.getBrush().tolerance,
        min: 0,
        max: 128,
        onChange: (value) => this.options.ctx.setBrush({ tolerance: value })
      });
      this.add(field, () => field.setValue(this.options.ctx.getBrush().tolerance));
    }
    /**
     * A 0..1 setting shown as a percentage.
     *
     * @param key      Which setting.
     * @param label    Field label.
     * @param floorOne Whether zero is meaningless, so the field starts at 1%.
     */
    addPercentField(key, label, floorOne) {
      const field = createNumberField({
        compact: true,
        label,
        value: Math.round(this.options.ctx.getBrush()[key] * 100),
        min: floorOne === 0 ? 0 : 1,
        max: 100,
        suffix: "%",
        onChange: (value) => this.options.ctx.setBrush({ [key]: value / 100 })
      });
      this.add(
        field,
        () => field.setValue(Math.round(this.options.ctx.getBrush()[key] * 100))
      );
    }
    /**
     * The foreground colour, which most tools paint with.
     *
     * @param label Optional. Field label.
     */
    addColourField(label = __("Colour")) {
      const field = createColourField({
        label,
        value: this.options.ctx.getBrush().colour,
        onChange: (value) => this.options.ctx.setBrush({ colour: value })
      });
      this.add(field, () => field.setValue(this.options.ctx.getBrush().colour));
    }
    /**
     * Appends a muted hint.
     *
     * @param text Guidance text.
     */
    hint(text) {
      if (!text) {
        return;
      }
      const hint = document.createElement("span");
      hint.className = "dg-options__hint";
      hint.textContent = text;
      this.el.appendChild(hint);
    }
    /**
     * Adds a control and remembers it for teardown.
     *
     * @param handle The control.
     * @param sync   Optional. Pushes the current setting into it.
     */
    add(handle, sync) {
      this.fields.push(handle);
      if (sync) {
        this.syncers.push(sync);
      }
      this.el.appendChild(handle.el);
    }
    /**
     * A separator between groups of controls.
     */
    divider() {
      const rule = document.createElement("span");
      rule.className = "dg-options__divider";
      rule.setAttribute("aria-hidden", "true");
      this.el.appendChild(rule);
    }
    /** Releases listeners. */
    destroy() {
      this.offBrush();
      for (const field of this.fields) {
        field.destroy();
      }
      this.fields = [];
      this.el.remove();
    }
  }
  const TOOL_NAMES = {
    transform: "Move & transform",
    select: "Select",
    wand: "Magic wand",
    crop: "Crop",
    eyedropper: "Eyedropper",
    retouch: "Retouch",
    brush: "Brush",
    history: "History brush",
    clone: "Clone stamp",
    eraser: "Eraser",
    fill: "Fill",
    gradient: "Gradient",
    tone: "Dodge & burn",
    text: "Text",
    shape: "Shape",
    path: "Path",
    hand: "Hand",
    zoom: "Zoom"
  };
  const TOOL_HINTS = {
    transform: "Drag to move, corners scale, edges scale one axis, top handle rotates. Alt bypasses snapping.",
    crop: "Drag a rectangle, then apply it from the Canvas & crop panel.",
    eyedropper: "Click or drag to sample a colour into the foreground swatch.",
    hand: "Drag to move the view. Scrolling does the same thing from any tool."
  };
  function loadElement(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener(
        "error",
        () => reject(new Error(`Could not load image from ${url}`)),
        { once: true }
      );
      image.src = url;
    });
  }
  async function loadSourceImage(payload, client) {
    try {
      const image = await loadElement(payload.url);
      return { image, release: () => {
      }, via: "direct" };
    } catch {
    }
    const blob = await client.getSourceBlob(payload.sourceUrl);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await loadElement(objectUrl);
      return {
        image,
        release: () => URL.revokeObjectURL(objectUrl),
        via: "proxy"
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
  class RestError extends Error {
    constructor(message, code, status) {
      super(message);
      this.name = "RestError";
      this.code = code;
      this.status = status;
    }
  }
  async function toError(response) {
    let message = `Request failed with status ${response.status}.`;
    let code = "daguerre_http_error";
    try {
      const body = await response.json();
      if (body && typeof body === "object") {
        if (typeof body.message === "string") {
          message = body.message;
        }
        if (typeof body.code === "string") {
          code = body.code;
        }
      }
    } catch {
    }
    return new RestError(message, code, response.status);
  }
  class RestClient {
    /**
     * @param config Runtime configuration from `window.daguerreConfig`.
     */
    constructor(config) {
      this.config = config;
    }
    /** Headers every authenticated call needs. */
    headers(extra = {}) {
      return { "X-WP-Nonce": this.config.restNonce, ...extra };
    }
    /**
     * Fetches everything needed to open an image.
     *
     * @param attachmentId Attachment to open.
     */
    async getMedia(attachmentId) {
      const response = await request(`${this.config.restUrl}media/${attachmentId}`, {
        credentials: "same-origin",
        headers: this.headers()
      });
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /**
     * Uploads a rendered image and creates a new attachment.
     *
     * Sent as multipart rather than JSON with a base64 payload: a full-resolution
     * PNG can be tens of megabytes, and base64 would inflate that by a third before
     * it ever reached the wire.
     *
     * @param attachmentId Attachment the edit was rendered from.
     * @param blob         Encoded image.
     * @param recipe       The edit, for storage alongside the result.
     */
    async saveRender(attachmentId, blob, recipe) {
      const body = new FormData();
      body.append("file", blob, "render");
      body.append("recipe", JSON.stringify(recipe));
      const response = await request(
        `${this.config.restUrl}media/${attachmentId}/render`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: this.headers(),
          body
        }
      );
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /** Lists the current user's presets. */
    async getPresets() {
      const response = await request(`${this.config.restUrl}presets`, {
        credentials: "same-origin",
        headers: this.headers()
      });
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /**
     * Saves the current edit as a named preset.
     *
     * @param name   Display name.
     * @param recipe The edit to derive it from.
     */
    async createPreset(name, recipe) {
      const response = await request(`${this.config.restUrl}presets`, {
        method: "POST",
        credentials: "same-origin",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name, recipe: JSON.stringify(recipe) })
      });
      if (!response.ok) {
        throw await toError(response);
      }
      return await response.json();
    }
    /**
     * Deletes a preset.
     *
     * @param id Preset identifier.
     */
    async deletePreset(id) {
      const response = await request(`${this.config.restUrl}presets/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: this.headers()
      });
      if (!response.ok) {
        throw await toError(response);
      }
    }
    /**
     * Streams the original bytes from the same origin as wp-admin.
     *
     * Only used when a direct load tainted or failed -- see `loadSourceImage()`.
     *
     * @param sourceUrl Absolute URL of the `/source` route.
     */
    async getSourceBlob(sourceUrl) {
      const response = await request(sourceUrl, {
        credentials: "same-origin",
        headers: this.headers()
      });
      if (!response.ok) {
        throw await toError(response);
      }
      return response.blob();
    }
  }
  const MIN_SIZE = 0.02;
  class CropOverlay {
    constructor(options) {
      this.rect = { x: 0, y: 0, w: 1, h: 1 };
      this.aspect = 0;
      this.active = null;
      this.sync = () => {
        const viewport = this.options.getViewport();
        if (!viewport) {
          this.root.hidden = true;
          return;
        }
        this.root.hidden = false;
        this.root.style.insetInlineStart = `${viewport.x}px`;
        this.root.style.insetBlockStart = `${viewport.y}px`;
        this.root.style.inlineSize = `${viewport.width}px`;
        this.root.style.blockSize = `${viewport.height}px`;
        const rect = this.rect;
        for (const layer of [this.box, this.dim]) {
          layer.style.insetInlineStart = `${rect.x * 100}%`;
          layer.style.insetBlockStart = `${rect.y * 100}%`;
          layer.style.inlineSize = `${rect.w * 100}%`;
          layer.style.blockSize = `${rect.h * 100}%`;
        }
      };
      this.onPointerDown = (event) => {
        const target = event.target;
        const handle = target.dataset?.handle ?? "move";
        const viewport = this.options.getViewport();
        if (!viewport) {
          return;
        }
        this.active = {
          handle,
          startX: event.clientX,
          startY: event.clientY,
          startRect: { ...this.rect },
          viewport: { width: viewport.width, height: viewport.height }
        };
        event.preventDefault();
        event.stopPropagation();
        this.listen();
      };
      this.onPointerMove = (event) => {
        if (!this.active) {
          return;
        }
        const { viewport } = this.active;
        if (viewport.width === 0 || viewport.height === 0) {
          return;
        }
        const dx = (event.clientX - this.active.startX) / viewport.width;
        const dy = (event.clientY - this.active.startY) / viewport.height;
        this.rect = this.resize(this.active.startRect, this.active.handle, dx, dy);
        this.options.onChange?.(this.rect);
        this.sync();
      };
      this.onPointerUp = () => {
        this.unlisten();
        if (!this.active) {
          return;
        }
        this.active = null;
        this.options.onChange?.(this.rect);
      };
      this.options = options;
      this.root = document.createElement("div");
      this.root.className = "dg-crop";
      this.root.setAttribute("aria-hidden", "true");
      const clip = document.createElement("div");
      clip.className = "dg-crop__clip";
      this.dim = document.createElement("div");
      this.dim.className = "dg-crop__dim";
      clip.appendChild(this.dim);
      this.box = document.createElement("div");
      this.box.className = "dg-crop__box";
      for (const line of ["v1", "v2", "h1", "h2"]) {
        const guide = document.createElement("span");
        guide.className = `dg-crop__guide dg-crop__guide--${line}`;
        this.box.appendChild(guide);
      }
      for (const handle of ["nw", "ne", "sw", "se", "n", "s", "w", "e"]) {
        const grip = document.createElement("span");
        grip.className = `dg-crop__handle dg-crop__handle--${handle}`;
        grip.dataset.handle = handle;
        this.box.appendChild(grip);
      }
      this.root.append(clip, this.box);
      options.stage.appendChild(this.root);
      this.box.addEventListener("pointerdown", this.onPointerDown);
      this.sync();
    }
    /** Starts tracking a drag on the window. */
    listen() {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
      window.addEventListener("blur", this.onPointerUp);
    }
    /** Stops tracking. Safe to call when not tracking. */
    unlisten() {
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("pointercancel", this.onPointerUp);
      window.removeEventListener("blur", this.onPointerUp);
    }
    /**
     * Applies a drag delta to a rectangle.
     *
     * @param start  Rectangle at the start of the drag.
     * @param handle Which handle is being dragged.
     * @param dx     Horizontal delta, as a fraction of the frame.
     * @param dy     Vertical delta, as a fraction of the frame.
     */
    resize(start, handle, dx, dy) {
      if (handle === "move") {
        return clampRect({ ...start, x: start.x + dx, y: start.y + dy });
      }
      let { x, y, w, h } = start;
      if (handle.includes("w")) {
        const nx = Math.min(x + w - MIN_SIZE, Math.max(0, x + dx));
        w += x - nx;
        x = nx;
      }
      if (handle.includes("e")) {
        w = Math.min(1 - x, Math.max(MIN_SIZE, w + dx));
      }
      if (handle.includes("n")) {
        const ny = Math.min(y + h - MIN_SIZE, Math.max(0, y + dy));
        h += y - ny;
        y = ny;
      }
      if (handle.includes("s")) {
        h = Math.min(1 - y, Math.max(MIN_SIZE, h + dy));
      }
      const aspect = this.aspect;
      if (aspect > 0) {
        const viewport = this.active?.viewport;
        const frameAspect = viewport && viewport.height > 0 ? viewport.width / viewport.height : 1;
        const relative = aspect / frameAspect;
        if (handle === "n" || handle === "s") {
          w = h * relative;
        } else {
          h = w / relative;
        }
        if (handle.includes("n")) {
          y = start.y + start.h - h;
        }
        if (handle.includes("w")) {
          x = start.x + start.w - w;
        }
      }
      return clampRect({ x, y, w, h });
    }
    /** The rectangle as it currently stands. */
    getRect() {
      return { ...this.rect };
    }
    /**
     * Replaces the rectangle.
     *
     * @param rect New rectangle.
     */
    setRect(rect) {
      this.rect = clampRect(rect);
      this.sync();
    }
    /**
     * Constrains dragging to an aspect ratio.
     *
     * @param aspect Width divided by height, or 0 for free.
     */
    setAspect(aspect) {
      this.aspect = aspect;
    }
    /** Whether the overlay is on screen. */
    setVisible(visible) {
      this.root.style.display = visible ? "" : "none";
      this.root.title = visible ? __("Drag to crop, then apply") : "";
    }
    /** Removes the overlay. */
    destroy() {
      this.unlisten();
      this.box.removeEventListener("pointerdown", this.onPointerDown);
      this.root.remove();
    }
  }
  const GRAB_RADIUS = 12;
  const DELETE_DISTANCE = 40;
  class CurveEditor {
    constructor(options) {
      this.dragIndex = -1;
      this.resizeObserver = null;
      this.sync = () => this.draw();
      this.onPointerDown = (event) => {
        const points = [...this.options.getPoints()];
        const at = this.toGraph(event);
        let index = points.findIndex(
          ([px, py]) => Math.hypot(px - at.x, py - at.y) < GRAB_RADIUS
        );
        if (index === -1) {
          points.push([at.x, at.y]);
          points.sort((a, b) => a[0] - b[0]);
          index = points.findIndex((p) => p[0] === at.x && p[1] === at.y);
          this.options.onChange(points);
        }
        this.dragIndex = index;
        this.canvas.setPointerCapture(event.pointerId);
        this.canvas.addEventListener("pointermove", this.onPointerMove);
        this.canvas.addEventListener("pointerup", this.onPointerUp);
        event.preventDefault();
        this.draw();
      };
      this.onPointerMove = (event) => {
        if (this.dragIndex < 0) {
          return;
        }
        const points = this.options.getPoints().map((p) => [...p]);
        if (!points[this.dragIndex]) {
          return;
        }
        const at = this.toGraph(event);
        const isEndpoint = this.dragIndex === 0 || this.dragIndex === points.length - 1;
        points[this.dragIndex] = [
          isEndpoint ? points[this.dragIndex][0] : at.x,
          at.y
        ];
        this.options.onChange(points);
        this.draw();
      };
      this.onPointerUp = (event) => {
        const points = this.options.getPoints().map((p) => [...p]);
        const index = this.dragIndex;
        this.dragIndex = -1;
        this.canvas.releasePointerCapture?.(event.pointerId);
        this.canvas.removeEventListener("pointermove", this.onPointerMove);
        this.canvas.removeEventListener("pointerup", this.onPointerUp);
        const at = this.toGraph(event);
        const outside = at.x < -DELETE_DISTANCE || at.x > 255 + DELETE_DISTANCE || at.y < -DELETE_DISTANCE || at.y > 255 + DELETE_DISTANCE;
        if (outside && index > 0 && index < points.length - 1) {
          points.splice(index, 1);
          this.options.onChange(points);
        }
        this.options.onCommit();
        this.draw();
      };
      this.onDoubleClick = (event) => {
        event.preventDefault();
        this.options.onChange([
          [0, 0],
          [255, 255]
        ]);
        this.options.onCommit();
        this.draw();
      };
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "dg-curve";
      this.canvas = document.createElement("canvas");
      this.canvas.className = "dg-curve__canvas";
      this.canvas.setAttribute("role", "img");
      this.canvas.setAttribute(
        "aria-label",
        __("Tone curve. Drag to add or move control points.")
      );
      this.canvas.tabIndex = 0;
      this.el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("dblclick", this.onDoubleClick);
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => this.draw());
        this.resizeObserver.observe(this.el);
      }
      this.draw();
    }
    /** Converts a pointer event into graph coordinates, 0..255 with y up. */
    toGraph(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / rect.width * 255,
        y: (1 - (event.clientY - rect.top) / rect.height) * 255
      };
    }
    /** Paints the grid, the curve and its control points. */
    draw() {
      if (!this.ctx) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const rect = this.el.getBoundingClientRect();
      const size = Math.max(1, Math.round(Math.min(rect.width, rect.width)));
      if (this.canvas.width !== size * dpr) {
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = `${size}px`;
        this.canvas.style.height = `${size}px`;
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const toCanvas = (x, y) => ({
        cx: x / 255 * size,
        cy: (1 - y / 255) * size
      });
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const at = i / 4 * size;
        ctx.beginPath();
        ctx.moveTo(at, 0);
        ctx.lineTo(at, size);
        ctx.moveTo(0, at);
        ctx.lineTo(size, at);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.stroke();
      const points = this.options.getPoints();
      const sampled = sampleCurve(points);
      ctx.strokeStyle = "#f0f0f1";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < 256; x++) {
        const { cx, cy } = toCanvas(x, sampled[x]);
        if (x === 0) {
          ctx.moveTo(cx, cy);
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.stroke();
      points.forEach(([x, y], index) => {
        const { cx, cy } = toCanvas(x, y);
        ctx.beginPath();
        ctx.arc(cx, cy, index === this.dragIndex ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = index === this.dragIndex ? "#3582c4" : "#f0f0f1";
        ctx.fill();
      });
    }
    /** Releases listeners. */
    destroy() {
      this.resizeObserver?.disconnect();
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    }
  }
  const SNAP_DEGREES = 15;
  const SNAP_PX = 7;
  class TransformOverlay {
    constructor(options) {
      this.start = null;
      this.sync = () => {
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!viewport || canvas.width <= 0) {
          this.root.hidden = true;
          return;
        }
        this.root.hidden = false;
        this.root.style.insetInlineStart = `${viewport.x}px`;
        this.root.style.insetBlockStart = `${viewport.y}px`;
        this.root.style.inlineSize = `${viewport.width}px`;
        this.root.style.blockSize = `${viewport.height}px`;
        const transform = this.options.getTransform();
        const image = this.options.getImageSize();
        const ratio = viewport.width / canvas.width;
        const width = image.width * transform.scaleX * ratio;
        const height = image.height * transform.scaleY * ratio;
        this.box.style.inlineSize = `${width}px`;
        this.box.style.blockSize = `${height}px`;
        this.box.style.insetInlineStart = `${transform.x * viewport.width - width / 2}px`;
        this.box.style.insetBlockStart = `${transform.y * viewport.height - height / 2}px`;
        this.box.style.transform = `rotate(${transform.rotation}deg)`;
      };
      this.onPointerDown = (event) => {
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!viewport || canvas.width <= 0) {
          return;
        }
        const target = event.target;
        const handle = target.dataset?.handle ?? "move";
        const transform = this.options.getTransform();
        const stageRect = this.options.stage.getBoundingClientRect();
        const centreX = stageRect.left + viewport.x + transform.x * viewport.width;
        const centreY = stageRect.top + viewport.y + transform.y * viewport.height;
        const dx = event.clientX - centreX;
        const dy = event.clientY - centreY;
        this.start = {
          handle,
          pointerX: event.clientX,
          pointerY: event.clientY,
          transform: { ...transform },
          pixelRatio: viewport.width / canvas.width,
          centreX,
          centreY,
          angle: Math.atan2(dy, dx) * 180 / Math.PI,
          distance: Math.max(1, Math.hypot(dx, dy)),
          ...projectLocal(dx, dy, transform.rotation)
        };
        event.preventDefault();
        event.stopPropagation();
        this.listen();
      };
      this.onPointerMove = (event) => {
        const start = this.start;
        if (!start) {
          return;
        }
        const canvas = this.options.getCanvas();
        if (start.handle === "move") {
          const dx2 = (event.clientX - start.pointerX) / start.pixelRatio;
          const dy2 = (event.clientY - start.pointerY) / start.pixelRatio;
          let x = start.transform.x + dx2 / canvas.width;
          let y = start.transform.y + dy2 / canvas.height;
          if (this.options.getSnapping() && !event.altKey) {
            const image = this.options.getImageSize();
            const halfW = image.width * start.transform.scaleX / 2 / canvas.width;
            const halfH = image.height * start.transform.scaleY / 2 / canvas.height;
            const toleranceX = SNAP_PX / start.pixelRatio / canvas.width;
            const toleranceY = SNAP_PX / start.pixelRatio / canvas.height;
            const snappedX = snap(
              x,
              [0.5, halfW, 1 - halfW],
              toleranceX
            );
            const snappedY = snap(
              y,
              [0.5, halfH, 1 - halfH],
              toleranceY
            );
            x = snappedX.value;
            y = snappedY.value;
            this.showGuide(this.guideX, snappedX.hit ? x : null, "v");
            this.showGuide(this.guideY, snappedY.hit ? y : null, "h");
          } else {
            this.guideX.hidden = true;
            this.guideY.hidden = true;
          }
          this.options.onChange({ ...start.transform, x, y });
          this.sync();
          return;
        }
        if (start.handle === "rotate") {
          const angle = Math.atan2(
            event.clientY - start.centreY,
            event.clientX - start.centreX
          ) * 180 / Math.PI;
          let rotation = start.transform.rotation + (angle - start.angle);
          if (event.shiftKey) {
            rotation = Math.round(rotation / SNAP_DEGREES) * SNAP_DEGREES;
          }
          this.options.onChange({
            ...start.transform,
            rotation: normaliseAngle(rotation)
          });
          this.sync();
          return;
        }
        const dx = event.clientX - start.centreX;
        const dy = event.clientY - start.centreY;
        const local = projectLocal(dx, dy, start.transform.rotation);
        const bound = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
        if (start.handle === "e" || start.handle === "w") {
          this.options.onChange({
            ...start.transform,
            scaleX: bound(start.transform.scaleX * (local.localX / start.localX))
          });
          this.sync();
          return;
        }
        if (start.handle === "n" || start.handle === "s") {
          this.options.onChange({
            ...start.transform,
            scaleY: bound(start.transform.scaleY * (local.localY / start.localY))
          });
          this.sync();
          return;
        }
        if (event.shiftKey) {
          this.options.onChange({
            ...start.transform,
            scaleX: bound(start.transform.scaleX * (local.localX / start.localX)),
            scaleY: bound(start.transform.scaleY * (local.localY / start.localY))
          });
          this.sync();
          return;
        }
        const ratio = Math.hypot(dx, dy) / start.distance;
        this.options.onChange({
          ...start.transform,
          scaleX: bound(start.transform.scaleX * ratio),
          scaleY: bound(start.transform.scaleY * ratio)
        });
        this.sync();
      };
      this.onPointerUp = () => {
        this.unlisten();
        if (!this.start) {
          return;
        }
        this.start = null;
        this.guideX.hidden = true;
        this.guideY.hidden = true;
        this.options.onCommit();
      };
      this.options = options;
      this.root = document.createElement("div");
      this.root.className = "dg-transform";
      this.box = document.createElement("div");
      this.box.className = "dg-transform__box";
      this.box.dataset.handle = "move";
      this.box.title = __(
        "Drag to move. Corners scale both axes, edges scale one, the top handle rotates. Hold Shift on a corner to scale freely."
      );
      for (const handle of [
        "nw",
        "ne",
        "sw",
        "se",
        "n",
        "s",
        "w",
        "e"
      ]) {
        const grip = document.createElement("span");
        grip.className = `dg-transform__handle dg-transform__handle--${handle}`;
        grip.dataset.handle = handle;
        this.box.appendChild(grip);
      }
      this.guideX = document.createElement("span");
      this.guideX.className = "dg-snap dg-snap--v";
      this.guideX.hidden = true;
      this.guideY = document.createElement("span");
      this.guideY.className = "dg-snap dg-snap--h";
      this.guideY.hidden = true;
      const stem = document.createElement("span");
      stem.className = "dg-transform__stem";
      this.box.appendChild(stem);
      const rotate = document.createElement("span");
      rotate.className = "dg-transform__handle dg-transform__handle--rotate";
      rotate.dataset.handle = "rotate";
      rotate.title = __("Rotate. Hold Shift to snap.");
      this.box.appendChild(rotate);
      this.root.append(this.guideX, this.guideY, this.box);
      options.stage.appendChild(this.root);
      this.box.addEventListener("pointerdown", this.onPointerDown);
      this.sync();
    }
    /** Starts tracking a drag on the window. */
    listen() {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
      window.addEventListener("blur", this.onPointerUp);
    }
    /** Stops tracking. Safe to call when not tracking. */
    unlisten() {
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("pointercancel", this.onPointerUp);
      window.removeEventListener("blur", this.onPointerUp);
    }
    /**
     * Positions a snap guide.
     *
     * @param element Guide element.
     * @param at      Normalised position, or null to hide it.
     * @param axis    Which guide.
     */
    showGuide(element, at, axis) {
      if (at === null) {
        element.hidden = true;
        return;
      }
      element.hidden = false;
      if (axis === "v") {
        element.style.insetInlineStart = `${at * 100}%`;
      } else {
        element.style.insetBlockStart = `${at * 100}%`;
      }
    }
    /** Whether the handles are on screen. */
    setVisible(visible) {
      this.root.style.display = visible ? "" : "none";
      if (!visible) {
        this.guideX.hidden = true;
        this.guideY.hidden = true;
      }
    }
    /** Removes the overlay. */
    destroy() {
      this.unlisten();
      this.box.removeEventListener("pointerdown", this.onPointerDown);
      this.root.remove();
    }
  }
  function projectLocal(dx, dy, rotation) {
    const radians = rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      localX: Math.max(1, Math.abs(dx * cos + dy * sin)),
      localY: Math.max(1, Math.abs(-dx * sin + dy * cos))
    };
  }
  function snap(value, targets, tolerance) {
    let best = value;
    let bestDistance = tolerance;
    let hit = false;
    for (const target of targets) {
      const distance = Math.abs(value - target);
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
        hit = true;
      }
    }
    return { value: best, hit };
  }
  const CHANNEL_COLOURS = ["#ff4d4d", "#4dff88", "#4d9dff"];
  class HistogramView {
    constructor() {
      this.last = null;
      this.resizeObserver = null;
      this.el = document.createElement("div");
      this.el.className = "dg-histogram";
      this.el.setAttribute("role", "img");
      this.el.setAttribute("aria-label", "Tone distribution of the edited image");
      this.canvas = document.createElement("canvas");
      this.canvas.className = "dg-histogram__canvas";
      this.el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => this.redraw());
        this.resizeObserver.observe(this.el);
      }
    }
    /**
     * Replaces the plotted data.
     *
     * @param histogram Bucket counts.
     */
    update(histogram) {
      this.last = histogram;
      this.redraw();
    }
    /** Re-renders the last histogram at the current element size. */
    redraw() {
      if (!this.ctx) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const rect = this.el.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const histogram = this.last;
      if (!histogram || histogram.total === 0 || histogram.peak === 0) {
        return;
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      [histogram.r, histogram.g, histogram.b].forEach((bins, index) => {
        ctx.fillStyle = CHANNEL_COLOURS[index];
        ctx.globalAlpha = 0.55;
        this.fillCurve(ctx, bins, histogram.peak, width, height);
      });
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1;
      this.strokeCurve(ctx, histogram.luma, histogram.peak, width, height);
      ctx.restore();
    }
    /**
     * Builds the path for one channel.
     *
     * Counts above `peak` are clamped to the top rather than rescaling everything,
     * so a clipping spike reads as a bar running off the plot instead of flattening
     * the whole curve. See `histogramPeak()` for why the peak excludes the extremes.
     */
    traceCurve(ctx, bins, peak, width, height) {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < 256; i++) {
        const x = i / 255 * width;
        const y = height - Math.min(1, bins[i] / peak) * height;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
    }
    /** Fills one channel's curve. */
    fillCurve(ctx, bins, peak, width, height) {
      this.traceCurve(ctx, bins, peak, width, height);
      ctx.closePath();
      ctx.fill();
    }
    /** Strokes one channel's curve. */
    strokeCurve(ctx, bins, peak, width, height) {
      this.traceCurve(ctx, bins, peak, width, height);
      ctx.stroke();
    }
    /** Releases the resize observer. */
    destroy() {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
    }
  }
  const STORAGE_KEY = "daguerre.panels.v1";
  const registry = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  function registerPanel(def) {
    registry.set(def.id, def);
    for (const listener of listeners) {
      listener();
    }
  }
  function unregisterPanel(id) {
    if (registry.delete(id)) {
      for (const listener of listeners) {
        listener();
      }
    }
  }
  function listPanels() {
    return [...registry.values()].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100)
    );
  }
  function onPanelsChanged(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function readState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function writeState(state2) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state2));
    } catch {
    }
  }
  class PanelHost {
    /**
     * @param root   Sidebar element to fill.
     * @param ctx    Context handed to every panel.
     * @param onHide Optional. Called when the user closes the sidebar.
     */
    constructor(root, ctx, onHide) {
      this.teardowns = [];
      this.picker = null;
      this.root = root;
      this.ctx = ctx;
      this.onHide = onHide;
      this.state = readState();
      this.buildChrome();
      this.render();
      this.unsubscribe = onPanelsChanged(() => this.render());
    }
    /** Builds the sidebar header and the panel container. */
    buildChrome() {
      this.root.replaceChildren();
      const header = document.createElement("div");
      header.className = "dg-sidebar__header";
      const label = document.createElement("span");
      label.className = "dg-sidebar__title";
      label.textContent = __("Tools");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "dg-sidebar__picker-toggle";
      toggle.textContent = "⋯";
      toggle.title = __("Choose which tools are shown");
      toggle.setAttribute("aria-label", __("Choose which tools are shown"));
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => this.togglePicker(toggle));
      const actions = document.createElement("div");
      actions.className = "dg-sidebar__actions";
      actions.appendChild(toggle);
      if (this.onHide) {
        const hide = document.createElement("button");
        hide.type = "button";
        hide.className = "dg-sidebar__hide";
        hide.textContent = "⟩";
        hide.title = __("Hide the tools");
        hide.setAttribute("aria-label", __("Hide the tools"));
        hide.addEventListener("click", () => this.onHide?.());
        actions.appendChild(hide);
      }
      header.append(label, actions);
      this.stack = document.createElement("div");
      this.stack.className = "dg-panels";
      this.root.append(header, this.stack);
    }
    /**
     * Opens or closes the tool picker.
     *
     * @param toggle The button that owns it.
     */
    togglePicker(toggle) {
      if (this.picker) {
        this.picker.remove();
        this.picker = null;
        toggle.setAttribute("aria-expanded", "false");
        return;
      }
      const menu = document.createElement("div");
      menu.className = "dg-picker-menu";
      menu.setAttribute("role", "group");
      menu.setAttribute("aria-label", __("Tools"));
      for (const def of listPanels()) {
        const row = createCheckbox({
          label: def.title,
          checked: this.isVisible(def),
          onChange: (checked) => {
            this.setPanelState(def.id, { hidden: !checked });
            this.render();
          }
        });
        row.el.classList.add("dg-picker-menu__item");
        menu.appendChild(row.el);
      }
      toggle.setAttribute("aria-expanded", "true");
      toggle.after(menu);
      this.picker = menu;
    }
    /**
     * Whether a panel should be on screen.
     *
     * @param def Panel definition.
     */
    isVisible(def) {
      const stored = this.state[def.id]?.hidden;
      if (stored !== void 0) {
        return !stored;
      }
      return def.defaultVisible !== false;
    }
    /**
     * Whether a panel should render collapsed.
     *
     * @param def Panel definition.
     */
    isCollapsed(def) {
      const stored = this.state[def.id]?.collapsed;
      return stored !== void 0 ? stored : def.defaultCollapsed === true;
    }
    /**
     * Merges and persists state for one panel.
     *
     * @param id    Panel id.
     * @param patch Fields to change.
     */
    setPanelState(id, patch) {
      this.state = { ...this.state, [id]: { ...this.state[id], ...patch } };
      writeState(this.state);
    }
    /** Rebuilds every visible panel. */
    render() {
      this.releasePanels();
      this.stack.replaceChildren();
      for (const def of listPanels()) {
        if (!this.isVisible(def)) {
          continue;
        }
        this.stack.appendChild(this.renderPanel(def));
      }
    }
    /**
     * Builds one collapsible panel.
     *
     * The body stays in the DOM when collapsed rather than being destroyed. The
     * histogram subscribes to updates on render, and tearing that down on every
     * collapse would mean a reopened panel showed a stale plot until the next
     * adjustment.
     *
     * @param def Panel definition.
     */
    renderPanel(def) {
      const collapsed = this.isCollapsed(def);
      const section = document.createElement("section");
      section.className = "dg-panel";
      section.dataset.panel = def.id;
      section.classList.toggle("is-collapsed", collapsed);
      const bodyId = `dg-panel-body-${def.id}`;
      const header = document.createElement("button");
      header.type = "button";
      header.className = "dg-panel__header";
      header.setAttribute("aria-expanded", String(!collapsed));
      header.setAttribute("aria-controls", bodyId);
      const chevron = document.createElement("span");
      chevron.className = "dg-panel__chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "▸";
      const title = document.createElement("span");
      title.className = "dg-panel__title";
      title.textContent = def.title;
      header.append(chevron, title);
      const body = document.createElement("div");
      body.className = "dg-panel__body";
      body.id = bodyId;
      body.hidden = collapsed;
      body.dataset.collapsed = String(collapsed);
      header.addEventListener("click", () => {
        const next = !section.classList.contains("is-collapsed");
        section.classList.toggle("is-collapsed", next);
        body.hidden = next;
        body.dataset.collapsed = String(next);
        header.setAttribute("aria-expanded", String(!next));
        this.setPanelState(def.id, { collapsed: next });
        body.dispatchEvent(
          new CustomEvent("dg-panel-toggle", {
            detail: { collapsed: next },
            bubbles: false
          })
        );
      });
      const teardown = def.render(body, this.ctx);
      if (typeof teardown === "function") {
        this.teardowns.push(teardown);
      }
      section.append(header, body);
      return section;
    }
    /** Runs every panel teardown. */
    releasePanels() {
      for (const teardown of this.teardowns) {
        teardown();
      }
      this.teardowns = [];
    }
    /** Releases everything the host owns. */
    destroy() {
      this.unsubscribe();
      this.releasePanels();
      this.picker = null;
      this.root.replaceChildren();
    }
  }
  function syncSelectValue(root, value) {
    const select = root.querySelector("select");
    if (select) {
      if (select.value !== value) {
        select.value = value;
      }
      return;
    }
    if (root.getAttribute("value") !== value) {
      root.setAttribute("value", value);
    }
  }
  const ASPECTS = [
    { value: "0", label: __("Free"), ratio: 0 },
    { value: "1", label: __("Square"), ratio: 1 },
    { value: "1.7778", label: __("16:9"), ratio: 16 / 9 },
    { value: "1.5", label: __("3:2"), ratio: 3 / 2 },
    { value: "1.3333", label: __("4:3"), ratio: 4 / 3 },
    { value: "0.8", label: __("4:5 portrait"), ratio: 4 / 5 }
  ];
  const OP_DISPLAY = {
    exposure: { scale: 100, suffix: "", step: 1 },
    contrast: { scale: 100, suffix: "", step: 1 },
    temperature: { scale: 100, suffix: "", step: 1 },
    tint: { scale: 100, suffix: "", step: 1 },
    saturation: { scale: 100, suffix: "", step: 1 },
    vibrance: { scale: 100, suffix: "", step: 1 },
    hue: { scale: 1, suffix: "°", step: 1 },
    sharpen: { scale: 100, suffix: "", step: 1 },
    blur: { scale: 100, suffix: "", step: 1 },
    vignette: { scale: 100, suffix: "", step: 1 },
    grain: { scale: 100, suffix: "", step: 1 }
  };
  function adjustmentSlider(type, ctx) {
    const spec = ctx.payload.schema[type];
    if (!spec) {
      return null;
    }
    const display = OP_DISPLAY[type];
    return createSlider({
      label: __(OP_LABELS[type]),
      min: Math.round(spec.min * display.scale),
      max: Math.round(spec.max * display.scale),
      step: display.step,
      suffix: display.suffix,
      value: getOp(ctx.getRecipe(), type, ctx.payload.schema) * display.scale,
      resetTo: Math.round(spec.default * display.scale),
      onInput: (value) => ctx.setOp(type, value / display.scale)
    });
  }
  function renderAdjustments(host, ctx, order) {
    const sliders = /* @__PURE__ */ new Map();
    for (const type of order) {
      const slider = adjustmentSlider(type, ctx);
      if (!slider) {
        continue;
      }
      sliders.set(type, slider);
      host.appendChild(slider.el);
    }
    const off = ctx.onRecipeChange((recipe) => {
      for (const [type, slider] of sliders) {
        const display = OP_DISPLAY[type];
        slider.setValue(
          Math.round(getOp(recipe, type, ctx.payload.schema) * display.scale)
        );
      }
    });
    return () => {
      off();
      for (const slider of sliders.values()) {
        slider.destroy();
      }
    };
  }
  function registerBuiltInPanels() {
    registerPanel({
      id: "histogram",
      title: __("Histogram"),
      order: 10,
      render: (host, ctx) => {
        const view = new HistogramView();
        host.appendChild(view.el);
        const off = ctx.onHistogram((histogram) => view.update(histogram));
        return () => {
          off();
          view.destroy();
        };
      }
    });
    registerPanel({
      id: "adjustments",
      title: __("Adjustments"),
      order: 20,
      render: (host, ctx) => renderAdjustments(host, ctx, PANEL_OP_ORDER)
    });
    registerPanel({
      id: "effects",
      title: __("Detail & effects"),
      order: 60,
      defaultCollapsed: true,
      render: (host, ctx) => renderAdjustments(host, ctx, EFFECT_OP_ORDER)
    });
    registerPanel({
      id: "layers",
      title: __("Layers"),
      order: 5,
      render: (host, ctx) => {
        const list = document.createElement("div");
        list.className = "dg-layers";
        let rowHandles = [];
        const draw = () => {
          list.replaceChildren();
          for (const handle of rowHandles) {
            handle.destroy();
          }
          rowHandles = [];
          for (const layer of [...ctx.getLayers()].reverse()) {
            const row = document.createElement("div");
            row.className = "dg-layer";
            row.classList.toggle("is-active", layer.id === ctx.getActiveLayerId());
            const eye = createIconButton({
              glyph: layer.visible ? "●" : "○",
              label: layer.visible ? __("Hide layer") : __("Show layer"),
              className: "dg-layer__eye",
              onClick: () => ctx.setLayers(
                updateLayer(ctx.getLayers(), layer.id, {
                  visible: !layer.visible
                })
              )
            });
            const name = document.createElement("button");
            name.type = "button";
            name.className = "dg-layer__name";
            name.textContent = layer.name;
            name.addEventListener(
              "click",
              () => ctx.setLayers(ctx.getLayers(), layer.id)
            );
            const up = createIconButton({
              glyph: "↑",
              label: __("Bring forward"),
              className: "dg-layer__move",
              onClick: () => ctx.setLayers(
                reorderLayer(ctx.getLayers(), layer.id, 1),
                layer.id
              )
            });
            const down = createIconButton({
              glyph: "↓",
              label: __("Send backward"),
              className: "dg-layer__move",
              onClick: () => ctx.setLayers(
                reorderLayer(ctx.getLayers(), layer.id, -1),
                layer.id
              )
            });
            rowHandles.push(eye, up, down);
            row.append(eye.el, name, up.el, down.el);
            if (layer.id !== BASE_LAYER_ID) {
              const remove = createIconButton({
                glyph: "×",
                label: __("Delete layer"),
                className: "dg-layer__delete",
                onClick: () => ctx.setLayers(
                  ctx.getLayers().filter(
                    (entry) => entry.id !== layer.id
                  )
                )
              });
              rowHandles.push(remove);
              row.appendChild(remove.el);
            }
            list.appendChild(row);
          }
        };
        const add = createButton({
          label: __("Add layer"),
          variant: "secondary",
          onClick: () => ctx.addLayer()
        });
        const hint = document.createElement("p");
        hint.className = "dg-hint";
        hint.textContent = __(
          "Painted and pasted layers are pixels, not settings — save a copy to keep them."
        );
        const off = ctx.onRecipeChange(draw);
        draw();
        host.append(list, add.el, hint);
        return () => {
          for (const handle of rowHandles) {
            handle.destroy();
          }
          off();
          add.destroy();
        };
      }
    });
    registerPanel({
      id: "brush",
      title: __("Brush"),
      order: 8,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const shape = createSelect({
          label: __("Shape"),
          value: ctx.getBrush().shape,
          options: BRUSH_SHAPES.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => ctx.setBrush({ shape: value })
        });
        const size = createSlider({
          label: __("Size"),
          min: 1,
          max: 400,
          step: 1,
          suffix: "px",
          value: ctx.getBrush().size,
          resetTo: 40,
          onInput: (value) => ctx.setBrush({ size: value })
        });
        const hardness = createSlider({
          label: __("Hardness"),
          min: 0,
          max: 100,
          step: 1,
          suffix: "%",
          value: Math.round(ctx.getBrush().hardness * 100),
          resetTo: 60,
          onInput: (value) => ctx.setBrush({ hardness: value / 100 })
        });
        const opacity = createSlider({
          label: __("Opacity"),
          min: 1,
          max: 100,
          step: 1,
          suffix: "%",
          value: Math.round(ctx.getBrush().opacity * 100),
          resetTo: 100,
          onInput: (value) => ctx.setBrush({ opacity: value / 100 })
        });
        const strength = createSlider({
          label: __("Strength"),
          min: 1,
          max: 100,
          step: 1,
          suffix: "%",
          value: Math.round(ctx.getBrush().strength * 100),
          resetTo: 50,
          onInput: (value) => ctx.setBrush({ strength: value / 100 })
        });
        const tolerance = createSlider({
          label: __("Fill tolerance"),
          min: 0,
          max: 128,
          step: 1,
          value: ctx.getBrush().tolerance,
          resetTo: 32,
          onInput: (value) => ctx.setBrush({ tolerance: value })
        });
        const retouch = createSelect({
          label: __("Retouch mode"),
          value: ctx.getBrush().retouch,
          options: RETOUCH_MODES.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => ctx.setBrush({ retouch: value })
        });
        const tone = createSelect({
          label: __("Dodge & burn mode"),
          value: ctx.getBrush().tone,
          options: TONE_MODES.map((entry) => ({
            value: entry.value,
            label: __(entry.label)
          })),
          onChange: (value) => ctx.setBrush({ tone: value })
        });
        const colour = createColourField({
          label: __("Colour"),
          value: ctx.getBrush().colour,
          onChange: (value) => ctx.setBrush({ colour: value })
        });
        const off = ctx.onBrushChange((brush) => {
          size.setValue(Math.round(brush.size));
          hardness.setValue(Math.round(brush.hardness * 100));
          opacity.setValue(Math.round(brush.opacity * 100));
          strength.setValue(Math.round(brush.strength * 100));
          tolerance.setValue(Math.round(brush.tolerance));
          colour.setValue(brush.colour);
          syncSelectValue(shape.el, brush.shape);
          syncSelectValue(retouch.el, brush.retouch);
          syncSelectValue(tone.el, brush.tone);
        });
        host.append(
          shape.el,
          size.el,
          hardness.el,
          opacity.el,
          colour.el,
          createSection(__("Retouching")),
          retouch.el,
          tone.el,
          strength.el,
          createSection(__("Fill")),
          tolerance.el
        );
        return () => {
          off();
          shape.destroy();
          size.destroy();
          hardness.destroy();
          opacity.destroy();
          colour.destroy();
          strength.destroy();
          retouch.destroy();
          tone.destroy();
          tolerance.destroy();
        };
      }
    });
    registerPanel({
      id: "transform",
      title: __("Transform"),
      order: 30,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const overlay = new TransformOverlay({
          stage: ctx.stage,
          getViewport: ctx.getViewport,
          getCanvas: () => ctx.getRecipe().canvas,
          getImageSize: ctx.getImageSize,
          getTransform: () => activeLayer(ctx.getRecipe()).transform,
          // One label for the whole gesture, so History collapses it into a
          // single undo step rather than one per pointer move.
          onChange: (layer) => ctx.setLayer(layer, "transform-drag"),
          onCommit: () => {
          },
          getSnapping: () => ctx.getView().snapping
        });
        const offViewport = ctx.onViewportChange(overlay.sync);
        const offRecipe = ctx.onRecipeChange(overlay.sync);
        overlay.setVisible(ctx.getActiveTool() === "transform");
        const offTool = ctx.onActiveToolChange(
          (tool) => overlay.setVisible(tool === "transform")
        );
        const onToggle = (event) => {
          const { collapsed } = event.detail;
          if (!collapsed) {
            ctx.setActiveTool("transform");
          }
        };
        host.addEventListener("dg-panel-toggle", onToggle);
        const quarter = (direction) => {
          const layer = activeLayer(ctx.getRecipe()).transform;
          ctx.setLayer({
            ...layer,
            rotation: normaliseAngle(layer.rotation + direction * 90)
          });
        };
        const buttons = document.createElement("div");
        buttons.className = "dg-buttons";
        const handles = [
          { label: "⟲", title: __("Rotate left"), run: () => quarter(-1) },
          { label: "⟳", title: __("Rotate right"), run: () => quarter(1) },
          {
            label: "↔",
            title: __("Flip horizontally"),
            run: () => {
              const layer = activeLayer(ctx.getRecipe()).transform;
              ctx.setLayer({ ...layer, flipH: !layer.flipH });
            }
          },
          {
            label: "↕",
            title: __("Flip vertically"),
            run: () => {
              const layer = activeLayer(ctx.getRecipe()).transform;
              ctx.setLayer({ ...layer, flipV: !layer.flipV });
            }
          }
        ].map((action) => {
          const button = createButton({
            label: action.label,
            title: action.title,
            variant: "secondary",
            onClick: action.run
          });
          buttons.appendChild(button.el);
          return button;
        });
        const rotation = createSlider({
          label: __("Rotation"),
          min: -180,
          max: 180,
          step: 0.1,
          suffix: "°",
          value: activeLayer(ctx.getRecipe()).transform.rotation,
          resetTo: 0,
          onInput: (value) => ctx.setLayer({ ...activeLayer(ctx.getRecipe()).transform, rotation: value }, "rotation")
        });
        const axisSlider = (label, axis) => createSlider({
          label,
          min: Math.round(MIN_SCALE * 100),
          max: Math.round(MAX_SCALE * 100),
          step: 1,
          suffix: "%",
          value: Math.round(activeLayer(ctx.getRecipe()).transform[axis] * 100),
          resetTo: 100,
          onInput: (value) => {
            const layer = activeLayer(ctx.getRecipe()).transform;
            ctx.setLayer(
              linked ? { ...layer, scaleX: value / 100, scaleY: value / 100 } : { ...layer, [axis]: value / 100 },
              "scale"
            );
          }
        });
        let linked = true;
        const scaleX = axisSlider(__("Scale X"), "scaleX");
        const scaleY = axisSlider(__("Scale Y"), "scaleY");
        const link = createCheckbox({
          label: __("Link scale axes"),
          checked: true,
          title: __("Scale both axes together. Unlink to stretch one."),
          onChange: (checked) => {
            linked = checked;
          }
        });
        const fitButtons = document.createElement("div");
        fitButtons.className = "dg-buttons";
        const fits = [
          {
            label: __("Fit"),
            title: __("Scale the image to fit inside the canvas"),
            compute: fitScale
          },
          {
            label: __("Fill"),
            title: __("Scale the image to cover the canvas"),
            compute: coverScale
          }
        ].map((action) => {
          const button = createButton({
            label: action.label,
            title: action.title,
            variant: "secondary",
            onClick: () => {
              const recipe = ctx.getRecipe();
              const value = action.compute(ctx.getImageSize(), recipe.canvas);
              ctx.setLayer({
                ...activeLayer(recipe).transform,
                scaleX: value,
                scaleY: value,
                x: 0.5,
                y: 0.5
              });
            }
          });
          fitButtons.appendChild(button.el);
          return button;
        });
        const reset = createButton({
          label: __("Reset transform"),
          variant: "ghost",
          onClick: () => ctx.setLayer({ ...IDENTITY_TRANSFORM })
        });
        const offSliders = ctx.onRecipeChange((recipe) => {
          rotation.setValue(Math.round(activeLayer(recipe).transform.rotation * 10) / 10);
          scaleX.setValue(Math.round(activeLayer(recipe).transform.scaleX * 100));
          scaleY.setValue(Math.round(activeLayer(recipe).transform.scaleY * 100));
        });
        host.append(
          buttons,
          rotation.el,
          scaleX.el,
          scaleY.el,
          link.el,
          fitButtons,
          reset.el
        );
        return () => {
          host.removeEventListener("dg-panel-toggle", onToggle);
          offViewport();
          offRecipe();
          offSliders();
          offTool();
          overlay.destroy();
          rotation.destroy();
          scaleX.destroy();
          scaleY.destroy();
          link.destroy();
          reset.destroy();
          handles.forEach((handle) => handle.destroy());
          fits.forEach((fit) => fit.destroy());
        };
      }
    });
    registerPanel({
      id: "canvas",
      title: __("Canvas & crop"),
      order: 35,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const overlay = new CropOverlay({
          stage: ctx.stage,
          getViewport: ctx.getViewport
        });
        const offViewport = ctx.onViewportChange(overlay.sync);
        overlay.setVisible(ctx.getActiveTool() === "crop");
        const offTool = ctx.onActiveToolChange(
          (tool) => overlay.setVisible(tool === "crop")
        );
        const onToggle = (event) => {
          const { collapsed } = event.detail;
          if (collapsed) {
            ctx.setActiveTool("transform");
            return;
          }
          overlay.setRect({ x: 0, y: 0, w: 1, h: 1 });
          ctx.setActiveTool("crop");
        };
        host.addEventListener("dg-panel-toggle", onToggle);
        let pendingWidth = ctx.getRecipe().canvas.width;
        let pendingHeight = ctx.getRecipe().canvas.height;
        const applySize = () => {
          const recipe = ctx.getRecipe();
          const next = resizeCanvas(recipe.canvas, activeLayer(recipe).transform, {
            width: pendingWidth || recipe.canvas.width,
            height: pendingHeight || recipe.canvas.height
          });
          ctx.setDocument(next.canvas, next.transform);
        };
        const widthField = createNumberField({
          label: __("Width"),
          value: pendingWidth,
          min: MIN_CANVAS,
          max: 2e4,
          suffix: "px",
          onChange: (value) => {
            pendingWidth = value;
            applySize();
          }
        });
        const heightField = createNumberField({
          label: __("Height"),
          value: pendingHeight,
          min: MIN_CANVAS,
          max: 2e4,
          suffix: "px",
          onChange: (value) => {
            pendingHeight = value;
            applySize();
          }
        });
        const syncFields = () => {
          const { canvas } = ctx.getRecipe();
          pendingWidth = canvas.width;
          pendingHeight = canvas.height;
          widthField.setValue(canvas.width);
          heightField.setValue(canvas.height);
        };
        const size = document.createElement("div");
        size.className = "dg-size";
        size.append(widthField.el, heightField.el);
        const aspectSelect = createSelect({
          label: __("Crop ratio"),
          value: "0",
          options: ASPECTS.map(({ value, label }) => ({ value, label })),
          onChange: (value) => {
            const aspect = Number(value);
            overlay.setAspect(aspect);
            if (aspect > 0) {
              const { canvas } = ctx.getRecipe();
              overlay.setRect(
                centredCrop(aspect, canvas.width / canvas.height)
              );
            }
          }
        });
        const applyCropButton = createButton({
          label: __("Apply crop"),
          variant: "primary",
          onClick: () => {
            const recipe = ctx.getRecipe();
            const next = applyCrop(recipe.canvas, activeLayer(recipe).transform, overlay.getRect());
            ctx.setDocument(next.canvas, next.transform, "crop");
            overlay.setRect({ x: 0, y: 0, w: 1, h: 1 });
          }
        });
        const trim = createButton({
          label: __("Fit canvas to image"),
          variant: "secondary",
          onClick: () => {
            const recipe = ctx.getRecipe();
            const image = ctx.getImageSize();
            ctx.setDocument(
              {
                width: Math.round(image.width * activeLayer(recipe).transform.scaleX),
                height: Math.round(image.height * activeLayer(recipe).transform.scaleY)
              },
              { ...activeLayer(recipe).transform, x: 0.5, y: 0.5 }
            );
          }
        });
        const hint = document.createElement("p");
        hint.className = "dg-hint";
        hint.textContent = __(
          "Cropping resizes the canvas. The image itself is untouched — move or scale it with the Transform tool."
        );
        const offRecipe = ctx.onRecipeChange(syncFields);
        syncFields();
        host.append(size, aspectSelect.el, applyCropButton.el, trim.el, hint);
        return () => {
          host.removeEventListener("dg-panel-toggle", onToggle);
          offViewport();
          offRecipe();
          offTool();
          overlay.destroy();
          widthField.destroy();
          heightField.destroy();
          aspectSelect.destroy();
          applyCropButton.destroy();
          trim.destroy();
        };
      }
    });
    registerPanel({
      id: "curves",
      title: __("Curves"),
      order: 40,
      defaultCollapsed: true,
      render: (host, ctx) => {
        let channel = "rgb";
        const pointsFor = (which) => ctx.getRecipe().curves[which] ?? [
          [0, 0],
          [255, 255]
        ];
        const editor = new CurveEditor({
          getPoints: () => pointsFor(channel),
          onChange: (points) => ctx.setCurve(channel, points),
          onCommit: () => {
          }
        });
        const picker = createSelect({
          label: __("Channel"),
          value: "rgb",
          options: [
            { value: "rgb", label: __("RGB") },
            { value: "r", label: __("Red") },
            { value: "g", label: __("Green") },
            { value: "b", label: __("Blue") }
          ],
          onChange: (value) => {
            channel = value;
            editor.sync();
          }
        });
        const hint = document.createElement("p");
        hint.className = "dg-hint";
        hint.textContent = __(
          "Click to add a point, drag it well outside to remove it, double-click to reset."
        );
        const offRecipe = ctx.onRecipeChange(editor.sync);
        host.append(picker.el, editor.el, hint);
        return () => {
          offRecipe();
          editor.destroy();
          picker.destroy();
        };
      }
    });
    registerPanel({
      id: "levels",
      title: __("Levels"),
      order: 50,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const make = (label, key, min, max, step, scale) => createSlider({
          label,
          min,
          max,
          step,
          value: ctx.getRecipe().levels[key] * scale,
          resetTo: IDENTITY_LEVELS[key] * scale,
          onInput: (value) => ctx.setLevels({
            ...ctx.getRecipe().levels,
            [key]: value / scale
          })
        });
        const black = make(__("Black point"), "black", 0, 254, 1, 1);
        const white = make(__("White point"), "white", 1, 255, 1, 1);
        const gamma = make(__("Midtones"), "gamma", 10, 400, 1, 100);
        const offRecipe = ctx.onRecipeChange((recipe) => {
          black.setValue(recipe.levels.black);
          white.setValue(recipe.levels.white);
          gamma.setValue(Math.round(recipe.levels.gamma * 100));
        });
        host.append(black.el, white.el, gamma.el);
        return () => {
          offRecipe();
          black.destroy();
          white.destroy();
          gamma.destroy();
        };
      }
    });
    registerPanel({
      id: "output",
      title: __("Output"),
      order: 80,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const format = createSelect({
          label: __("Format"),
          value: ctx.getRecipe().output.format,
          options: [
            { value: "image/jpeg", label: __("JPEG — smallest, no transparency") },
            { value: "image/png", label: __("PNG — lossless, keeps transparency") },
            { value: "image/webp", label: __("WebP — small and lossless-capable") }
          ],
          onChange: (value) => {
            ctx.setOutput({ format: value });
            syncQuality();
          }
        });
        const quality = createSlider({
          label: __("Quality"),
          min: 10,
          max: 100,
          step: 1,
          suffix: "%",
          value: Math.round(ctx.getRecipe().output.quality * 100),
          resetTo: 92,
          onInput: (value) => ctx.setOutput({ quality: value / 100 })
        });
        const syncQuality = () => {
          quality.el.hidden = ctx.getRecipe().output.format === "image/png";
        };
        host.append(format.el, quality.el);
        syncQuality();
        return () => {
          format.destroy();
          quality.destroy();
        };
      }
    });
    registerPanel({
      id: "presets",
      title: __("Presets"),
      order: 70,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const list = document.createElement("div");
        list.className = "dg-presets";
        let rowHandles = [];
        let presetName = "";
        const status = document.createElement("p");
        status.className = "dg-hint";
        const refresh = async () => {
          list.replaceChildren();
          for (const handle of rowHandles) {
            handle.destroy();
          }
          rowHandles = [];
          let presets;
          try {
            presets = await ctx.listPresets();
          } catch (error) {
            status.textContent = error instanceof Error ? error.message : __("Presets could not be loaded.");
            return;
          }
          if (presets.length === 0) {
            status.textContent = __(
              "No presets yet. Adjust an image, then save the look to reuse it."
            );
            return;
          }
          status.textContent = "";
          for (const preset of presets) {
            const row = document.createElement("div");
            row.className = "dg-preset";
            const apply = createButton({
              label: preset.name,
              variant: "ghost",
              onClick: () => ctx.applyPreset(preset)
            });
            apply.el.classList.add("dg-preset__apply");
            const remove = createIconButton({
              glyph: "×",
              label: sprintf(__("Delete “%s”"), preset.name),
              className: "dg-preset__delete",
              onClick: async () => {
                await ctx.deletePreset(preset.id);
                await refresh();
              }
            });
            rowHandles.push(apply, remove);
            row.append(apply.el, remove.el);
            list.appendChild(row);
          }
        };
        const name = createTextField({
          label: __("Preset name"),
          value: "",
          placeholder: __("Name this look"),
          onChange: (value) => {
            presetName = value;
          }
        });
        const save = createButton({
          label: __("Save look"),
          variant: "secondary",
          onClick: async () => {
            if (!presetName.trim()) {
              return;
            }
            try {
              await ctx.savePreset(presetName);
              presetName = "";
              name.setValue("");
              await refresh();
            } catch (error) {
              status.textContent = error instanceof Error ? error.message : __("The preset could not be saved.");
            }
          }
        });
        host.append(list, status, name.el, save.el);
        void refresh();
        return () => {
          for (const handle of rowHandles) {
            handle.destroy();
          }
          name.destroy();
          save.destroy();
        };
      }
    });
    registerPanel({
      id: "view",
      title: __("View"),
      order: 85,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const toggle = (label, key, hint) => createCheckbox({
          label,
          title: hint,
          checked: ctx.getView()[key],
          onChange: (checked) => ctx.setView({ [key]: checked })
        });
        const rulers = toggle(
          __("Rulers"),
          "rulers",
          __("Marked in canvas pixels.")
        );
        const snapping = toggle(
          __("Snapping"),
          "snapping",
          __("Snap a moved layer to the canvas edges and centre. Hold Alt to bypass.")
        );
        host.append(rulers.el, snapping.el);
        return () => {
          rulers.destroy();
          snapping.destroy();
        };
      }
    });
    registerPanel({
      id: "info",
      title: __("Image info"),
      order: 90,
      defaultCollapsed: true,
      render: (host, ctx) => {
        const { payload } = ctx;
        const rows = [
          [
            __("Dimensions"),
            sprintf("%1$d × %2$d", payload.width, payload.height)
          ],
          [__("Format"), payload.mime.replace("image/", "").toUpperCase()],
          [
            __("Megapixels"),
            (payload.width * payload.height / 1e6).toFixed(1)
          ]
        ];
        if (payload.sourceId !== payload.id) {
          rows.push([__("Edited from"), `#${payload.sourceId}`]);
        }
        const list = document.createElement("dl");
        list.className = "dg-info";
        for (const [term, value] of rows) {
          const dt = document.createElement("dt");
          dt.textContent = term;
          const dd = document.createElement("dd");
          dd.textContent = value;
          list.append(dt, dd);
        }
        host.appendChild(list);
      }
    });
  }
  function defaultBrush() {
    return {
      shape: "soft",
      size: 40,
      hardness: 0.6,
      opacity: 1,
      colour: "#000000",
      background: "#ffffff",
      tolerance: 32,
      retouch: "blur",
      tone: "dodge",
      strength: 0.5,
      gradient: "linear",
      gradientFade: false,
      shapeKind: "rect",
      shapeStyle: "fill",
      strokeWidth: 4,
      fontSize: 72,
      fontFamily: "system-ui, sans-serif",
      bold: false,
      italic: false
    };
  }
  const RETOUCH_SPACING = 0.25;
  const PIXEL_TOOLS = ["retouch", "tone", "clone", "history"];
  const PIXEL_OPS = {
    clone: "clone",
    history: "restore",
    tone: void 0
  };
  class StageTools {
    constructor(options) {
      this.drawing = false;
      this.last = null;
      this.dragStart = null;
      this.dragFrom = null;
      this.path = [];
      this.work = null;
      this.carry = null;
      this.pristine = null;
      this.cloneSource = null;
      this.cloneOffset = null;
      this.preview = null;
      this.previewPath = null;
      this.onPointerDown = (event) => {
        const tool = this.options.getTool();
        if (tool === "transform" || tool === "crop") {
          return;
        }
        if (tool === "hand") {
          event.preventDefault();
          this.last = { x: event.clientX, y: event.clientY };
          this.listen();
          return;
        }
        const point = this.toCanvas(event);
        if (!point) {
          return;
        }
        event.preventDefault();
        switch (tool) {
          case "zoom":
            this.zoom(event);
            return;
          case "eyedropper":
            this.pick(point);
            this.last = point;
            this.listen();
            return;
          case "fill":
            this.fill(point);
            return;
          case "wand":
            this.wand(point);
            return;
          case "text":
            this.options.onPlaceText(point);
            return;
          case "path":
            this.path = appendPathPoint(this.path, this.normalise(point), 0);
            this.options.setSelection({ shape: "polygon", points: this.path });
            return;
          case "select":
            this.beginSelect(point);
            this.listen();
            return;
          case "gradient":
          case "shape":
            this.dragFrom = point;
            this.showPreview(event, event);
            this.listen();
            return;
          case "clone":
            if (event.altKey) {
              this.cloneSource = point;
              this.cloneOffset = null;
              this.options.onToolStateChange?.();
              return;
            }
            if (!this.cloneSource) {
              return;
            }
            this.cloneOffset = {
              x: point.x - this.cloneSource.x,
              y: point.y - this.cloneSource.y
            };
            break;
        }
        this.drawing = true;
        this.last = point;
        this.beginPixelStroke(tool);
        this.strokeDab(point, tool);
        this.listen();
      };
      this.onPointerMove = (event) => {
        const tool = this.options.getTool();
        if (tool === "hand") {
          if (this.last) {
            this.options.pan(
              event.clientX - this.last.x,
              event.clientY - this.last.y
            );
            this.last = { x: event.clientX, y: event.clientY };
          }
          return;
        }
        const point = this.toCanvas(event);
        if (!point) {
          return;
        }
        if (tool === "eyedropper") {
          this.pick(point);
          return;
        }
        if (this.dragFrom) {
          this.updatePreview(event);
          return;
        }
        if (this.dragStart) {
          this.continueSelect(point);
          return;
        }
        if (!this.drawing || !this.last) {
          return;
        }
        const brush = this.options.getBrush();
        const spacing = PIXEL_TOOLS.includes(tool) ? RETOUCH_SPACING : STAMP_SPACING;
        for (const step of interpolateStroke(this.last, point, brush.size * spacing)) {
          this.strokeDab(step, tool);
        }
        this.last = point;
      };
      this.onPointerUp = (event) => {
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.removeEventListener("pointercancel", this.onPointerUp);
        window.removeEventListener("blur", this.onPointerUp);
        const wasDrawing = this.drawing;
        const dragFrom = this.dragFrom;
        this.drawing = false;
        this.last = null;
        this.dragStart = null;
        this.dragFrom = null;
        this.work = null;
        this.carry = null;
        this.pristine = null;
        this.hidePreview();
        if (dragFrom && event instanceof PointerEvent) {
          this.commitRegion(dragFrom, event);
        }
        if (wasDrawing) {
          this.options.onStrokeEnd();
        }
      };
      this.previewOrigin = null;
      this.options = options;
      options.stage.addEventListener("pointerdown", this.onPointerDown);
    }
    /**
     * Converts a pointer position into canvas pixels.
     *
     * @param event Pointer event.
     * @return Canvas coordinates, or null when nothing is loaded.
     */
    toCanvas(event) {
      const viewport = this.options.getViewport();
      const canvas = this.options.getCanvas();
      if (!viewport || viewport.width === 0 || canvas.width === 0) {
        return null;
      }
      const stageRect = this.options.stage.getBoundingClientRect();
      const x = event.clientX - stageRect.left - viewport.x;
      const y = event.clientY - stageRect.top - viewport.y;
      return {
        x: x / viewport.width * canvas.width,
        y: y / viewport.height * canvas.height
      };
    }
    /** Starts tracking a drag on the window, so a release anywhere ends it. */
    listen() {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("pointercancel", this.onPointerUp);
      window.addEventListener("blur", this.onPointerUp);
    }
    // -- Selection ------------------------------------------------------------
    /**
     * Starts a marquee.
     *
     * @param point Canvas coordinates.
     */
    beginSelect(point) {
      const shape = this.options.getSelectionShape();
      const norm = this.normalise(point);
      if (shape === "polygon") {
        this.path = appendPathPoint(this.path, norm, 0);
        this.options.setSelection({ shape: "polygon", points: this.path });
        return;
      }
      this.dragStart = norm;
      this.path = [norm];
      this.options.setSelection(null);
    }
    /**
     * Extends a marquee.
     *
     * @param point Canvas coordinates.
     */
    continueSelect(point) {
      const shape = this.options.getSelectionShape();
      const norm = this.normalise(point);
      if (!this.dragStart) {
        return;
      }
      if (shape === "lasso") {
        this.path = appendPathPoint(this.path, norm);
        this.options.setSelection({ shape: "lasso", points: this.path });
        return;
      }
      this.options.setSelection(
        selectionFromDrag(shape, this.dragStart, norm)
      );
    }
    /**
     * Selects the contiguous region matching the colour under the pointer.
     *
     * The same flood fill the paint bucket uses, traced into a path -- which is the
     * whole reason the wand was cheap to add.
     *
     * @param point Canvas coordinates.
     */
    wand(point) {
      const source = this.options.readDocument();
      if (!source) {
        return;
      }
      const brush = this.options.getBrush();
      const mask = floodFillMask(
        source.pixels,
        source.width,
        source.height,
        point.x,
        point.y,
        brush.tolerance
      );
      if (!mask) {
        return;
      }
      const ctx = mask.getContext("2d");
      const pixels = ctx?.getImageData(0, 0, mask.width, mask.height);
      if (!pixels) {
        return;
      }
      const points = traceMask(pixels);
      this.options.setSelection(
        points.length > 2 ? { shape: "lasso", points } : null
      );
    }
    // -- Point tools ----------------------------------------------------------
    /**
     * Samples the colour under the pointer into the foreground.
     *
     * @param point Canvas coordinates.
     */
    pick(point) {
      const source = this.options.readDocument();
      if (!source) {
        return;
      }
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (x < 0 || y < 0 || x >= source.width || y >= source.height) {
        return;
      }
      const index = (y * source.width + x) * 4;
      this.options.setBrush({
        colour: rgbToHex(
          source.pixels[index],
          source.pixels[index + 1],
          source.pixels[index + 2]
        )
      });
    }
    /**
     * Zooms in, or out with Alt held.
     *
     * @param event Pointer event, positioned within the stage.
     */
    zoom(event) {
      const rect = this.options.stage.getBoundingClientRect();
      this.options.zoomAt(
        event.altKey ? 1 / 1.4 : 1.4,
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    }
    /**
     * Floods the region matching the colour under the pointer.
     *
     * Matched against the *composed* document rather than the target layer, because
     * that is what the user can see -- filling against an invisible layer's contents
     * would look arbitrary.
     *
     * @param point Canvas coordinates.
     */
    fill(point) {
      const source = this.options.readDocument();
      if (!source) {
        return;
      }
      const brush = this.options.getBrush();
      const mask = floodFillMask(
        source.pixels,
        source.width,
        source.height,
        point.x,
        point.y,
        brush.tolerance
      );
      if (!mask) {
        return;
      }
      this.options.fillMask(
        this.options.getTargetLayerId(),
        mask,
        brush.colour,
        brush.opacity
      );
      this.options.onStrokeEnd();
    }
    // -- Region drags ---------------------------------------------------------
    /**
     * Commits a gradient or a shape once the drag ends.
     *
     * @param from  Canvas coordinates the drag began at.
     * @param event The releasing pointer event.
     */
    commitRegion(from, event) {
      const to = this.toCanvas(event);
      const tool = this.options.getTool();
      const brush = this.options.getBrush();
      const canvas = this.options.getCanvas();
      if (!to) {
        return;
      }
      const end = event.shiftKey && tool === "shape" ? squareDrag(from, to) : to;
      const bitmap = tool === "gradient" ? gradientCanvas(
        canvas.width,
        canvas.height,
        brush.gradient,
        from,
        end,
        brush.colour,
        brush.background,
        brush.gradientFade
      ) : shapeCanvas(canvas.width, canvas.height, from, end, {
        kind: brush.shapeKind,
        style: brush.shapeStyle,
        colour: brush.colour,
        strokeWidth: brush.strokeWidth
      });
      if (!bitmap) {
        return;
      }
      this.options.composite(
        this.options.getTargetLayerId(),
        bitmap,
        0,
        0,
        brush.opacity
      );
      this.options.onStrokeEnd();
    }
    /**
     * Creates the dashed drag preview.
     *
     * Screen-space SVG rather than a real render: committing a canvas-sized bitmap on
     * every pointer move would allocate and upload megabytes per frame on a large
     * document, to show something an outline conveys perfectly.
     *
     * @param origin Where the drag began.
     * @param event  Current pointer position.
     */
    showPreview(origin, event) {
      if (!this.preview) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "dg-drag-preview");
        svg.setAttribute("aria-hidden", "true");
        this.previewPath = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        svg.appendChild(this.previewPath);
        this.options.stage.appendChild(svg);
        this.preview = svg;
      }
      this.previewOrigin = {
        x: origin.clientX,
        y: origin.clientY
      };
      this.preview.style.display = "";
      this.updatePreview(event);
    }
    /**
     * Redraws the drag preview.
     *
     * @param event Current pointer position.
     */
    updatePreview(event) {
      if (!this.previewPath || !this.previewOrigin) {
        return;
      }
      const rect = this.options.stage.getBoundingClientRect();
      const from = {
        x: this.previewOrigin.x - rect.left,
        y: this.previewOrigin.y - rect.top
      };
      let to = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const tool = this.options.getTool();
      const brush = this.options.getBrush();
      if (event.shiftKey && tool === "shape") {
        to = squareDrag(from, to);
      }
      if (tool === "gradient" || brush.shapeKind === "line") {
        this.previewPath.setAttribute(
          "d",
          `M ${from.x} ${from.y} L ${to.x} ${to.y}`
        );
        return;
      }
      const box = rectFromDrag(from, to);
      if (brush.shapeKind === "ellipse") {
        const rx = box.width / 2;
        const ry = box.height / 2;
        this.previewPath.setAttribute(
          "d",
          `M ${box.x} ${box.y + ry} a ${rx} ${ry} 0 1 0 ${box.width} 0 a ${rx} ${ry} 0 1 0 ${-box.width} 0 Z`
        );
        return;
      }
      this.previewPath.setAttribute(
        "d",
        `M ${box.x} ${box.y} h ${box.width} v ${box.height} h ${-box.width} Z`
      );
    }
    /** Hides the drag preview. */
    hidePreview() {
      if (this.preview) {
        this.preview.style.display = "none";
        this.previewPath?.setAttribute("d", "");
      }
      this.previewOrigin = null;
    }
    // -- Strokes --------------------------------------------------------------
    /**
     * Prepares a retouching stroke.
     *
     * The pixel operations read the composed document, because that is what the user
     * sees -- the base image layer is not canvas-aligned, so reading it directly would
     * blur the wrong pixels the moment the image had been moved. Reading once per
     * stroke rather than once per dab is what keeps them usable on a big photo.
     *
     * @param tool Active tool.
     */
    beginPixelStroke(tool) {
      if (!PIXEL_TOOLS.includes(tool)) {
        return;
      }
      const source = this.options.readDocument();
      this.carry = null;
      this.work = source ? {
        data: new Uint8ClampedArray(source.pixels),
        width: source.width,
        height: source.height
      } : null;
      if (tool === "history") {
        const pristine = this.options.readPristine();
        this.pristine = pristine ? {
          data: pristine.pixels,
          width: pristine.width,
          height: pristine.height
        } : null;
      } else {
        this.pristine = null;
      }
    }
    /**
     * Places one dab, whichever kind the tool wants.
     *
     * @param point Canvas coordinates.
     * @param tool  Active tool.
     */
    strokeDab(point, tool) {
      if (PIXEL_TOOLS.includes(tool)) {
        this.pixelDab(point, tool);
        return;
      }
      const brush = this.options.getBrush();
      this.options.stamp(
        this.options.getTargetLayerId(),
        brushStamp(brush.shape, brush.size, brush.hardness),
        point.x,
        point.y,
        brush.size,
        brush.colour,
        brush.opacity,
        tool === "eraser"
      );
    }
    /**
     * Applies one retouching dab and composites the changed pixels back.
     *
     * Only the dab's own dirty rectangle is uploaded, so the cost is proportional to
     * the brush rather than to the document.
     *
     * @param point Canvas coordinates.
     * @param tool  Active tool.
     */
    pixelDab(point, tool) {
      const work = this.work;
      if (!work) {
        return;
      }
      const brush = this.options.getBrush();
      const op = PIXEL_OPS[tool] ?? (tool === "tone" ? brush.tone : brush.retouch);
      if (op === "restore" && !this.pristine) {
        return;
      }
      const result = applyPixelDab({
        op,
        target: work,
        source: op === "restore" ? this.pristine : void 0,
        x: point.x,
        y: point.y,
        radius: brush.size,
        strength: brush.strength,
        hardness: brush.hardness,
        offsetX: this.cloneOffset?.x ?? 0,
        offsetY: this.cloneOffset?.y ?? 0,
        carry: this.carry
      });
      if (!result) {
        return;
      }
      this.carry = result.carry ?? this.carry;
      const patch = document.createElement("canvas");
      patch.width = result.rect.width;
      patch.height = result.rect.height;
      const ctx = patch.getContext("2d");
      if (!ctx) {
        return;
      }
      const region = ctx.createImageData(result.rect.width, result.rect.height);
      for (let row = 0; row < result.rect.height; row++) {
        const from = ((result.rect.y + row) * work.width + result.rect.x) * 4;
        region.data.set(
          work.data.subarray(from, from + result.rect.width * 4),
          row * result.rect.width * 4
        );
      }
      ctx.putImageData(region, 0, 0);
      this.options.composite(
        this.options.getTargetLayerId(),
        patch,
        result.rect.x,
        result.rect.y,
        1
      );
    }
    /**
     * Converts canvas pixels into normalised canvas coordinates.
     *
     * @param point Canvas pixels.
     */
    normalise(point) {
      const canvas = this.options.getCanvas();
      return { x: point.x / canvas.width, y: point.y / canvas.height };
    }
    /** Where the clone stamp is currently sampling from, if anywhere. */
    getCloneSource() {
      return this.cloneSource;
    }
    /** Forgets the clone sample point. */
    clearCloneSource() {
      this.cloneSource = null;
      this.cloneOffset = null;
      this.options.onToolStateChange?.();
    }
    /**
     * Paints the placed path with the current colour and style.
     *
     * Called when the path is closed with Enter. Reuses the shape drawing, which is why
     * a pen tool cost a dozen lines rather than a vector subsystem.
     *
     * @return Whether anything was drawn.
     */
    commitPath() {
      const canvas = this.options.getCanvas();
      const brush = this.options.getBrush();
      if (this.path.length < 3) {
        return false;
      }
      const surface = document.createElement("canvas");
      surface.width = canvas.width;
      surface.height = canvas.height;
      const ctx = surface.getContext("2d");
      if (!ctx) {
        return false;
      }
      ctx.beginPath();
      this.path.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.closePath();
      if (brush.shapeStyle === "fill") {
        ctx.fillStyle = brush.colour;
        ctx.fill();
      } else {
        ctx.strokeStyle = brush.colour;
        ctx.lineWidth = Math.max(1, brush.strokeWidth);
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      this.options.composite(
        this.options.getTargetLayerId(),
        surface,
        0,
        0,
        brush.opacity
      );
      this.options.onStrokeEnd();
      this.clearPath();
      return true;
    }
    /** Abandons a half-placed polygon. */
    clearPath() {
      this.path = [];
      this.dragStart = null;
    }
    /** Removes the listeners. */
    destroy() {
      this.onPointerUp();
      this.preview?.remove();
      this.preview = null;
      this.previewPath = null;
      this.options.stage.removeEventListener("pointerdown", this.onPointerDown);
    }
  }
  const PAGE_SIZE = 60;
  function thumbnailFor(item) {
    const sizes = item.media_details?.sizes ?? {};
    for (const name of ["thumbnail", "medium", "medium_large", "large"]) {
      const url = sizes[name]?.source_url;
      if (url) {
        return url;
      }
    }
    return item.source_url ?? "";
  }
  async function renderPicker(root, config, onPick, isStale) {
    if (isStale?.()) {
      return;
    }
    root.classList.add("dg-picker");
    const heading = document.createElement("h2");
    heading.className = "dg-picker__heading";
    heading.textContent = __("Choose a photo to edit");
    const status = document.createElement("p");
    status.className = "dg-picker__status";
    status.textContent = __("Loading your photos…");
    root.replaceChildren(heading, status);
    let items;
    try {
      const url = new URL(config.mediaUrl);
      url.searchParams.set("media_type", "image");
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("orderby", "date");
      url.searchParams.set("order", "desc");
      url.searchParams.set("_fields", "id,mime_type,title,source_url,media_details");
      const response = await request(url.toString(), {
        credentials: "same-origin",
        headers: { "X-WP-Nonce": config.restNonce }
      });
      if (!response.ok) {
        throw new Error(__("Your media library could not be loaded."));
      }
      items = await response.json();
    } catch (error) {
      status.classList.add("dg-picker__status--error");
      status.textContent = error instanceof Error ? error.message : __("Your media library could not be loaded.");
      return;
    }
    if (isStale?.()) {
      return;
    }
    const editable = items.filter(
      (item) => config.supportedMimes.includes(item.mime_type)
    );
    if (editable.length === 0) {
      status.textContent = __(
        "No editable images yet. Upload a JPEG, PNG, WebP or AVIF to get started."
      );
      const link = document.createElement("a");
      link.className = "button button-primary";
      link.href = "media-new.php";
      link.textContent = __("Upload a photo");
      root.appendChild(link);
      return;
    }
    status.remove();
    const grid = document.createElement("div");
    grid.className = "dg-picker__grid";
    grid.setAttribute("role", "list");
    for (const item of editable) {
      grid.appendChild(renderTile(item, onPick));
    }
    root.appendChild(grid);
  }
  function renderTile(item, onPick) {
    const title = item.title?.rendered?.replace(/<[^>]*>/g, "") || __("Untitled image");
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "dg-picker__tile";
    tile.setAttribute("role", "listitem");
    const image = document.createElement("img");
    image.className = "dg-picker__thumb";
    image.src = thumbnailFor(item);
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    const caption = document.createElement("span");
    caption.className = "dg-picker__caption";
    caption.textContent = title;
    const { width, height } = item.media_details ?? {};
    tile.title = width && height ? sprintf("%s — %d × %d", title, width, height) : title;
    tile.addEventListener("click", () => onPick?.(item.id));
    tile.append(image, caption);
    return tile;
  }
  const WINDOW_ID = "daguerre";
  function desktop() {
    const api = window.wp?.desktop;
    return api?.isActive?.() ? api : void 0;
  }
  function takePending() {
    const shared = state();
    const id = shared.pending;
    shared.pending = 0;
    return id;
  }
  function state() {
    const holder = window;
    holder.__daguerreDesktop ?? (holder.__daguerreDesktop = {
      openers: /* @__PURE__ */ new Set(),
      pending: 0,
      previewUrl: "",
      previewTitle: "",
      peekRegistered: false,
      listenerRegistered: false
    });
    return holder.__daguerreDesktop;
  }
  const OPEN_MESSAGE = "daguerre-open";
  function openInDesktop(attachmentId) {
    const id = Number(attachmentId) || 0;
    if (!id) {
      return false;
    }
    if (desktop()?.openWindow) {
      const live = [...state().openers].pop();
      if (live) {
        live(id);
      } else {
        state().pending = id;
      }
      desktop()?.openWindow?.(WINDOW_ID, { source: "daguerre" });
      return true;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: OPEN_MESSAGE, attachmentId: id },
        window.location.origin
      );
      return true;
    }
    return false;
  }
  function listenForOpenRequests() {
    if (state().listenerRegistered) {
      return;
    }
    state().listenerRegistered = true;
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data;
      if (!data || data.type !== OPEN_MESSAGE) {
        return;
      }
      openInDesktop(Number(data.attachmentId) || 0);
    });
  }
  function bootDesktopMode() {
    if (!desktop()) {
      return;
    }
    registerPeekThumbnail();
    try {
      registerFileOpener();
    } catch (error) {
      console.warn("[daguerre] file opener unavailable:", error);
    }
    listenForOpenRequests();
  }
  function registerPeekThumbnail() {
    const hooks = window.wp?.hooks;
    if (!hooks?.addFilter || state().peekRegistered) {
      return;
    }
    state().peekRegistered = true;
    hooks.addFilter(
      "desktop-mode.dock.peek-card-content",
      "daguerre/thumbnail",
      (body, context) => {
        const win = context?.window;
        const shared = state();
        if (!win?.id?.startsWith(WINDOW_ID) || !shared.previewUrl) {
          return body;
        }
        const image = document.createElement("img");
        image.className = "dg-peek-thumb";
        image.src = shared.previewUrl;
        image.alt = shared.previewTitle;
        image.loading = "lazy";
        image.decoding = "async";
        return image;
      }
    );
  }
  function registerNativeWindow() {
    const registry2 = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
    registry2[WINDOW_ID] = (body, ctx) => renderWindow(body, ctx);
  }
  function renderWindow(body, ctx) {
    const root = body.querySelector("[data-daguerre-root]") ?? body;
    const config = window.daguerreConfig;
    let editor = null;
    let releaseDrop = null;
    let session = 0;
    const open = (attachmentId2) => {
      session++;
      editor?.destroy();
      root.replaceChildren();
      ctx?.markLoading?.();
      editor = mount(root, {
        attachmentId: attachmentId2,
        host: "window",
        onSave: (result) => {
          attachDragOut(root, result);
          state().previewUrl = result.url;
        },
        onReady: (payload) => {
          state().previewUrl = payload?.url ?? "";
          state().previewTitle = payload?.title ?? "";
          ctx?.markReady?.();
        }
      });
    };
    state().openers.add(open);
    const attachmentId = takePending();
    if (attachmentId) {
      open(attachmentId);
    } else if (config) {
      const mine = session;
      void renderPicker(
        root,
        config,
        (id) => open(id),
        () => session !== mine
      );
    }
    try {
      releaseDrop = registerDropTarget(root, open);
    } catch (error) {
      console.warn("[daguerre] drag-and-drop unavailable:", error);
    }
    return () => {
      state().openers.delete(open);
      state().previewUrl = "";
      state().previewTitle = "";
      releaseDrop?.();
      editor?.destroy();
    };
  }
  function registerDropTarget(element, open) {
    const manager = desktop()?.dragManager;
    if (!manager?.registerDropTarget) {
      return null;
    }
    const attachmentOf = (payload) => {
      const bridge = payload.data?.bridgePayload;
      if (bridge?.kind !== "attachment") {
        return 0;
      }
      if (bridge.mime && !window.daguerreConfig?.supportedMimes.includes(bridge.mime)) {
        return 0;
      }
      return Number(bridge.id ?? 0);
    };
    return manager.registerDropTarget({
      id: "daguerre-window",
      element,
      accept: (payload) => attachmentOf(payload) > 0,
      acceptLabel: __("Open in Daguerre"),
      onDrop: (session) => {
        const id = attachmentOf(session.payload);
        if (id) {
          open(id);
        }
      }
    });
  }
  function attachDragOut(root, result) {
    const bridge = desktop()?.dragBridge;
    if (!bridge?.start) {
      return;
    }
    const banner = root.querySelector(".dg-saved a");
    if (!banner) {
      return;
    }
    banner.draggable = true;
    banner.title = __("Drag into another window to insert it");
    banner.addEventListener("dragstart", () => {
      bridge.start?.({
        kind: "attachment",
        id: result.id,
        url: result.url,
        title: __("Edited image"),
        alt: "",
        mime: result.mime,
        thumbnailUrl: result.url
      });
    });
    banner.addEventListener("dragend", () => bridge.end?.());
  }
  function registerFileOpener() {
    const files = desktop()?.files;
    if (!files?.registerOpener) {
      return;
    }
    files.registerOpener({
      id: "daguerre",
      label: __("Edit in Daguerre"),
      types: ["attachment"],
      isDefault: false,
      sort: 15,
      handler: {
        kind: "js",
        open: (file) => openInDesktop(Number(file.ref()) || 0)
      }
    });
  }
  registerNativeWindow();
  const SIZED_TOOLS = [
    "brush",
    "eraser",
    "retouch",
    "tone",
    "clone",
    "history"
  ];
  const MIN_RADIUS = 2;
  class BrushCursor {
    constructor(options) {
      this.at = null;
      this.onMove = (event) => {
        const rect = this.options.stage.getBoundingClientRect();
        this.at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        this.draw();
      };
      this.onLeave = () => {
        this.at = null;
        this.el.style.display = "none";
      };
      this.draw = () => {
        const tool = this.options.getTool();
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!this.at || !viewport || !SIZED_TOOLS.includes(tool) || canvas.width < 1 || viewport.width < 1) {
          this.el.style.display = "none";
          return;
        }
        const brush = this.options.getBrush();
        const scale = viewport.width / canvas.width;
        const size = Math.max(MIN_RADIUS * 2, brush.size * scale);
        this.el.style.display = "";
        this.el.style.inlineSize = `${size}px`;
        this.el.style.blockSize = `${size}px`;
        this.el.style.insetInlineStart = `${this.at.x}px`;
        this.el.style.insetBlockStart = `${this.at.y}px`;
        this.el.dataset.shape = brush.shape;
        this.el.classList.toggle("is-soft", brush.hardness < 0.5);
      };
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "dg-brush-cursor";
      this.el.setAttribute("aria-hidden", "true");
      this.el.style.display = "none";
      options.stage.appendChild(this.el);
      options.stage.addEventListener("pointermove", this.onMove);
      options.stage.addEventListener("pointerleave", this.onLeave);
    }
    /** Removes the cursor. */
    destroy() {
      this.options.stage.removeEventListener("pointermove", this.onMove);
      this.options.stage.removeEventListener("pointerleave", this.onLeave);
      this.el.remove();
    }
  }
  class TextEditor {
    constructor(options) {
      this.field = null;
      this.anchor = null;
      this.onInput = () => {
        this.resize();
      };
      this.onKeyDown = (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          this.cancel();
          return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          this.commit();
        }
      };
      this.restyle = () => {
        const field = this.field;
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!field || !this.anchor || !viewport || canvas.width < 1) {
          return;
        }
        const style = this.options.getStyle();
        const scale = viewport.width / canvas.width;
        field.style.font = cssFont({
          size: Math.max(1, style.size * scale),
          family: style.family,
          colour: style.colour,
          bold: style.bold,
          italic: style.italic
        });
        field.style.lineHeight = "1.25";
        field.style.color = style.colour;
        field.style.insetInlineStart = `${viewport.x + this.anchor.x / canvas.width * viewport.width}px`;
        field.style.insetBlockStart = `${viewport.y + this.anchor.y / canvas.height * viewport.height}px`;
        this.resize();
      };
      this.options = options;
    }
    /** Whether something is being typed right now. */
    get isEditing() {
      return this.field !== null;
    }
    /**
     * Opens a caret at a point on the canvas.
     *
     * Anything already being typed is committed first, which is what clicking elsewhere
     * with the text tool means in every editor.
     *
     * @param point Canvas coordinates for the top-left of the first line.
     */
    open(point) {
      this.commit();
      const field = document.createElement("textarea");
      field.className = "dg-text-editor";
      field.rows = 1;
      field.spellcheck = false;
      field.setAttribute("aria-label", "Text");
      field.addEventListener("pointerdown", (event) => event.stopPropagation());
      field.addEventListener("input", this.onInput);
      field.addEventListener("keydown", this.onKeyDown);
      field.addEventListener("blur", () => this.commit());
      this.anchor = point;
      this.field = field;
      this.options.stage.appendChild(field);
      this.restyle();
      field.focus();
      this.options.onStateChange?.();
    }
    /** Sizes the field to its contents, in both directions. */
    resize() {
      const field = this.field;
      if (!field) {
        return;
      }
      field.style.blockSize = "auto";
      field.style.inlineSize = "0";
      field.style.inlineSize = `${field.scrollWidth + 4}px`;
      field.style.blockSize = `${field.scrollHeight}px`;
    }
    /** Rasterises what was typed and closes the caret. */
    commit() {
      const field = this.field;
      const anchor = this.anchor;
      if (!field || !anchor) {
        return;
      }
      const text = field.value;
      this.close();
      if (text.trim()) {
        this.options.onCommit(text, anchor);
      }
    }
    /** Closes the caret, discarding what was typed. */
    cancel() {
      this.close();
    }
    /** Removes the field. */
    close() {
      const field = this.field;
      this.field = null;
      this.anchor = null;
      field?.remove();
      this.options.onStateChange?.();
    }
    /** Removes the editor entirely. */
    destroy() {
      this.close();
    }
  }
  const RULER_SIZE = 20;
  const MIN_LABEL_GAP = 56;
  class Rulers {
    constructor(options) {
      this.marker = null;
      this.onPointerMove = (event) => {
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!viewport || viewport.width === 0) {
          return;
        }
        const rect = this.options.stage.getBoundingClientRect();
        this.marker = {
          x: (event.clientX - rect.left - viewport.x) / viewport.width * canvas.width,
          y: (event.clientY - rect.top - viewport.y) / viewport.height * canvas.height
        };
        this.draw();
      };
      this.draw = () => {
        const viewport = this.options.getViewport();
        const canvas = this.options.getCanvas();
        if (!viewport || canvas.width <= 0) {
          this.root.hidden = true;
          return;
        }
        this.root.hidden = false;
        const bounds = this.options.stage.getBoundingClientRect();
        const scale = viewport.width / canvas.width;
        this.paint(
          this.horizontal,
          bounds.width - RULER_SIZE,
          RULER_SIZE,
          "h",
          viewport.x - RULER_SIZE,
          scale
        );
        this.paint(
          this.vertical,
          RULER_SIZE,
          bounds.height - RULER_SIZE,
          "v",
          viewport.y - RULER_SIZE,
          scale
        );
      };
      this.options = options;
      this.root = document.createElement("div");
      this.root.className = "dg-rulers";
      this.root.setAttribute("aria-hidden", "true");
      this.horizontal = document.createElement("canvas");
      this.horizontal.className = "dg-ruler dg-ruler--h";
      this.vertical = document.createElement("canvas");
      this.vertical.className = "dg-ruler dg-ruler--v";
      const corner = document.createElement("div");
      corner.className = "dg-ruler__corner";
      this.root.append(corner, this.horizontal, this.vertical);
      options.stage.appendChild(this.root);
      options.stage.addEventListener("pointermove", this.onPointerMove);
      this.draw();
    }
    /**
     * Paints one ruler.
     *
     * @param canvas Target canvas.
     * @param width  CSS width.
     * @param height CSS height.
     * @param axis   Which ruler.
     * @param origin Where canvas pixel zero falls, in CSS pixels along the ruler.
     * @param scale  CSS pixels per canvas pixel.
     */
    paint(canvas, width, height, axis, origin, scale) {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#1a1f24";
      ctx.fillRect(0, 0, w, h);
      const length = axis === "h" ? w : h;
      const step = tickStep(scale);
      ctx.font = "9px -apple-system, system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#8f979e";
      ctx.strokeStyle = "#4a5259";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const firstValue = Math.floor(-origin / scale / step) * step;
      for (let value = firstValue; ; value += step) {
        const at = origin + value * scale;
        if (at > length) {
          break;
        }
        if (at < 0) {
          continue;
        }
        const major = value % (step * 5) === 0;
        const size = major ? RULER_SIZE : RULER_SIZE * 0.4;
        if (axis === "h") {
          ctx.moveTo(Math.round(at) + 0.5, RULER_SIZE - size);
          ctx.lineTo(Math.round(at) + 0.5, RULER_SIZE);
        } else {
          ctx.moveTo(RULER_SIZE - size, Math.round(at) + 0.5);
          ctx.lineTo(RULER_SIZE, Math.round(at) + 0.5);
        }
        if (major) {
          if (axis === "h") {
            ctx.fillText(String(value), at + 2, 2);
          } else {
            ctx.save();
            ctx.translate(2, at + 2);
            ctx.rotate(Math.PI / 2);
            ctx.fillText(String(value), 0, -RULER_SIZE + 4);
            ctx.restore();
          }
        }
      }
      ctx.stroke();
      if (this.marker) {
        const at = origin + (axis === "h" ? this.marker.x : this.marker.y) * scale;
        ctx.strokeStyle = "#3582c4";
        ctx.beginPath();
        if (axis === "h") {
          ctx.moveTo(Math.round(at) + 0.5, 0);
          ctx.lineTo(Math.round(at) + 0.5, RULER_SIZE);
        } else {
          ctx.moveTo(0, Math.round(at) + 0.5);
          ctx.lineTo(RULER_SIZE, Math.round(at) + 0.5);
        }
        ctx.stroke();
      }
    }
    /** Shows or hides the rulers. */
    setVisible(visible) {
      this.root.style.display = visible ? "" : "none";
    }
    /** Removes the rulers. */
    destroy() {
      this.options.stage.removeEventListener("pointermove", this.onPointerMove);
      this.root.remove();
    }
  }
  function tickStep(scale) {
    const wanted = MIN_LABEL_GAP / Math.max(scale, 1e-6) / 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(wanted, 1e-6))));
    for (const multiple of [1, 2, 5, 10]) {
      if (magnitude * multiple >= wanted) {
        return magnitude * multiple;
      }
    }
    return magnitude * 10;
  }
  const DEFAULT_FOREGROUND = "#000000";
  const DEFAULT_BACKGROUND = "#ffffff";
  const PALETTE = [
    "#000000",
    "#404040",
    "#808080",
    "#c0c0c0",
    "#ffffff",
    "#d63638",
    "#e06d1f",
    "#dba617",
    "#00a32a",
    "#2271b1",
    "#3858e9",
    "#8c1eb0"
  ];
  class Swatches {
    constructor(options) {
      this.popover = null;
      this.release = [];
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "dg-swatches";
      this.foreground = this.makeSwatch("colour", __("Foreground colour"));
      this.background = this.makeSwatch("background", __("Background colour"));
      this.swapButton = createIconButton({
        glyph: "⇄",
        label: __("Swap colours (X)"),
        className: "dg-swatches__action",
        onClick: () => this.swap()
      });
      this.resetButton = createIconButton({
        glyph: "◨",
        label: __("Reset to black and white (D)"),
        className: "dg-swatches__action",
        onClick: () => this.reset()
      });
      const stack = document.createElement("div");
      stack.className = "dg-swatches__stack";
      stack.append(this.foreground, this.background);
      this.el.append(stack, this.swapButton.el, this.resetButton.el);
      this.off = options.onColoursChange(() => this.sync());
      this.sync();
    }
    /**
     * Builds one swatch button.
     *
     * @param which Which colour it shows.
     * @param label Accessible name.
     */
    makeSwatch(which, label) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `dg-swatches__chip dg-swatches__chip--${which}`;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-haspopup", "dialog");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openPicker(which, button, label);
      });
      return button;
    }
    /**
     * Opens the colour picker for one swatch.
     *
     * @param which  Which colour is being edited.
     * @param anchor The swatch the popover hangs from.
     * @param label  Accessible name.
     */
    openPicker(which, anchor, label) {
      const already = this.popover?.dataset.which === which;
      this.closePicker();
      if (already) {
        return;
      }
      const popover = document.createElement("div");
      popover.className = "dg-swatch-popover";
      popover.dataset.which = which;
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-label", label);
      const field = createColourField({
        label,
        value: this.options.getColours()[which],
        onChange: (value) => {
          this.options.setColours({ [which]: value });
          this.sync();
        }
      });
      const palette = createSwatchGrid({
        label: __("Palette"),
        colours: PALETTE,
        value: this.options.getColours()[which],
        onChange: (colour) => {
          this.options.setColours({ [which]: colour });
          field.setValue(colour);
          palette.setValue(colour);
          this.sync();
        }
      });
      const done = createButton({
        label: __("Done"),
        variant: "secondary",
        onClick: () => this.closePicker()
      });
      popover.append(field.el, palette.el, done.el);
      floatingHost(anchor).appendChild(popover);
      positionFloating(popover, anchor, "block-end");
      this.popover = popover;
      this.release = [field.destroy, palette.destroy, done.destroy];
      const onAway = (event) => {
        if (event.target instanceof Node && !popover.contains(event.target)) {
          this.closePicker();
        }
      };
      const onKey = (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          this.closePicker();
        }
      };
      window.setTimeout(() => document.addEventListener("click", onAway), 0);
      popover.addEventListener("keydown", onKey);
      this.release.push(() => document.removeEventListener("click", onAway));
    }
    /** Closes the picker, if one is open. */
    closePicker() {
      for (const off of this.release) {
        off();
      }
      this.release = [];
      this.popover?.remove();
      this.popover = null;
    }
    /** Exchanges the two colours. */
    swap() {
      const { colour, background } = this.options.getColours();
      this.options.setColours({ colour: background, background: colour });
      this.sync();
    }
    /** Restores black on white. */
    reset() {
      this.options.setColours({
        colour: DEFAULT_FOREGROUND,
        background: DEFAULT_BACKGROUND
      });
      this.sync();
    }
    /** Repaints both chips from the current settings. */
    sync() {
      const { colour, background } = this.options.getColours();
      this.foreground.style.background = colour;
      this.background.style.background = background;
      this.foreground.title = `${__("Foreground colour")}: ${colour}`;
      this.background.title = `${__("Background colour")}: ${background}`;
    }
    /** Releases listeners. */
    destroy() {
      this.closePicker();
      this.swapButton.destroy();
      this.resetButton.destroy();
      this.off();
      this.el.remove();
    }
  }
  const TOOLS = [
    { id: "transform", glyph: "✥", label: "Move & transform", key: "v", group: 1 },
    { id: "select", glyph: "⬚", label: "Select", key: "m", group: 1 },
    { id: "wand", glyph: "✧", label: "Magic wand", key: "w", group: 1 },
    { id: "crop", glyph: "⌗", label: "Crop", key: "c", group: 1 },
    { id: "eyedropper", glyph: "⌖", label: "Eyedropper", key: "i", group: 2 },
    { id: "retouch", glyph: "◌", label: "Retouch", key: "r", group: 2 },
    { id: "clone", glyph: "⎗", label: "Clone stamp", key: "s", group: 2 },
    { id: "tone", glyph: "◐", label: "Dodge & burn", key: "o", group: 2 },
    { id: "brush", glyph: "✎", label: "Brush", key: "b", group: 3 },
    { id: "history", glyph: "↺", label: "History brush", key: "y", group: 3 },
    { id: "eraser", glyph: "◻", label: "Eraser", key: "e", group: 3 },
    { id: "fill", glyph: "◧", label: "Fill", key: "g", group: 3 },
    { id: "gradient", glyph: "▨", label: "Gradient", key: "n", group: 4 },
    { id: "shape", glyph: "▬", label: "Shape", key: "u", group: 4 },
    { id: "path", glyph: "✒", label: "Path", key: "p", group: 4 },
    { id: "text", glyph: "T", label: "Text", key: "t", group: 4 },
    { id: "hand", glyph: "☞", label: "Hand", key: "h", group: 5 },
    { id: "zoom", glyph: "⌕", label: "Zoom", key: "z", group: 5 }
  ];
  class ToolRail {
    constructor(options) {
      this.buttons = /* @__PURE__ */ new Map();
      this.menu = null;
      this.detach = [];
      this.menuHandles = [];
      this.closeAway = null;
      this.options = options;
      this.el = document.createElement("div");
      this.el.className = "dg-rail";
      const grid = document.createElement("div");
      grid.className = "dg-rail__grid";
      grid.setAttribute("role", "toolbar");
      grid.setAttribute("aria-orientation", "vertical");
      grid.setAttribute("aria-label", __("Tools"));
      let group = TOOLS[0]?.group;
      let inGroup = 0;
      for (const tool of TOOLS) {
        if (tool.group !== group) {
          if (inGroup % 2 === 1) {
            const spacer = document.createElement("span");
            spacer.className = "dg-rail__spacer";
            spacer.setAttribute("aria-hidden", "true");
            grid.appendChild(spacer);
          }
          const rule = document.createElement("span");
          rule.className = "dg-rail__rule";
          rule.setAttribute("aria-hidden", "true");
          grid.appendChild(rule);
          group = tool.group;
          inGroup = 0;
        }
        inGroup++;
        const button = createIconButton({
          glyph: tool.glyph,
          label: `${__(tool.label)} (${tool.key.toUpperCase()})`,
          className: "dg-rail__button",
          onClick: () => options.onSelect(tool.id)
        });
        button.el.setAttribute("aria-pressed", "false");
        this.buttons.set(tool.id, button);
        grid.appendChild(button.el);
      }
      this.overflow = createIconButton({
        glyph: "⋯",
        label: __("All tools"),
        className: "dg-rail__button",
        onClick: () => this.toggleMenu()
      });
      grid.appendChild(this.overflow.el);
      this.swatches = new Swatches(options);
      this.quickMask = createIconButton({
        glyph: "◍",
        label: __("Quick mask: show the selection as a red overlay (Q)"),
        className: "dg-rail__mode",
        onClick: () => {
          options.setQuickMask(!options.getQuickMask());
          this.syncModes();
        }
      });
      this.fullScreen = createIconButton({
        glyph: "⛶",
        label: __("Full screen (F)"),
        className: "dg-rail__mode",
        onClick: () => {
          options.setFullScreen(!options.getFullScreen());
          this.syncModes();
        }
      });
      const modes = document.createElement("div");
      modes.className = "dg-rail__modes";
      modes.setAttribute("role", "group");
      modes.setAttribute("aria-label", __("Screen modes"));
      modes.append(this.quickMask.el, this.fullScreen.el);
      this.el.append(grid, this.swatches.el, modes);
      const onKey = (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget$1(event.target)) {
          return;
        }
        const key = event.key.toLowerCase();
        if (key === "x") {
          event.preventDefault();
          this.swatches.swap();
          return;
        }
        if (key === "d") {
          event.preventDefault();
          this.swatches.reset();
          return;
        }
        if (key === "q") {
          event.preventDefault();
          options.setQuickMask(!options.getQuickMask());
          this.syncModes();
          return;
        }
        if (key === "f") {
          event.preventDefault();
          options.setFullScreen(!options.getFullScreen());
          this.syncModes();
          return;
        }
        const match = TOOLS.find((tool) => tool.key === key);
        if (match) {
          event.preventDefault();
          options.onSelect(match.id);
        }
      };
      document.addEventListener("keydown", onKey);
      this.detach.push(() => document.removeEventListener("keydown", onKey));
      this.sync(options.getActive());
    }
    /**
     * Marks the active tool.
     *
     * @param active Tool now in use.
     */
    sync(active) {
      for (const [id, button] of this.buttons) {
        button.setPressed(id === active);
      }
      this.swatches.sync();
      this.syncModes();
    }
    /** Marks the quick-mask and full-screen toggles. */
    syncModes() {
      this.quickMask.setPressed(this.options.getQuickMask());
      this.fullScreen.setPressed(this.options.getFullScreen());
    }
    /**
     * Shows or hides the named tool list.
     *
     * A plain list rather than Desktop Mode's `wpd-menu`: this has to work identically
     * with the shell absent, and a menu is the one control where a half-registered
     * component would leave the user with nothing clickable.
     */
    toggleMenu() {
      if (this.menu) {
        this.closeMenu();
        return;
      }
      const menu = document.createElement("div");
      menu.className = "dg-rail-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", __("All tools"));
      const handles = [];
      for (const tool of TOOLS) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "dg-rail-menu__item";
        item.setAttribute("role", "menuitem");
        item.innerHTML = "";
        const glyph = document.createElement("span");
        glyph.className = "dg-rail-menu__glyph";
        glyph.textContent = tool.glyph;
        const name = document.createElement("span");
        name.textContent = __(tool.label);
        const key = document.createElement("kbd");
        key.textContent = tool.key.toUpperCase();
        item.append(glyph, name, key);
        item.addEventListener("click", () => {
          this.options.onSelect(tool.id);
          this.closeMenu();
        });
        menu.appendChild(item);
      }
      floatingHost(this.el).appendChild(menu);
      positionFloating(menu, this.overflow.el, "inline-end");
      this.menu = menu;
      this.menuHandles = handles;
      const onAway = (event) => {
        if (event.target instanceof Node && !menu.contains(event.target) && !this.overflow.el.contains(event.target)) {
          this.closeMenu();
        }
      };
      window.setTimeout(() => document.addEventListener("click", onAway), 0);
      this.closeAway = () => document.removeEventListener("click", onAway);
    }
    /** Removes the tool list. */
    closeMenu() {
      this.closeAway?.();
      this.closeAway = null;
      for (const handle of this.menuHandles) {
        handle.destroy();
      }
      this.menuHandles = [];
      this.menu?.remove();
      this.menu = null;
    }
    /** Removes the rail and its shortcuts. */
    destroy() {
      for (const off of this.detach) {
        off();
      }
      this.detach = [];
      this.closeMenu();
      for (const button of this.buttons.values()) {
        button.destroy();
      }
      this.buttons.clear();
      this.overflow.destroy();
      this.quickMask.destroy();
      this.fullScreen.destroy();
      this.swatches.destroy();
      this.el.remove();
    }
  }
  function isTypingTarget$1(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || // A Desktop Mode control is a custom element wrapping its own input, so the
    // tag test alone would let a keystroke inside one switch tools.
    target.tagName.startsWith("WPD-") || target.closest('[ contenteditable="true" ]') !== null;
  }
  function mount(element, options) {
    const editor = new Editor(element, options);
    void editor.boot();
    return editor;
  }
  function textLayerName(text) {
    const first = text.split("\n")[0].trim();
    if (!first) {
      return __("Text");
    }
    return first.length > 24 ? `${first.slice(0, 23)}…` : first;
  }
  function readConfig() {
    const config = window.daguerreConfig;
    if (!config) {
      throw new Error(
        "Daguerre configuration is missing. The editor script was loaded without daguerre_enqueue_editor()."
      );
    }
    return config;
  }
  class Editor {
    constructor(element, options) {
      this.payload = null;
      this.renderer = null;
      this.loaded = null;
      this.buttons = [];
      this.panelHost = null;
      this.recipeListeners = /* @__PURE__ */ new Set();
      this.activeTool = "transform";
      this.toolListeners = /* @__PURE__ */ new Set();
      this.brush = defaultBrush();
      this.brushListeners = /* @__PURE__ */ new Set();
      this.view = readViewPrefs();
      this.rulers = null;
      this.brushCursor = null;
      this.textEditor = null;
      this.selection = null;
      this.selectionShape = "rect";
      this.quickMask = false;
      this.fullScreen = false;
      this.optionsBar = null;
      this.clipboard = null;
      this.strokeTiles = null;
      this.strokeLayer = "";
      this.stageTools = null;
      this.toolRail = null;
      this.selectionBox = null;
      this.undoButton = null;
      this.redoButton = null;
      this.resetButton = null;
      this.saveButton = null;
      this.exportButton = null;
      this.busy = false;
      this.destroyed = false;
      this.detachKeys = [];
      this.root = element;
      this.options = options;
      this.config = readConfig();
      this.client = new RestClient(this.config);
      this.history = new History(defaultRecipe(options.attachmentId));
      this.buildShell();
    }
    /** Renderer internals, for diagnosing render problems from the console. */
    debug() {
      return {
        renderer: this.renderer?.debugState() ?? null,
        activeTool: this.activeTool,
        selection: this.selection,
        hasClipboard: !!this.clipboard,
        recipeLayers: this.history.current.layers.map((l) => ({
          id: l.id,
          kind: l.kind
        })),
        activeLayerId: this.history.current.activeLayerId
      };
    }
    /** Current edit. */
    getRecipe() {
      return this.history.current;
    }
    /**
     * Replaces the current edit.
     *
     * @param recipe New recipe.
     */
    setRecipe(recipe) {
      this.history.push(recipe, "set-recipe");
      this.syncFromRecipe();
    }
    /** Builds the static layout and the loading state. */
    buildShell() {
      this.root.replaceChildren();
      this.root.classList.add("dg-editor");
      this.root.classList.add(`dg-editor--${this.options.host ?? "page"}`);
      this.root.classList.toggle("is-desktop-mode", isDesktopModeEnabled());
      const topbar = document.createElement("div");
      topbar.className = "dg-topbar";
      topbar.setAttribute("role", "toolbar");
      topbar.setAttribute("aria-label", __("Editor actions"));
      const title = document.createElement("h1");
      title.className = "dg-topbar__title";
      title.textContent = __("Loading image…");
      const actions = document.createElement("div");
      actions.className = "dg-topbar__actions";
      this.undoButton = createButton({
        label: __("Undo"),
        title: __("Undo (Ctrl+Z)"),
        variant: "ghost",
        onClick: () => this.undo()
      });
      this.redoButton = createButton({
        label: __("Redo"),
        title: __("Redo (Ctrl+Shift+Z)"),
        variant: "ghost",
        onClick: () => this.redo()
      });
      const compare = createButton({
        label: __("Compare"),
        title: __("Hold to see the original"),
        variant: "ghost",
        onClick: () => {
        }
      });
      this.attachCompare(compare);
      this.resetButton = createButton({
        label: __("Reset"),
        title: __("Return every adjustment to zero"),
        variant: "secondary",
        onClick: () => this.resetAll()
      });
      const recenter = createButton({
        label: "⊕",
        // Easy to scroll into empty pasteboard and lose the picture entirely;
        // this is the way back that does not require knowing the shortcut.
        title: __("Recentre the view (0)"),
        variant: "ghost",
        onClick: () => this.renderer?.resetView()
      });
      this.buttons.push(recenter);
      actions.appendChild(recenter.el);
      this.exportButton = createButton({
        label: __("Export"),
        title: __("Download the edited image to this device"),
        variant: "secondary",
        onClick: () => void this.exportToDevice()
      });
      this.saveButton = createButton({
        label: __("Save a copy"),
        title: __("Save as a new image, leaving the original untouched"),
        variant: "primary",
        onClick: () => void this.save()
      });
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
      if (this.options.onClose) {
        const close = createButton({
          label: __("Close"),
          variant: "ghost",
          onClick: () => this.options.onClose?.()
        });
        this.buttons.push(close);
        actions.appendChild(close.el);
      }
      topbar.append(title, actions);
      const body = document.createElement("div");
      body.className = "dg-body";
      this.stage = document.createElement("div");
      this.stage.className = "dg-stage";
      this.backdrop = document.createElement("div");
      this.backdrop.className = "dg-canvas-backdrop";
      this.backdrop.setAttribute("aria-hidden", "true");
      this.stage.appendChild(this.backdrop);
      this.status = document.createElement("p");
      this.status.className = "dg-status";
      this.status.textContent = __("Loading image…");
      this.stage.appendChild(this.status);
      this.sidebar = document.createElement("aside");
      this.sidebar.className = "dg-sidebar";
      this.sidebar.id = "dg-sidebar";
      this.sidebar.setAttribute("aria-label", __("Tools"));
      this.sidebarTab = document.createElement("button");
      this.sidebarTab.type = "button";
      this.sidebarTab.className = "dg-sidebar-tab";
      const tabLabel = document.createElement("span");
      tabLabel.className = "dg-sidebar-tab__label";
      tabLabel.textContent = __("Tools");
      this.sidebarTab.appendChild(tabLabel);
      this.sidebarTab.setAttribute("aria-controls", "dg-sidebar");
      this.sidebarTab.addEventListener("click", () => this.setSidebarOpen(true));
      body.append(this.stage, this.sidebar, this.sidebarTab);
      this.root.append(topbar, body);
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
    attachCompare(button) {
      const start = () => {
        this.renderer?.setBypass(true);
        button.setPressed(true);
      };
      const end = () => {
        this.renderer?.setBypass(false);
        button.setPressed(false);
      };
      button.el.addEventListener("pointerdown", start);
      button.el.addEventListener("pointerup", end);
      button.el.addEventListener("pointerleave", end);
      button.el.addEventListener("pointercancel", end);
      const onKeyDown = (event) => {
        if (event.key === "\\" && !event.repeat && !isTypingTarget(event.target)) {
          start();
        }
      };
      const onKeyUp = (event) => {
        if (event.key === "\\") {
          end();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("keyup", onKeyUp);
      this.detachKeys.push(() => {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
      });
    }
    /** Loads the image and brings the editor up. */
    async boot() {
      try {
        this.payload = await this.client.getMedia(this.options.attachmentId);
        if (this.destroyed) {
          return;
        }
        this.history = new History(
          validateRecipe(this.payload.recipe, this.payload.schema)
        );
        this.setStatus(__("Decoding image…"));
        this.loaded = await loadSourceImage(this.payload, this.client);
        if (this.destroyed) {
          this.loaded.release();
          return;
        }
        this.setStatus(__("Starting the renderer…"));
        this.renderer = await EditorRenderer.create({
          host: this.stage,
          maxRenderPixels: this.config.maxRenderPixels,
          schema: this.payload.schema
        });
        if (this.destroyed) {
          this.renderer.destroy();
          this.renderer = null;
          return;
        }
        this.renderer.setImage(this.loaded.image);
        const stored = this.history.current;
        const canvas = stored.canvas.width > 0 && stored.canvas.height > 0 ? stored.canvas : this.renderer.imageSize;
        this.history.replace({ ...stored, canvas });
        this.renderer.setDocument(canvas, stored.layers, stored.activeLayerId);
        this.renderer.setTone(stored.curves, stored.levels);
        this.syncBackdrop();
        this.detachKeys.push(this.renderer.onViewportChange(() => this.syncBackdrop()));
        this.attachPasteboard();
        this.attachTools();
        this.status.remove();
        this.buildSidebar();
        this.syncFromRecipe();
        this.attachShortcuts();
        this.setTitle();
      } catch (error) {
        this.fail(error);
      } finally {
        this.options.onReady?.(this.payload);
      }
    }
    /** Shows a message in the stage area. */
    setStatus(message) {
      this.status.textContent = message;
      if (!this.status.isConnected) {
        this.stage.appendChild(this.status);
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
    fail(error) {
      const message = error instanceof Error ? error.message : __("The image could not be opened.");
      this.status.classList.add("dg-status--error");
      this.setStatus(message);
      toast(message, "error");
    }
    /** Puts the image title in the toolbar. */
    setTitle() {
      const title = this.root.querySelector(".dg-topbar__title");
      if (title && this.payload) {
        title.textContent = this.payload.title || __("Untitled image");
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
    buildSidebar() {
      if (!this.payload || !this.renderer) {
        return;
      }
      registerBuiltInPanels();
      this.panelHost = new PanelHost(
        this.sidebar,
        this.panelContext(),
        () => this.setSidebarOpen(false)
      );
      this.setSidebarOpen(readSidebarOpen());
    }
    /** Everything a panel or the options bar is given. */
    panelContext() {
      return {
        // Only ever called once an image is loaded, so the non-null assertion is
        // carrying a real invariant rather than papering over one.
        payload: this.payload,
        getRecipe: () => this.history.current,
        setOp: (type, value) => this.applyOp(type, value),
        setOutput: (patch) => this.setOutput(patch),
        setLayer: (layer, label) => this.applyLayer(layer, label),
        setDocument: (canvas, layer, label) => this.applyDocument(canvas, layer, label),
        getImageSize: () => this.activeLayerSize(),
        getActiveTool: () => this.activeTool,
        setActiveTool: (tool) => this.setActiveTool(tool),
        onActiveToolChange: (listener) => {
          this.toolListeners.add(listener);
          return () => {
            this.toolListeners.delete(listener);
          };
        },
        setCurve: (channel, points) => this.applyCurve(channel, points),
        setLevels: (levels) => this.applyLevels(levels),
        stage: this.stage,
        getViewport: () => this.renderer?.getViewport() ?? null,
        onViewportChange: (listener) => this.renderer?.onViewportChange(listener) ?? (() => {
        }),
        onHistogram: (listener) => this.renderer?.onHistogram(listener) ?? (() => {
        }),
        onRecipeChange: (listener) => {
          this.recipeListeners.add(listener);
          return () => {
            this.recipeListeners.delete(listener);
          };
        },
        listPresets: () => this.client.getPresets(),
        savePreset: (name) => this.client.createPreset(name, this.history.current),
        deletePreset: (id) => this.client.deletePreset(id),
        applyPreset: (preset) => this.applyPreset(preset),
        getLayers: () => this.history.current.layers,
        getActiveLayerId: () => this.history.current.activeLayerId,
        setLayers: (layers, activeId) => this.applyLayers(layers, activeId),
        addLayer: () => this.addLayer(),
        getBrush: () => this.brush,
        setBrush: (patch) => this.setBrush(patch),
        getView: () => this.view,
        setView: (patch) => this.setView(patch),
        onBrushChange: (listener) => {
          this.brushListeners.add(listener);
          return () => {
            this.brushListeners.delete(listener);
          };
        }
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
    setOutput(patch) {
      const current = this.history.current;
      this.history.replace({
        ...current,
        output: { ...current.output, ...patch }
      });
    }
    /**
     * Applies one adjustment and re-renders.
     *
     * @param type  Op to change.
     * @param value New canonical value.
     */
    applyOp(type, value) {
      if (!this.payload) {
        return;
      }
      const next = setOp(this.history.current, type, value, this.payload.schema);
      this.history.push(next, type);
      this.renderer?.setOps(next.ops);
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
    setSidebarOpen(open) {
      this.root.classList.toggle("is-sidebar-hidden", !open);
      this.sidebarTab.setAttribute("aria-expanded", String(open));
      this.sidebarTab.hidden = open;
      writeSidebarOpen(open);
      this.renderer?.fit();
    }
    /**
     * Changes a view preference.
     *
     * @param patch Fields to change.
     */
    setView(patch) {
      this.view = { ...this.view, ...patch };
      writeViewPrefs(this.view);
      this.rulers?.setVisible(this.view.rulers);
      this.stage.classList.toggle("has-rulers", this.view.rulers);
      this.renderer?.fit();
    }
    /** Builds the tool rail, the selection marquee and the painting controller. */
    attachTools() {
      const renderer = this.renderer;
      if (!renderer) {
        return;
      }
      const ctx = this.panelContext();
      this.toolRail = new ToolRail({
        getActive: () => this.activeTool,
        onSelect: (tool) => this.setActiveTool(tool),
        getColours: () => ({
          colour: this.brush.colour,
          background: this.brush.background
        }),
        setColours: (patch) => this.setBrush(patch),
        onColoursChange: (listener) => {
          const wrapped = () => listener();
          this.brushListeners.add(wrapped);
          return () => {
            this.brushListeners.delete(wrapped);
          };
        },
        getQuickMask: () => this.quickMask,
        setQuickMask: (on) => this.setQuickMask(on),
        getFullScreen: () => this.fullScreen,
        setFullScreen: (on) => this.setFullScreen(on)
      });
      this.root.querySelector(".dg-body")?.prepend(this.toolRail.el);
      this.stage.dataset.tool = this.activeTool;
      this.rulers = new Rulers({
        stage: this.stage,
        getViewport: () => renderer.getViewport(),
        getCanvas: () => this.history.current.canvas
      });
      this.rulers.setVisible(this.view.rulers);
      this.stage.classList.toggle("has-rulers", this.view.rulers);
      this.detachKeys.push(renderer.onViewportChange(this.rulers.draw));
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "dg-selection");
      svg.setAttribute("aria-hidden", "true");
      for (const cls of ["dg-selection__under", "dg-selection__over"]) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", cls);
        svg.appendChild(path);
      }
      this.selectionBox = svg;
      this.stage.appendChild(this.selectionBox);
      this.syncSelection();
      this.optionsBar = new OptionsBar({
        ctx,
        getTool: () => this.activeTool,
        getSelectionShape: () => this.selectionShape,
        setSelectionShape: (shape) => {
          this.selectionShape = shape;
          this.stageTools?.clearPath();
          this.setSelection(null);
        },
        hasSelection: () => this.selection !== null,
        deselect: () => {
          this.stageTools?.clearPath();
          this.setSelection(null);
        },
        selectAll: () => this.setSelection({
          shape: "rect",
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 }
          ]
        }),
        hasCloneSource: () => !!this.stageTools?.getCloneSource(),
        clearCloneSource: () => this.stageTools?.clearCloneSource(),
        isTypingText: () => this.textEditor?.isEditing === true,
        setZoom: (mode) => {
          if (mode === "fit") {
            renderer.resetView();
          } else {
            renderer.zoomToActual();
          }
        }
      });
      this.root.querySelector(".dg-topbar")?.after(this.optionsBar.el);
      this.stageTools = new StageTools({
        stage: this.stage,
        getViewport: () => renderer.getViewport(),
        getCanvas: () => this.history.current.canvas,
        getTool: () => this.activeTool,
        getBrush: () => this.brush,
        setBrush: (patch) => this.setBrush(patch),
        getTargetLayerId: () => this.paintTarget(),
        stamp: (id, image, x, y, size, colour, opacity, erase) => {
          this.captureTiles(id, dabRegion(x, y, size));
          renderer.stampBrush(id, image, x, y, size, colour, opacity, erase);
        },
        fillMask: (id, mask, colour, opacity) => {
          const canvas = this.history.current.canvas;
          this.captureTiles(id, {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height
          });
          renderer.fillWithMask(id, mask, colour, opacity);
        },
        composite: (id, source, x, y, opacity) => {
          this.captureTiles(id, {
            x,
            y,
            width: source.width,
            height: source.height
          });
          renderer.compositeCanvas(id, source, x, y, opacity);
        },
        readDocument: () => renderer.readDocumentPixels(),
        readPristine: () => renderer.readPristinePixels(),
        getSelectionShape: () => this.selectionShape,
        setSelection: (selection) => this.setSelection(selection),
        pan: (dx, dy) => renderer.pan(dx, dy),
        zoomAt: (factor, x, y) => renderer.zoomAt(factor, x, y),
        onToolStateChange: () => this.optionsBar?.render(),
        onPlaceText: (point) => this.textEditor?.open(point),
        onStrokeEnd: () => {
          this.commitStroke();
        }
      });
      this.textEditor = new TextEditor({
        stage: this.stage,
        getViewport: () => renderer.getViewport(),
        getCanvas: () => this.history.current.canvas,
        getStyle: () => ({
          size: this.brush.fontSize,
          family: this.brush.fontFamily,
          colour: this.brush.colour,
          bold: this.brush.bold,
          italic: this.brush.italic
        }),
        onCommit: (text, point) => this.drawText(text, point),
        onStateChange: () => this.optionsBar?.render()
      });
      this.brushListeners.add(this.textEditor.restyle);
      this.detachKeys.push(renderer.onViewportChange(this.textEditor.restyle));
      this.brushCursor = new BrushCursor({
        stage: this.stage,
        getViewport: () => renderer.getViewport(),
        getCanvas: () => this.history.current.canvas,
        getTool: () => this.activeTool,
        getBrush: () => this.brush
      });
      this.detachKeys.push(renderer.onViewportChange(this.brushCursor.draw));
      this.brushListeners.add(this.brushCursor.draw);
      this.toolListeners.add(this.brushCursor.draw);
      this.detachKeys.push(renderer.onViewportChange(() => this.syncSelection()));
      this.attachClipboard();
    }
    /**
     * Remembers a region's pixels before a paint operation overwrites them.
     *
     * @param layerId Layer about to change.
     * @param rect    Region about to change, in canvas pixels.
     */
    captureTiles(layerId, rect) {
      const renderer = this.renderer;
      if (!renderer) {
        return;
      }
      const canvas = this.history.current.canvas;
      if (!this.strokeTiles || this.strokeLayer !== layerId) {
        this.strokeTiles = new TileCollector(canvas.width, canvas.height);
        this.strokeLayer = layerId;
      }
      this.strokeTiles.add(
        rect,
        (tile) => renderer.extractLayerRegion(layerId, tile)
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
    commitStroke() {
      const collector = this.strokeTiles;
      const layerId = this.strokeLayer;
      this.strokeTiles = null;
      this.strokeLayer = "";
      if (!collector || collector.size === 0) {
        return;
      }
      this.history.push(
        { ...this.history.current },
        "paint",
        collector.toPatch(layerId)
      );
      this.syncToolbar();
    }
    /**
     * Turns typed text into a layer of its own.
     *
     * Not painted into the shared raster layer. Text is an object: you want to move it,
     * scale it, put something behind it or throw it away without touching anything else
     * -- and none of that is possible once it has been flattened into a canvas-sized
     * sheet along with every brush stroke. So each commit becomes a layer whose texture
     * is exactly the size of the glyphs, positioned where they were typed, which the
     * Transform tool can then move and scale like any other object.
     *
     * This is the same path a paste takes, for the same reason.
     *
     * @param text  What was typed.
     * @param point Canvas coordinates of the first line's top-left corner.
     */
    drawText(text, point) {
      const renderer = this.renderer;
      const rendered = textCanvas({
        text,
        size: this.brush.fontSize,
        family: this.brush.fontFamily,
        colour: this.brush.colour,
        bold: this.brush.bold,
        italic: this.brush.italic,
        strokeWidth: this.brush.shapeStyle === "stroke" ? this.brush.strokeWidth : 0
      });
      if (!renderer || !rendered) {
        return;
      }
      const recipe = this.history.current;
      const canvas = recipe.canvas;
      if (canvas.width < 1 || canvas.height < 1) {
        return;
      }
      const layer = createRasterLayer(textLayerName(text), {
        x: (point.x + rendered.offsetX + rendered.canvas.width / 2) / canvas.width,
        y: (point.y + rendered.offsetY + rendered.canvas.height / 2) / canvas.height
      });
      renderer.addRasterTexture(layer.id, rendered.canvas);
      this.applyLayers([...recipe.layers, layer], layer.id);
    }
    /**
     * The layer a stroke should land on.
     *
     * Painting onto the base image layer would destroy the original pixels, and the
     * whole plugin rests on not doing that -- so a stroke aimed at it silently gets
     * a new raster layer instead.
     */
    paintTarget() {
      const recipe = this.history.current;
      const active = recipe.layers.find(
        (layer2) => layer2.id === recipe.activeLayerId
      );
      if (active && this.isPaintSheet(active.id)) {
        return active.id;
      }
      const existing = recipe.layers.find(
        (layer2) => layer2.kind === "raster" && this.isPaintSheet(layer2.id)
      );
      if (existing) {
        return existing.id;
      }
      const layer = createRasterLayer(__("Paint"));
      this.renderer?.ensurePaintTexture(layer.id);
      this.applyLayers([...recipe.layers, layer], layer.id, false);
      return layer.id;
    }
    /**
     * Whether a layer is a full-canvas sheet that can be painted on directly.
     *
     * Text and pasted layers are *objects*: their texture is the size of their content
     * and their transform puts it somewhere. Painting into one would promote it to a
     * canvas-sized target with the old content re-centred, so the object would jump
     * across the canvas the moment a brush touched it. Strokes therefore go to a sheet,
     * and the objects stay where they were put.
     *
     * @param layerId Layer to test.
     */
    isPaintSheet(layerId) {
      const recipe = this.history.current;
      const layer = recipe.layers.find((entry) => entry.id === layerId);
      if (!layer || layer.kind !== "raster" || !this.renderer) {
        return false;
      }
      const size = this.renderer.layerTextureSize(layerId);
      return size.width === 0 || size.width === recipe.canvas.width && size.height === recipe.canvas.height;
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
    setSelection(selection) {
      this.selection = isEmptySelection(selection) ? null : selection;
      const canvas = this.history.current.canvas;
      this.renderer?.setPaintMask(
        buildSelectionMask(this.selection, canvas.width, canvas.height)
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
    syncSelection() {
      const svg = this.selectionBox;
      const viewport = this.renderer?.getViewport();
      if (!svg) {
        return;
      }
      if (!this.selection || !viewport) {
        svg.style.display = "none";
        for (const node of svg.querySelectorAll("path")) {
          node.setAttribute("d", "");
        }
        return;
      }
      svg.style.display = "";
      svg.style.insetInlineStart = `${viewport.x}px`;
      svg.style.insetBlockStart = `${viewport.y}px`;
      svg.setAttribute("width", String(viewport.width));
      svg.setAttribute("height", String(viewport.height));
      const path = selectionToPath(this.selection, viewport.width, viewport.height);
      for (const node of svg.querySelectorAll("path")) {
        node.setAttribute("d", path);
      }
    }
    /** Binds copy, paste and deselect. */
    attachClipboard() {
      const onKey = (event) => {
        if (isTypingTarget(event.target)) {
          return;
        }
        if (event.key === "Escape" && this.selection) {
          event.preventDefault();
          this.stageTools?.clearPath();
          this.setSelection(null);
          return;
        }
        if (event.key === "Enter") {
          if (this.activeTool === "path") {
            event.preventDefault();
            if (this.stageTools?.commitPath()) {
              this.setSelection(null);
            }
            return;
          }
          if (this.selectionShape === "polygon") {
            event.preventDefault();
            this.stageTools?.clearPath();
            return;
          }
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          this.setSelection({
            shape: "rect",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 }
            ]
          });
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
          event.preventDefault();
          this.stageTools?.clearPath();
          this.setSelection(null);
          return;
        }
        if (!(event.metaKey || event.ctrlKey)) {
          return;
        }
        const key = event.key.toLowerCase();
        if (key === "c") {
          event.preventDefault();
          this.copySelection();
        } else if (key === "v") {
          event.preventDefault();
          this.pasteClipboard();
        }
      };
      document.addEventListener("keydown", onKey);
      this.detachKeys.push(() => document.removeEventListener("keydown", onKey));
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
    attachPasteboard() {
      const onWheel = (event) => {
        const renderer = this.renderer;
        if (!renderer) {
          return;
        }
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const bounds = this.stage.getBoundingClientRect();
          renderer.zoomAt(
            Math.exp(-event.deltaY * 2e-3),
            event.clientX - bounds.left,
            event.clientY - bounds.top
          );
          return;
        }
        renderer.pan(-event.deltaX, -event.deltaY);
      };
      this.stage.addEventListener("wheel", onWheel, { passive: false });
      this.detachKeys.push(() => this.stage.removeEventListener("wheel", onWheel));
      const onKey = (event) => {
        if (isTypingTarget(event.target)) {
          return;
        }
        if (event.key === "0") {
          this.renderer?.resetView();
        }
      };
      document.addEventListener("keydown", onKey);
      this.detachKeys.push(() => document.removeEventListener("keydown", onKey));
    }
    /** Positions the canvas backdrop over wherever the canvas currently is. */
    syncBackdrop() {
      const viewport = this.renderer?.getViewport();
      if (!viewport) {
        this.backdrop.hidden = true;
        return;
      }
      this.backdrop.hidden = false;
      this.backdrop.style.insetInlineStart = `${viewport.x}px`;
      this.backdrop.style.insetBlockStart = `${viewport.y}px`;
      this.backdrop.style.inlineSize = `${viewport.width}px`;
      this.backdrop.style.blockSize = `${viewport.height}px`;
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
    notifyRecipe() {
      const recipe = this.history.current;
      for (const listener of this.recipeListeners) {
        listener(recipe);
      }
    }
    /**
     * The native pixel size of whatever backs the active layer.
     *
     * The transform handles measure this, so a pasted fragment gets a box its own
     * size rather than the whole photograph's -- which is what made a paste look
     * like it had been scaled up.
     */
    activeLayerSize() {
      const id = this.history.current.activeLayerId;
      const size = this.renderer?.layerTextureSize(id);
      if (size && size.width > 0) {
        return size;
      }
      return this.renderer?.imageSize ?? { width: 0, height: 0 };
    }
    /**
     * Hands the stage to a tool.
     *
     * @param tool Tool to activate.
     */
    setActiveTool(tool) {
      if (this.activeTool === tool) {
        return;
      }
      if (this.activeTool === "text") {
        this.textEditor?.commit();
      }
      this.activeTool = tool;
      this.toolRail?.sync(tool);
      this.optionsBar?.render();
      this.stage.dataset.tool = tool;
      for (const listener of this.toolListeners) {
        listener(tool);
      }
    }
    /**
     * Shows or hides the selection as a red overlay.
     *
     * @param on Whether to show it.
     */
    setQuickMask(on) {
      this.quickMask = on;
      this.stage.classList.toggle("is-quick-mask", on);
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
    setFullScreen(on) {
      this.fullScreen = on;
      this.root.classList.toggle("is-full-screen", on);
      if (on && this.root.requestFullscreen) {
        void this.root.requestFullscreen().catch(() => {
        });
      } else if (!on && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {
        });
      }
      this.renderer?.fit();
    }
    /**
     * Changes the shared brush settings.
     *
     * @param patch Fields to change.
     */
    setBrush(patch) {
      this.brush = { ...this.brush, ...patch };
      for (const listener of this.brushListeners) {
        listener(this.brush);
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
    applyLayers(layers, activeId, undoable = true) {
      const next = setLayers(this.history.current, layers, activeId);
      if (undoable) {
        this.history.push(next, "layers");
      } else {
        this.history.replace(next);
      }
      this.renderer?.setDocument(next.canvas, next.layers, next.activeLayerId);
      this.notifyRecipe();
      this.syncToolbar();
    }
    /** Adds an empty raster layer above the active one. */
    addLayer() {
      const recipe = this.history.current;
      const layer = createRasterLayer(
        sprintf(__("Layer %d"), recipe.layers.length)
      );
      const index = recipe.layers.findIndex(
        (entry) => entry.id === recipe.activeLayerId
      );
      const layers = [...recipe.layers];
      layers.splice(index + 1, 0, layer);
      this.renderer?.ensurePaintTexture(layer.id);
      this.applyLayers(layers, layer.id);
    }
    /**
     * Copies the selected region of the composed document.
     *
     * Reads the *composite*, not the active layer: what you see is what you get,
     * which is the only interpretation that does not need explaining.
     */
    copySelection() {
      const recipe = this.history.current;
      const rect = this.selection;
      if (!rect || !this.renderer) {
        toast(__("Select an area first."), "info");
        return;
      }
      const bounds = selectionBounds(rect);
      const copied = this.renderer.extractRegion(
        bounds.x * recipe.canvas.width,
        bounds.y * recipe.canvas.height,
        bounds.w * recipe.canvas.width,
        bounds.h * recipe.canvas.height
      );
      if (!copied) {
        toast(__("Nothing to copy."), "error");
        return;
      }
      this.clipboard = copied;
      toast(__("Copied."), "success");
    }
    /**
     * Pastes the clipboard as a new layer.
     *
     * A new layer rather than pixels stamped into the current one, so the paste can
     * still be moved, scaled and removed afterwards.
     */
    pasteClipboard() {
      const source = this.clipboard;
      const recipe = this.history.current;
      if (!source || !this.renderer) {
        toast(__("Nothing to paste."), "info");
        return;
      }
      const bounds = this.selection ? selectionBounds(this.selection) : null;
      const layer = createRasterLayer(__("Pasted"), {
        x: bounds ? bounds.x + bounds.w / 2 : 0.5,
        y: bounds ? bounds.y + bounds.h / 2 : 0.5
      });
      this.renderer.addRasterTexture(layer.id, source);
      this.applyLayers([...recipe.layers, layer], layer.id);
      this.setActiveTool("transform");
      toast(__("Pasted as a new layer."), "success");
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
    applyLayer(layer, label = "transform") {
      const next = setLayer(this.history.current, layer);
      this.history.push(next, label);
      this.renderer?.setDocument(next.canvas, next.layers, next.activeLayerId);
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
    applyDocument(canvas, layer, label = "canvas") {
      const next = setDocument(this.history.current, canvas, layer);
      this.history.push(next, label);
      this.renderer?.setDocument(next.canvas, next.layers, next.activeLayerId);
      this.notifyRecipe();
      this.syncToolbar();
    }
    /**
     * Applies a curve change and re-renders.
     *
     * @param channel Curve channel.
     * @param points  Control points, or undefined to clear.
     */
    applyCurve(channel, points) {
      const next = setCurve(this.history.current, channel, points);
      this.history.push(next, `curve-${channel}`);
      this.renderer?.setTone(next.curves, next.levels);
      this.notifyRecipe();
      this.syncToolbar();
    }
    /**
     * Applies a levels change and re-renders.
     *
     * @param levels New levels.
     */
    applyLevels(levels) {
      const next = setLevels(this.history.current, levels);
      this.history.push(next, "levels");
      this.renderer?.setTone(next.curves, next.levels);
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
    applyPreset(preset) {
      const current = this.history.current;
      this.history.push(
        {
          ...current,
          ops: preset.recipe.ops ?? [],
          curves: preset.recipe.curves ?? {},
          levels: preset.recipe.levels ?? current.levels
        },
        "preset"
      );
      this.syncFromRecipe();
      toast(__("Preset applied."), "success");
    }
    /**
     * Pushes the current recipe out to the panels, the renderer and the toolbar.
     *
     * Called for changes the panels did not originate -- undo, redo, reset, and
     * `setRecipe()` -- so their controls follow the model rather than assuming they
     * are the only thing that can change it.
     */
    syncFromRecipe() {
      if (!this.payload) {
        return;
      }
      const recipe = this.history.current;
      this.notifyRecipe();
      this.renderer?.setOps(recipe.ops);
      this.renderer?.setDocument(recipe.canvas, recipe.layers, recipe.activeLayerId);
      this.renderer?.setTone(recipe.curves, recipe.levels);
      this.syncToolbar();
    }
    /** Enables or disables the toolbar buttons to match the state. */
    syncToolbar() {
      const identity = isIdentity(this.history.current, this.renderer?.imageSize);
      this.undoButton?.setDisabled(!this.history.canUndo);
      this.redoButton?.setDisabled(!this.history.canRedo);
      this.resetButton?.setDisabled(identity);
      const ready = !this.busy && this.renderer !== null && !identity;
      this.saveButton?.setDisabled(!ready || !this.payload?.canSave);
      this.exportButton?.setDisabled(!ready);
    }
    /**
     * Renders the edit at full resolution.
     *
     * @return The encoded image, or null when rendering failed.
     */
    async renderOutput() {
      if (!this.renderer) {
        return null;
      }
      const { format, quality } = this.history.current.output;
      this.busy = true;
      this.syncToolbar();
      try {
        return await this.renderer.renderFull(format, quality);
      } catch (error) {
        toast(
          error instanceof Error ? error.message : __("The image could not be rendered."),
          "error"
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
    async save() {
      if (this.busy || !this.payload) {
        return;
      }
      const blob = await this.renderOutput();
      if (!blob || this.destroyed) {
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
        const downscaled = rendered !== void 0 && result.width > 0 && result.width < rendered.width;
        toast(
          downscaled ? sprintf(
            /* translators: 1: stored width, 2: stored height. */
            __("Saved as a copy. This site stores images at up to %1$d × %2$d."),
            result.width,
            result.height
          ) : sprintf(
            /* translators: 1: stored width, 2: stored height. */
            __("Saved as a copy — %1$d × %2$d."),
            result.width,
            result.height
          ),
          "success"
        );
        this.announceSave(result);
        this.options.onSave?.(result);
      } catch (error) {
        toast(
          error instanceof Error ? error.message : __("The image could not be saved."),
          "error"
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
    announceSave(result) {
      const existing = this.root.querySelector(".dg-saved");
      existing?.remove();
      const banner = document.createElement("p");
      banner.className = "dg-saved";
      const open = createButton({
        label: __("Open the saved copy"),
        variant: "secondary",
        onClick: () => openInDesktop(result.id)
      });
      this.buttons.push(open);
      banner.append(document.createTextNode(__("Saved a copy. ")), open.el);
      this.sidebar.prepend(banner);
    }
    /**
     * Downloads the rendered image to the user's device.
     *
     * Requires no capability beyond opening the editor: it never touches the media
     * library, so a user who may view and adjust an image may also take a copy away.
     */
    async exportToDevice() {
      const blob = await this.renderOutput();
      if (!blob || this.destroyed) {
        return;
      }
      const extension = this.history.current.output.format.split("/")[1] ?? "jpg";
      const base = (this.payload?.title || "image").replace(/[^\w-]+/g, "-");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${base}-edited.${"jpeg" === extension ? "jpg" : extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 6e4);
      toast(__("Downloaded."), "success");
    }
    /**
     * Steps back one edit.
     *
     * A stroke's pixels are restored *before* the recipe moves, because the patch
     * describes the layer as it stood in the entry being left behind.
     */
    undo() {
      if (!this.history.canUndo) {
        return;
      }
      this.applyPixelPatch();
      this.history.undo();
      this.syncFromRecipe();
    }
    /** Steps forward one edit. */
    redo() {
      if (!this.history.canRedo) {
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
    applyPixelPatch() {
      const patch = this.history.meta;
      const renderer = this.renderer;
      if (!patch || !renderer || !patch.complete) {
        return;
      }
      const swapped = [];
      for (const tile of patch.tiles) {
        swapped.push({
          rect: tile.rect,
          pixels: renderer.extractLayerRegion(patch.layerId, tile.rect)
        });
        renderer.restoreLayerRegion(patch.layerId, tile.rect, tile.pixels);
      }
      this.history.setMeta({ ...patch, tiles: swapped });
    }
    /** Returns every adjustment to zero. */
    resetAll() {
      const source = this.renderer?.imageSize;
      if (isIdentity(this.history.current, source)) {
        return;
      }
      this.history.push(resetOps(this.history.current, source), "reset");
      this.syncFromRecipe();
      toast(__("Adjustments reset."), "info");
    }
    /** Binds undo and redo to the usual chords. */
    attachShortcuts() {
      const onKeyDown = (event) => {
        if (!(event.metaKey || event.ctrlKey) || isTypingTarget(event.target)) {
          return;
        }
        const key = event.key.toLowerCase();
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          this.undo();
        } else if (key === "z" && event.shiftKey || key === "y") {
          event.preventDefault();
          this.redo();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      this.detachKeys.push(
        () => document.removeEventListener("keydown", onKeyDown)
      );
    }
    /** Releases everything this editor owns. */
    destroy() {
      if (this.destroyed) {
        return;
      }
      this.destroyed = true;
      for (const detach of this.detachKeys) {
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
      this.textEditor?.destroy();
      this.rulers = null;
      this.brushListeners.clear();
      this.panelHost?.destroy();
      this.panelHost = null;
      this.recipeListeners.clear();
      this.toolListeners.clear();
      for (const button of this.buttons) {
        button.destroy();
      }
      this.buttons = [];
      this.renderer?.destroy();
      this.renderer = null;
      this.loaded?.release();
      this.loaded = null;
      this.root.replaceChildren();
      this.root.classList.remove("dg-editor");
    }
  }
  const VIEW_KEY = "daguerre.view.v1";
  function readViewPrefs() {
    try {
      const raw = window.localStorage.getItem(VIEW_KEY);
      if (!raw) {
        return { rulers: true, snapping: true };
      }
      const stored = JSON.parse(raw);
      return {
        rulers: stored.rulers !== false,
        snapping: stored.snapping !== false
      };
    } catch {
      return { rulers: true, snapping: true };
    }
  }
  function writeViewPrefs(prefs) {
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify(prefs));
    } catch {
    }
  }
  const SIDEBAR_KEY = "daguerre.sidebar.v1";
  function readSidebarOpen() {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) !== "closed";
    } catch {
      return true;
    }
  }
  function writeSidebarOpen(open) {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed");
    } catch {
    }
  }
  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  }
  function bootBlockEditor() {
    const element = window.wp?.element;
    const hooks = window.wp?.hooks;
    const blockEditor = window.wp?.blockEditor;
    const components = window.wp?.components;
    if (!element?.createElement || !hooks?.addFilter || !blockEditor?.BlockControls || !components?.ToolbarGroup || !components?.ToolbarButton) {
      return;
    }
    const { createElement, Fragment } = element;
    const { BlockControls } = blockEditor;
    const { ToolbarGroup, ToolbarButton } = components;
    hooks.addFilter(
      "editor.BlockEdit",
      "daguerre/image-toolbar",
      (BlockEdit) => function DaguerreImageToolbar(props) {
        const original = createElement(BlockEdit, props);
        if (props.name !== "core/image" || !props.isSelected) {
          return original;
        }
        const id = Number(props.attributes?.id ?? 0);
        if (!id) {
          return original;
        }
        const button = createElement(
          BlockControls,
          { group: "other" },
          createElement(
            ToolbarGroup,
            null,
            createElement(
              ToolbarButton,
              {
                label: __("Edit with Daguerre"),
                onClick: () => openInDesktop(id)
              },
              __("Daguerre")
            )
          )
        );
        return createElement(Fragment, null, original, button);
      },
      20
    );
  }
  const patched = /* @__PURE__ */ new WeakSet();
  function bootMediaModal() {
    const details = window.wp?.media?.view?.Attachment?.Details;
    if (!details) {
      return;
    }
    patchView(details.TwoColumn);
    patchView(details);
  }
  function patchView(view) {
    if (!view?.prototype?.render || patched.has(view)) {
      return;
    }
    patched.add(view);
    const originalRender = view.prototype.render;
    view.prototype.render = function(...args) {
      const result = originalRender.apply(this, args);
      try {
        addButton(this);
      } catch {
      }
      return result;
    };
  }
  function addButton(view) {
    const el = view.el ?? null;
    const model = view.model;
    if (!el || !model) {
      return;
    }
    const id = Number(model.get("id"));
    const mime = String(model.get("mime") ?? "");
    const config = window.daguerreConfig;
    if (!id || !config || !config.supportedMimes.includes(mime)) {
      return;
    }
    const can = model.get("can");
    if (can && can.save === false) {
      return;
    }
    if (el.querySelector(".dg-modal-button")) {
      return;
    }
    const host = el.querySelector(".attachment-actions") ?? el.querySelector(".attachment-info") ?? el;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button dg-modal-button";
    button.textContent = __("Edit with Daguerre");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openInDesktop(id);
    });
    host.appendChild(button);
  }
  const ATTRIBUTE = "data-daguerre-open";
  function bootOpenButtons() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const control = target.closest(`[${ATTRIBUTE}]`);
      if (!(control instanceof HTMLElement)) {
        return;
      }
      const attachmentId = Number(control.getAttribute(ATTRIBUTE)) || 0;
      if (!attachmentId) {
        return;
      }
      event.preventDefault();
      openInDesktop(attachmentId);
    });
  }
  const version = window.daguerreConfig?.version ?? "0.0.0";
  function boot() {
    bootDesktopMode();
    bootOpenButtons();
    bootMediaModal();
    bootBlockEditor();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  exports.listPanels = listPanels;
  exports.mount = mount;
  exports.openInDesktop = openInDesktop;
  exports.registerPanel = registerPanel;
  exports.unregisterPanel = unregisterPanel;
  exports.version = version;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({});
