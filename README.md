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
  "preset": "warm",         // built-in theme preset
  "tokens": { ... },        // design tokens (palette, spacing, type_scale)
  "layout": { ... },        // canvas + content arrangement
  "theme":  { ... },        // visual contract (colors, fonts, dividers, etc.)
  "header": { ... },        // header content (visuals live in theme.header)
  "areas":  [ ... ]         // the menu content
}
```

### 1. Design tokens

Tokens are named values you can reference anywhere with `$name`.

| Type | Built-in tokens | Use |
|---|---|---|
| **Palette** (colors) | `background`, `surface`, `text`, `muted`, `accent`, `divider` | `"color": "$accent"` |
| **Spacing** (% of viewport) | `none`, `xs` (.25), `sm` (.5), `md` (1), `lg` (2), `xl` (3), `xxl` (5) | `"padding": "$md"` |
| **Type scale** (em) | `xs` (.75), `sm` (1), `base` (1.375), `md` (1.75), `lg` (2.5), `xl` (3.5), `hero` (5) | `"size": "$lg"` |

Override or add tokens at the top level:

```json
{
  "tokens": {
    "palette": { "accent": "#ff8c42" },
    "spacing": { "tight": 0.5, "loose": 4 },
    "type_scale": { "menu": 2 }
  }
}
```

### 2. Theme presets

A preset pre-fills the entire theme. Just pick one:

```json
{ "preset": "warm" }
```

Built-in presets: **dark** (default), **light**, **warm**, **cool**, **mono**. Each defines its own palette and font families. User overrides take precedence over presets.

### 3. Theme

The theme is a *semantic visual contract* — semantic groups of properties that elements inherit from. You rarely need to override more than a couple of fields.

```js
theme: {
  colors:  { background, surface, text, muted, accent, divider },
  fonts: {
    title:    { ... },   // header titles
    heading:  { ... },   // area titles
    body:     { ... },   // item names, default text
    emphasis: { ... },   // prices
    caption:  { ... }    // descriptions, variations
  },
  dividers: { color, width, style },
  areas: {
    padding, background, border,
    title_font, column_count, gutter, item_align, price_align
  },
  items: {
    padding, name_font, price_font, description_font, variation_font, align
  },
  pricing: { symbol, format },
  header:  { height, padding, background, divider, columns }
}
```

### 4. Font roles

Elements reference fonts by role name, not by full font definition:

```json
{
  "type": "text",
  "text": "Hello",
  "font": "title"
}
```

This pulls from `theme.fonts.title`. Override one field with `extends`:

```json
{ "font": { "extends": "title", "color": "$accent" } }
```

Or provide a full inline font object — the same shape as a theme font role.

### 5. Inheritance cascade

Properties cascade in this order, deepest wins:

```
default → preset → theme → area defaults → item override
```

So you can:
- Set `theme.areas.column_count: 2` to make every area 2-column by default
- Override one area with `column_count: 3`
- Set `theme.items.name_font: "emphasis"` to make all item names bold
- Override one item with `style: { name_font: "body" }`

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

### `MenuRenderer.presets`
Array of available preset names.

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

- **Three-panel layout**: structure tree, property inspector, live preview
- **Tree**: expand/collapse, click to select, hover buttons for add/delete/duplicate, drag-and-drop reordering
- **Inspector**: schema-driven form fields with grouped collapsible sections
- **Style overrides** with "Inherited — click to override" cover that auto-hides when no override is set
- **Live preview** in iframe, zoomable (25%–150%), with minimap viewport indicator
- **JSON tab**: editable, syntax-highlighted, tree-synced (clicking a tree node scrolls to & highlights its line)
- **Hover-to-highlight**: hovering a tree node highlights the corresponding element in the preview
- **Click-to-select in preview**: click any element in the preview to select it in the tree
- **Drag handles** for resizing padding (Element mode) or layout (Layout mode)
- **Toolbar**: New, Import, Export, Export PNG, Undo/Redo (Ctrl+Z), Grid overlay, Examples dropdown, Resize mode toggle
- **localStorage auto-save**: editor state survives page reloads
- **Cmd+A** in JSON view selects only the JSON content
- **Arrow keys** navigate the tree

## Resolution & units

Content is resolution-independent. Spatial values are percentages of the viewport (horizontal = % of width, vertical = % of height). Font sizes are em multipliers of a resolution-scaled base font size.

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
| `coffee.json` | Coffee shop with hot/cold drinks | Preset override, item variations |
| `cafe.json` | Breakfast cafe with multi-column layout | Container columns, palette override |
| `bakery.json` | Portrait bakery menu | Light preset, portrait orientation |
| `surf-shop.json` | Lessons + retail | Cool preset, inline variations |
| `server-status.json` | Infrastructure dashboard (non-menu) | Mono preset, semantic tokens, area styling |
| `themed.json` | Wine bar | Custom tokens, font extension, full token reference system |

## Schema

The full JSON schema is in [`schema.json`](schema.json).

## License

MIT
