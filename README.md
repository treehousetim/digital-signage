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
  dividers: { color, width, style },
  areas: {
    padding, background, border,
    title_font, column_count, gutter, item_align, price_align
  },
  items: {
    padding, name_font, price_font, description_font, variation_font, align,
    price_line: { style, color, thickness, segment_size, gap_size, padding_left, padding_right }
  },
  pricing: { symbol, symbol_position, symbol_space, format },
  header:  { height, padding, background, divider, columns }
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

- **Three-panel layout** with **resizable panes** (drag the dividers; widths persisted)
- **Tree**: expand/collapse, click to select, action buttons float above the row with delayed hide, drag-and-drop reordering
- **Inspector**: schema-driven form fields with grouped collapsible sections; group state and selected node persist in localStorage
- **Dynamic font roles**: add custom roles in `theme.fonts` and they appear in every font dropdown automatically
- **Style overrides** with "Inherited — click to override" cover; ✕ button on the group header reverts to inherited
- **Live preview** in iframe, zoomable (25%–150%), with minimap viewport indicator; auto re-fits as panels resize
- **JSON tab**: editable, syntax-highlighted, tree-synced (clicking a tree node scrolls to & highlights its line)
- **Click-to-select in preview**: click any area, item, or header element to select and inspect it
- **Drag handles** for resizing padding (Element mode) or layout (Layout mode)
- **Toolbar**: New, Import, Export, Export PNG, Undo/Redo (Ctrl+Z), Grid overlay, Examples dropdown, Resize mode toggle
- **localStorage auto-save**: editor state, panel widths, group collapse state, and selected node all persist
- **Cmd+A** in JSON view selects only the JSON content
- **Arrow keys** navigate the tree

## Resolution & units

Content is resolution-independent. Spatial values can be percentages of the viewport (`"5%"`), pixels (`12`, `"12"`, `"12px"`), or var references (`"$md"`). Font sizes are em multipliers of a resolution-scaled base font size.

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
| `indian.json` | Indian restaurant | Rupee currency, custom palette, fonts |
| `pub.json` | English pub | Pound currency, dark wood palette, blackletter header |
| `surf-shop.json` | Lessons + retail | Cool theme, custom $sun var |
| `server-status.json` | Infrastructure dashboard (non-menu) | Mono theme, semantic vars, area styling |
| `themed.json` | Wine bar | Custom vars, font extension, full reference system |

## Schema

The full JSON schema is in [`schema.json`](schema.json).

## License

MIT
