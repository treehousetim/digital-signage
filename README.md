# Digital Signage Menu — Renderer & Editor

A standalone HTML/CSS/JS design system for full-screen menu displays. Pixel-perfect output for TVs, monitors, and digital boards from a clean, declarative JSON definition.

No frameworks. No build step. No npm. Vanilla JavaScript. Embed it anywhere.

## What's in the box

| File | Purpose |
|---|---|
| `index.html` | Demo page that renders a menu (with optional dev toolbar) |
| `editor.html` | Standalone GUI editor for authoring menus |
| `renderer.js` | Core rendering engine (embeddable) |
| `editor.js` | GUI editor component (embeddable) |
| `theme.css` | Renderer CSS |
| `editor.css` | Editor CSS (namespaced `.me-`) |
| `schema.json` | JSON schema definition |
| `examples/` | Sample menu definitions |
| `themes/` | Built-in theme JSON files (dark, light, warm, cool, mono) |

## Quick start

```bash
php -S localhost:8080
# or: npx serve .
# or: python3 -m http.server 8080
```

- `http://localhost:8080` — renders the default menu
- `http://localhost:8080/editor.html` — open the GUI editor
- `http://localhost:8080?menu=examples/themed.json` — render a specific menu
- `http://localhost:8080?preview` — render with the dev toolbar

## The minimal menu

Most fields are optional. The smallest valid menu:

```json
{
  "areas": [
    {
      "title": "Menu",
      "items": [
        { "name": "Coffee", "price": "3" },
        { "name": "Tea", "price": "2.50" }
      ]
    }
  ]
}
```

That's it. The renderer fills in everything else from defaults.

## Core concepts

The design system has six top-level concepts. All are optional except `areas`.

```json
{
  "uses":   "themes/warm.json",  // import external theme JSON file(s)
  "vars":   { ... },        // design vars (palette, spacing, type_scale)
  "theme":  {               // visual contract — layout, colors, fonts, ...
    "layout": { ... },      //   canvas + arrangement (resolution, container, etc.)
    "colors": { ... },
    "fonts":  { ... },
    "areas":  { ... },      //   defaults for all areas
    "items":  { ... },      //   defaults for all items
    "header": { ... }       //   visual properties of the header region
  },
  "header": { ... },        // header content (the actual elements)
  "areas":  [ ... ]         // the menu content
}
```

### 1. Design vars

Vars are named design values you can reference anywhere with `$name`.

| Type | Built-in names | Use |
|---|---|---|
| **Palette** (colors) | `background`, `surface`, `text`, `muted`, `accent`, `divider` | `"color": "$accent"` |
| **Spacing** | `none` (0%), `xs` (.25%), `sm` (.5%), `md` (1%), `lg` (2%), `xl` (3%), `xxl` (5%) | `"padding": "$md"` |
| **Type scale** (em) | `xs` (.75), `sm` (1), `base` (1.375), `md` (1.75), `lg` (2.5), `xl` (3.5), `hero` (5) | `"size": "$lg"` |

Spacing values use these units:
- `"5%"` — percent of viewport (width for horizontal, height for vertical)
- `"12"` / `"12px"` / `12` — pixels
- `"$name"` — var reference

Override or add vars at the top level:

```json
{
  "vars": {
    "palette": { "accent": "#ff8c42" },
    "spacing": { "tight": "0.5%", "loose": "4%" },
    "type_scale": { "menu": 2 }
  }
}
```

### 2. External theme imports (`uses`)

The `uses` field imports one or more JSON files as defaults. Reference a string for one file, or an array for multiple (layered in order, later wins). Your inline values always override imports.

```json
{ "uses": "themes/warm.json" }
```

Or stack multiple:

```json
{
  "uses": [
    "themes/warm.json",
    "themes/seasonal-summer.json"
  ]
}
```

**Built-in themes** ship in the `themes/` directory: `dark.json`, `light.json`, `warm.json`, `cool.json`, `mono.json`. Each is a small JSON file containing a `vars.palette` (the 6 semantic color slots) and a `theme.fonts` block with font family overrides. You can fork them, publish your own, or chain them.

Themes can themselves use other themes — `uses` is recursive. Cycles are detected and rejected.

### 3. Theme

The theme is a *semantic visual contract* — semantic groups of properties that elements inherit from. You rarely need to override more than a couple of fields.

```js
theme: {
  layout: {
    resolution,        // "1080" | "2k" | "4k"
    orientation,       // "landscape" | "portrait"
    viewport_padding,  // padding around content
    columns,           // 1–6 top-level columns
    column_gutter,     // horizontal gap between columns
    row_gutter         // vertical gap between stacked areas
  },
  colors: { background, surface, text, muted, accent, divider },
  fonts: {
    header:      { ... },   // header text elements
    area_title:  { ... },   // area titles
    item_name:   { ... },   // item names
    price:       { ... },   // prices
    description: { ... },   // descriptions, variations
    // ...add any custom role name and reference it from any `font` field
  },
  dividers: {
    default:   { color, width, style, sides, padding },  // base — all types inherit
    header:    { ... },   // overrides for the header bottom line
    area:      { ... },   // overrides for area borders
    item:      { ... },   // overrides for item separators
    variation: { ... }    // overrides for variation separators
  },
  areas: {
    padding, background, border,
    title_font, column_count, gutter, item_align, price_align
  },
  items: {
    padding, name_font, price_font, description_font, variation_font, align,
    price_line: { style, color, thickness, segment_size, gap_size, padding_left, padding_right }
  },
  pricing: { symbol, symbol_position, symbol_space, format },
  header:  { height, padding, background, columns }
}
```

### Currency

```json
"pricing": {
  "symbol": "€",
  "symbol_position": "after",   // "before" or "after"
  "symbol_space": true,          // adds a space between number and symbol
  "format": "full"               // "full" (12.50) or "fewest" (12.5)
}
```

### Item price line (leader)

Draw a leader between item name and price (vertically centered):

```json
"items": {
  "price_line": {
    "style": "dots",          // "none" | "dots" | "dashes" | "solid"
    "color": "$muted",
    "thickness": 2,            // px
    "segment_size": 3,         // dot diameter or dash length (px)
    "gap_size": 6,             // space between dots/dashes (px)
    "padding_left": "$xs",
    "padding_right": "$xs"
  }
}
```

### Dividers

`theme.dividers` controls separator lines on header, areas, items, and variations. Each type inherits from `default` and can override any field.

```json
"dividers": {
  "default":   { "color": "$divider", "width": 1, "style": "solid" },
  "header":    { "sides": ["bottom"] },
  "area":      { "sides": [] },
  "item":      { "sides": ["bottom"] },
  "variation": { "sides": [] }
}
```

Each config object accepts:

| Field | Description |
|---|---|
| `color` | CSS color or `$palette` reference |
| `width` | Line thickness in px |
| `style` | `"solid"` \| `"dashed"` \| `"dotted"` |
| `sides` | Array of sides to draw: `["top"]`, `["left","right"]`, `["bottom"]`, etc. |
| `padding` | Spacing pushed between the content and each active side — accepts the same units as spacing fields (`8px`, `2%`, `$xs`) |

`padding` only applies on active sides. A left-border area divider with `padding: "$sm"` adds left padding only; the other three sides are untouched.

```json
"dividers": {
  "default": { "color": "$accent", "width": 3 },
  "area":    { "sides": ["left"], "padding": "$sm" },
  "item":    { "color": "$divider", "width": 1, "sides": ["bottom"] }
}
```

Set `width: 0` to hide a specific type's divider entirely.

### Identity / directory signs

Areas support `icon`, `subtitle`, and `valign` for full-bleed identity signs without items:

```json
{
  "uses": "themes/dark.json",
  "theme": { "layout": { "orientation": "portrait", "columns": 1 } },
  "header": {
    "elements": [{ "type": "text", "text": "Floor 12", "font": "description" }]
  },
  "areas": [{
    "background": "linear-gradient(135deg, #8B5CF6 0%, #2563EB 100%)",
    "icon": "icons/tooth.svg",
    "icon_height": "25%",
    "title": "Dr. Kayla Smith",
    "subtitle": "Dental Services",
    "align": "center",
    "valign": "center"
  }]
}
```

| Field | Description |
|---|---|
| `icon` | URL to an image or SVG rendered above the title |
| `icon_height` | Max height of the icon — any spacing unit (`25%`, `200px`, `10em`). Default `25%` of viewport height |
| `subtitle` | Secondary text below the title, styled with the `description` font role |
| `background` | CSS color **or** `linear-gradient(...)` string — overrides `theme.areas.background` |
| `valign` | `"top"` \| `"center"` \| `"bottom"` — vertically positions content within the area |

The gradient editor in the editor panel lets you visually build gradients with color stops and a direction preset.

The renderer's areas grid fills the full viewport height and distributes that space evenly across rows (`align-content: stretch`). Each area's content is then positioned within its cell using `valign`. This means identity/directory signs with `valign: center` will always fill the display regardless of how many panels there are.

### 4. Font roles

Elements reference fonts by role name, not by full font definition:

```json
{
  "type": "text",
  "text": "Hello",
  "font": "header"
}
```

This pulls from `theme.fonts.header`. Custom roles can be added by defining any new key in `theme.fonts` — the editor's font dropdowns build dynamically from whatever roles exist. Override one field with `extends`:

```json
{ "font": { "extends": "header", "color": "$accent" } }
```

Or provide a full inline font object — the same shape as a theme font role.

### 5. Inheritance cascade

Properties cascade in this order, deepest wins:

```
default → uses (imported themes) → theme → area defaults → item override
```

So you can:
- Set `theme.areas.column_count: 2` to make every area 2-column by default
- Override one area with `column_count: 3`
- Set `theme.items.name_font: "price"` to make all item names use the price (bold) font
- Override one item with `style: { name_font: "item_name" }`

### 6. Auto-generated IDs

Areas, items, variations, and header elements all get auto-generated IDs from their `title`/`name`/`text`. You can still set IDs explicitly to address them externally — every rendered element gets a `data-ds-id` attribute.

## Required fields

Only these:

| Entity | Required |
|---|---|
| Top-level | `areas` |
| Area | (nothing — must have `items` or nested `areas` to be useful) |
| Item | `name` |
| Variation | `name` |
| Header element | `type` |

Everything else is optional and inherits from defaults or theme.

## Renderer API

Include `renderer.js` and `theme.css`.

### `MenuRenderer.render(data, target)`
Renders into the target DOM element.

### `MenuRenderer.loadFromUrl(url, target)`
Fetches JSON, then renders. Returns a Promise.

### `MenuRenderer.watch(url, target, intervalSeconds)`
Auto-refreshes on an interval. Returns `{ stop() }`. This is how live displays stay up to date.

### `MenuRenderer.validate(data)`
Returns `{ valid, errors[], warnings[] }` with JSON paths. Used internally by `render` — last result on `MenuRenderer.lastValidation`.

### `MenuRenderer.import(url)`
Fetches a single JSON file. Returns `Promise<data>`. Use this to load a theme programmatically.

### `MenuRenderer.resolve(data, baseUrl)`
Recursively resolves all `uses` references in `data`, deep-merging imported files in order under your data. Returns `Promise<resolvedData>` with `uses` removed. `baseUrl` is used to resolve relative paths.

```js
MenuRenderer.import('themes/warm.json').then(function (theme) {
  var data = Object.assign({}, theme, { areas: myMenu });
  MenuRenderer.render(data, target);
});
```

Or chain:
```js
MenuRenderer.resolve({
  uses: 'themes/dark.json',
  areas: myMenu
}, window.location.href).then(function (resolved) {
  MenuRenderer.render(resolved, target);
});
```

`MenuRenderer.loadFromUrl()` already calls `resolve()` internally — use it for the simple "load + render" case.

## Editor API

Include `editor.js` and `editor.css` (plus renderer files for live preview).

### `MenuEditor.create(targetElement, options)`

```js
var editor = MenuEditor.create(document.getElementById('editor'), {
  data: existingMenu,             // optional initial data
  onChange: function (data) {},   // called on every change
  rendererAvailable: true,        // auto-detected
  persist: true,                  // localStorage auto-save
  storageKey: 'menu-editor:last'  // custom storage key
});

editor.getData();
editor.setData(newData);
editor.destroy();
```

### Editor features

- **Three-panel layout** with **resizable panes** (drag the 4px stripe between panels; widths persisted in localStorage)
- **Tree**: expand/collapse, click to select, action buttons (add, duplicate, delete) appear on row hover, drag-and-drop reordering
- **Inspector**: schema-driven form fields; collapsible groups (state persisted); Dividers consolidated into one tabbed section (Default / Header / Area / Item / Variation); ID fields are read-only
- **Dynamic font roles**: add custom roles in `theme.fonts` and they appear in every font dropdown automatically
- **Style overrides** with "Inherited — click to override" cover; ✕ button on the group header reverts to inherited
- **Live preview** in iframe, zoomable (25%–150%); correctly fits both landscape (16:9) and portrait (9:16) menus; minimap viewport indicator shown at zoom > fit
- **JSON tab**: editable, syntax-highlighted, tree-synced (clicking a tree node scrolls to & highlights its line)
- **Click-to-select in preview**: click any area, item, or header element to select and inspect it
- **Drag handles** for resizing padding (Element mode) or layout (Layout mode)
- **Toolbar**: New, Import, Export, Export PNG, Undo/Redo (Ctrl+Z), Grid overlay, Examples dropdown, Resize mode toggle
- **localStorage auto-save**: editor state, panel widths, group collapse state, and selected node all persist
- **Cmd+A** in JSON view selects only the JSON content
- **Arrow keys** navigate the tree
- **↑ / ↓** in any spacing field nudges the numeric value by 1, preserving the unit suffix (`8px` → `9px`, `1.5em` → `2.5em`). Hold **Shift** for ×10 steps, **Alt/Option** for ×0.1 steps. No-op on `$var` references.

## Resolution & units

Content is resolution-independent. Spatial values can be percentages of the viewport (`"5%"`), pixels (`12`, `"12"`, `"12px"`), any CSS unit (`"1.5em"`, `"0.5rem"`, `"10pt"`), or var references (`"$md"`). Font sizes are em multipliers of a resolution-scaled base font size.

| Resolution | Canvas | Base font |
|---|---|---|
| `1080` | 1920 × 1080 | 16px |
| `2k` | 2560 × 1440 | 21px |
| `4k` | 3840 × 2160 | 32px |

Portrait orientation swaps width and height. Display mode renders at native size; preview mode scales to fit the browser window.

## Embedding

### Embed the renderer

```html
<link rel="stylesheet" href="theme.css">
<script src="renderer.js"></script>
<div id="display"></div>
<script>
  MenuRenderer.loadFromUrl('/api/menu.json', document.getElementById('display'));
</script>
```

### Embed the editor

```html
<link rel="stylesheet" href="theme.css">
<link rel="stylesheet" href="editor.css">
<script src="renderer.js"></script>
<script src="editor.js"></script>
<div id="editor"></div>
<script>
  MenuEditor.create(document.getElementById('editor'), {
    onChange: function (data) {
      fetch('/api/menu', { method: 'POST', body: JSON.stringify(data) });
    }
  });
</script>
```

## Headless PNG generation pipeline

The renderer is plain HTML/CSS/JS, so any headless browser can produce a pixel-perfect PNG. Recommended pipeline:

### 1. Minimal render page

Create a tiny page that the headless browser will load. It should accept the menu JSON via query string, file, or stdin and render at native resolution (no preview scaling — `theme.layout.mode: "display"` is the default).

```html
<!-- render.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="theme.css">
  <style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>
</head>
<body>
  <div id="display"></div>
  <script src="renderer.js"></script>
  <script>
    var url = new URLSearchParams(location.search).get('menu');
    MenuRenderer.loadFromUrl(url, document.getElementById('display'))
      .then(function () { window.__rendered = true; });
  </script>
</body>
</html>
```

### 2. Screenshot with Puppeteer (Node)

```js
const puppeteer = require('puppeteer');

async function renderToPng(menuUrl, outPath) {
  // Read the menu's resolution to size the viewport. The renderer uses
  // the canvas dimensions defined by theme.layout.resolution + orientation.
  const RES = { '1080': [1920,1080], '2k': [2560,1440], '4k': [3840,2160] };
  const menu = await (await fetch(menuUrl)).json();
  const layout = (menu.theme && menu.theme.layout) || {};
  const [w, h] = RES[layout.resolution || '4k'];
  const portrait = layout.orientation === 'portrait';
  const vw = portrait ? h : w;
  const vh = portrait ? w : h;

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:8080/render.html?menu=${encodeURIComponent(menuUrl)}`);

  // Wait for the renderer to finish (Google fonts, uses imports, etc.)
  await page.waitForFunction('window.__rendered === true', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);

  // Capture only the canvas viewport
  const el = await page.$('.ds-viewport');
  await el.screenshot({ path: outPath, omitBackground: false });
  await browser.close();
}
```

### 3. Or use the in-browser PNG export

If you're already running in a browser context, you can render directly to a `<canvas>` via `html2canvas` or similar — the editor uses this approach for its "Export PNG" button. See `editor.js` (search for `pngBtn`) for the pattern.

### Key points

- **Set `theme.layout.mode` to `"display"`** (the default) so the renderer uses native pixel dimensions. `"preview"` mode auto-scales to fit the window.
- **Wait for fonts** — Google Fonts are injected at render time. `document.fonts.ready` resolves once they've loaded.
- **Wait for `uses` resolution** — `loadFromUrl()` and `resolve()` are async. The `__rendered` flag pattern above handles this.
- **Match viewport to canvas** — set the headless browser's viewport to the menu's resolution × orientation so nothing gets cropped or scaled.
- **No network for fully-offline pipelines** — pre-bundle Google Fonts as local CSS, or strip `family` from theme fonts to use system fonts.

### Auto-refresh display

For live signage, use watch mode to poll for updates:

```js
MenuRenderer.watch('/api/menu.json', target, 30); // every 30 seconds
```

## Examples

| File | Description | Demonstrates |
|---|---|---|
| `minimal.json` | Smallest possible menu | Defaults handle everything |
| `coffee.json` | Coffee shop with hot/cold drinks | Theme import, item variations |
| `cafe.json` | Breakfast cafe with multi-column layout | Container columns, palette override |
| `bakery.json` | Portrait bakery menu | Light theme + custom palette overrides |
| `indian.json` | Indian restaurant | Rupee currency, accent left-border area dividers with padding, variation dividers |
| `pub.json` | English pub | Pound currency, dark wood palette, blackletter header |
| `surf-shop.json` | Lessons + retail | Cool theme, custom $sun var |
| `server-status.json` | Infrastructure dashboard (non-menu) | Mono theme, semantic vars, area styling |
| `themed.json` | Wine bar | Custom vars, font extension, full reference system |
| `directory.json` | Building directory / identity signs | Portrait, gradient backgrounds, icon, subtitle, valign |
| `identity.json` | Single identity panel (minimal) | Simplest possible identity sign — title + subtitle + gradient, no items |

## Schema

The full JSON schema is in [`schema.json`](schema.json).

## License

MIT
