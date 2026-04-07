# Digital Signage Menu Renderer & Editor

A standalone HTML/CSS/JS system for creating and displaying digital signage menus. Includes a rendering engine that produces pixel-perfect full-screen displays from JSON definitions, and a GUI editor for visually authoring menu content.

No frameworks. No build step. No npm. Vanilla JavaScript throughout.

## Project Structure

```
index.html        Demo page — renders a menu JSON with dev toolbar
editor.html       GUI editor — standalone menu authoring tool
renderer.js       Core rendering engine (embeddable)
editor.js         GUI editor component (embeddable)
theme.css         Renderer CSS with custom properties
editor.css        Editor CSS (namespaced .me-)
schema.json       JSON schema definition
examples/         Sample menu definitions
  coffee.json       Coffee shop (nested areas, 2-column)
  cafe.json         Full breakfast cafe
  bakery.json       Portrait-oriented bakery
  surf-shop.json    Retail + lessons with inline variations
  server-status.json  Infrastructure dashboard (non-menu use case)
  minimal.json      Bare-bones 3-item example
```

## Quick Start

Serve with any static file server:

```bash
php -S localhost:8080
# or: npx serve .
# or: python3 -m http.server 8080
```

- `http://localhost:8080` — renders the default menu
- `http://localhost:8080?preview` — preview mode with dev toolbar
- `http://localhost:8080?menu=examples/cafe.json` — load a specific menu
- `http://localhost:8080/editor.html` — open the GUI editor

## Unit System

All values are resolution-independent. One JSON definition renders correctly at any resolution.

### Spatial values — percentages

Padding, gutter, gap, and position values are **percentages of the viewport**. Horizontal values are `% of viewport width`, vertical values are `% of viewport height`.

```json
"viewport_padding": { "top": 3, "right": 1.25, "bottom": 3, "left": 1.25 }
```

At 4K (3840x2160): `1.25% of 3840 = 48px`. At 1080p (1920x1080): `1.25% of 1920 = 24px`.

### Font sizes — ems

Font `size` values are **em multipliers** of a resolution-scaled base font size.

| Resolution | Base font | Example: size 3 |
|---|---|---|
| 1080 (1920x1080) | 16px | 48px |
| 2k (2560x1440) | 21px | 63px |
| 4k (3840x2160) | 32px | 96px |

```json
"title": { "font": { "size": 3 } }
```

### Backward compatibility

String values with `px` suffix (e.g. `"44px"`) are used as raw CSS — they bypass the unit system and render at the exact pixel size regardless of resolution.

## Renderer API

Include `renderer.js` and `theme.css`, then use the global `MenuRenderer` object.

### `MenuRenderer.render(jsonObject, targetElement)`

Renders a menu into the target DOM element. Clears the target first.

```html
<link rel="stylesheet" href="theme.css">
<script src="renderer.js"></script>
<script>
  MenuRenderer.render({
    areas: [{ id: "main", title: "Menu", items: [
      { id: "1", name: "Coffee", price: "3.00" }
    ]}]
  }, document.getElementById('display'));
</script>
```

### `MenuRenderer.loadFromUrl(url, targetElement)`

Fetches JSON from a URL, then renders. Returns a Promise.

```js
MenuRenderer.loadFromUrl('/api/menu.json', document.getElementById('display'));
```

### `MenuRenderer.watch(url, targetElement, intervalSeconds)`

Auto-refreshes on an interval. Returns `{ stop() }`. This is how screens stay up to date.

```js
var watcher = MenuRenderer.watch('/api/menu.json', target, 30);
watcher.stop(); // later
```

### `MenuRenderer.validate(jsonObject)`

Validates a menu definition. Returns `{ valid, errors[], warnings[] }` with JSON paths.

```js
var result = MenuRenderer.validate(data);
// { valid: true, errors: [], warnings: [{ path: "areas[0].items[2]", message: "..." }] }
```

## Editor API

Include `editor.js`, `editor.css`, `renderer.js`, and `theme.css`. Use the global `MenuEditor` object.

### `MenuEditor.create(targetElement, options)`

Creates a GUI editor instance. Returns an editor controller.

```html
<link rel="stylesheet" href="theme.css">
<link rel="stylesheet" href="editor.css">
<script src="renderer.js"></script>
<script src="editor.js"></script>
<script>
  var editor = MenuEditor.create(document.getElementById('editor'), {
    data: existingMenuJson,        // optional initial data
    onChange: function(data) {},    // called on every change
    rendererAvailable: true        // auto-detected; set false for JSON-only mode
  });
</script>
```

**Options:**

| Option | Type | Description |
|---|---|---|
| `data` | object | Initial JSON data. If omitted, starts with a blank template. |
| `onChange` | function | Callback `(data)` fired on every data change. |
| `rendererAvailable` | boolean | Auto-detected. Set `false` to embed without renderer (JSON output only). |
| `persist` | boolean | Auto-save state to `localStorage` (default `true`). Set `false` to disable. |
| `storageKey` | string | localStorage key for auto-save (default `"menu-editor:last"`). |

**Returned instance:**

| Method | Description |
|---|---|
| `getData()` | Returns a deep clone of the current menu data. |
| `setData(data)` | Replaces all data and resets undo history. |
| `destroy()` | Removes all DOM and cleans up. |
| `on(event, handler)` | Listen for `'change'` or `'select'` events. |

### Editor features

- **Three-panel layout**: Structure tree, property inspector, live preview
- **Tree panel**: Expand/collapse, click to select, hover buttons for add/delete/duplicate, drag-and-drop reordering
- **Inspector**: Schema-driven form fields for all properties. Field types: text, number, select, checkbox, color picker (with transparent toggle), padding editor (uniform/per-side), font editor (family, weight, color, size)
- **Style overrides**: Per-element font and color overrides with "Inherited" cover — click to reveal override fields, re-covers if no changes made
- **Preview**: Live renderer in iframe, zoomable (25%–150%), minimap with viewport rect
- **JSON output**: Syntax-highlighted, copy/download buttons
- **Toolbar**: New, Import, Export, Export PNG, Undo/Redo (Ctrl+Z), Grid overlay, Examples dropdown
- **Hover highlight**: Hovering a tree node highlights the corresponding element in the preview
- **Click-to-select in preview**: Click any element in the preview to select it in the tree and inspector
- **Two resize modes** (toggle in toolbar):
  - **Element mode**: drag handles on the selected element's padding edges — resizes that element's padding
  - **Layout mode**: drag handles on viewport padding (orange) and area gaps (green) — resizes global layout properties, updating all elements that inherit them
- Drag values convert from px to `%` in real-time with undo/redo support (single undo per drag)
- **IDs**: Every entity (area, item, variation) gets an auto-generated ID for external system addressing
- **Auto-save to localStorage**: Editor state persists across page reloads. Disable with `persist: false` or change the storage key with `storageKey: "..."`.

### Embedding without the renderer

The editor works standalone for JSON authoring — the preview tab is hidden and only JSON output is available:

```html
<link rel="stylesheet" href="editor.css">
<script src="editor.js"></script>
<script>
  MenuEditor.create(document.getElementById('editor'), {
    rendererAvailable: false,
    onChange: function(data) { sendToServer(data); }
  });
</script>
```

## JSON Schema

## Design Tokens & Reference System

The renderer supports **named tokens** for colors, spacing, and font sizes. Define them once, reference them with `$name` everywhere. Change a single token and every reference updates.

### Color palette (`theme.palette`)
Built-in tokens: `background`, `surface`, `text`, `muted`, `accent`, `divider`. Override or add your own. Reference with `"color": "$accent"`.

### Spacing scale (`layout.spacing`)
Built-in tokens: `none`, `xs` (0.25), `sm` (0.5), `md` (1), `lg` (2), `xl` (3), `xxl` (5) — all in `%` of viewport. Override or add your own. Reference with `"padding": "$md"` or `{ "top": "$lg", "left": "$sm" }`.

### Type scale (`theme.type_scale`)
Built-in tokens: `xs` (0.75), `sm` (1), `base` (1.375), `md` (1.75), `lg` (2.5), `xl` (3.5), `hero` (5) — all in `em`. Reference with `"size": "$lg"`.

### Theme presets (`theme.preset`)
Built-in presets pre-fill the entire theme. Set `"preset": "dark"` (or `light`, `warm`, `cool`, `mono`) and override any field. Presets define palette, fonts, dividers, and base colors.

```json
"theme": {
  "preset": "warm",
  "palette": { "accent": "#ff8c42" }
}
```

This loads the warm preset, then overrides one palette color.

## JSON Schema

### `layout`

| Field | Type | Default | Description |
|---|---|---|---|
| `resolution` | `"1080"` \| `"2k"` \| `"4k"` | `"4k"` | Sets viewport container size |
| `orientation` | `"landscape"` \| `"portrait"` | `"landscape"` | Screen orientation |
| `mode` | `"display"` \| `"preview"` | `"display"` | Preview mode scales to fit browser |
| `viewport_padding` | number or `{top,right,bottom,left}` | `~1.25/3` | Padding from screen edges (%) |
| `area_gap` | number | `~3` | Vertical gap between areas (%) |
| `area_padding` | padding | `0` | Default internal padding for all areas |
| `item_padding` | padding | `~0.4` | Default padding for all items |
| `item_gutter` | number | `~0.4` | Default gap between item columns (%) |
| `spacing` | object | — | Custom spacing scale (token name → number) |
| `container.columns` | `1` \| `2` \| `3` | `1` | Top-level area column layout |
| `container.gutter` | number | `~1.25` | Gap between area columns (%) |
### `header` (top-level, sibling of `layout`)

The header is a 3-column flex region (left/center/right) that holds text and logo elements. Each element specifies which column it lives in via `position`. Multiple elements in the same column stack vertically.

The header has two parts:
- **`header.elements`** (top-level) — the content (text labels, logos)
- **`theme.header.*`** — visual properties (height, padding, background, divider, column sizing)

| Field | Location | Type | Default | Description |
|---|---|---|---|---|
| `elements` | `header` | array | `[]` | Ordered list of header elements |
| `height` | `theme.header` | number | auto | Header min-height (% of viewport height) |
| `padding` | `theme.header` | number or `{top,right,bottom,left}` | `0` | Internal padding (%) |
| `background` | `theme.header` | string | inherits | CSS background (color, gradient, or image) |
| `divider.color` | `theme.header` | string | — | Optional bottom border color |
| `divider.width` | `theme.header` | number | `1` | Border width (px) |
| `columns.left.mode` | `theme.header` | `"fit"` \| `"fill"` | auto | Left column sizing |
| `columns.center.mode` | `theme.header` | `"fit"` \| `"fill"` | auto | Center column sizing |
| `columns.right.mode` | `theme.header` | `"fit"` \| `"fill"` | auto | Right column sizing |

**Auto sizing** (when `mode` is not set): empty columns collapse to zero, columns with content take their natural width plus an equal share of remaining space. So a single centered title automatically gets the full header width.

**Explicit modes**: `fit` = wraps to content (or 0 if empty). `fill` = takes available space, sharing equally with other `fill` columns.

**Example** — full-width centered title with `fit` columns on the sides:
```json
"columns": {
  "left":   { "mode": "fit" },
  "center": { "mode": "fill" },
  "right":  { "mode": "fit" }
}
```
The left and right columns shrink to fit their content (or disappear if empty), letting the center take the entire header width.

**Header text element:**

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | auto | Unique element identifier |
| `type` | `"text"` | — | Required |
| `text` | string | — | Display text |
| `font` | Font | theme default | Font override |
| `position` | `"left"` \| `"center"` \| `"right"` | `"center"` | Column placement |

**Header logo element:**

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | auto | Unique element identifier |
| `type` | `"logo"` | — | Required |
| `src` | string | — | Image URL or path |
| `max_height` | number | `4` | Max height (% of viewport height) |
| `position` | `"left"` \| `"center"` \| `"right"` | `"left"` | Column placement |

Example:
```json
"header": {
  "height": 8,
  "padding": { "top": 1, "right": 2, "bottom": 1, "left": 2 },
  "background": "#1a1a1a",
  "elements": [
    { "id": "logo", "type": "logo", "src": "logo.png", "max_height": 4, "position": "left" },
    { "id": "title", "type": "text", "text": "World Cup Coffee", "position": "center",
      "font": { "family": "Montserrat", "weight": "700", "color": "#fff", "size": 3 } },
    { "id": "subtitle", "type": "text", "text": "Est. 2019", "position": "center",
      "font": { "size": 1, "color": "#888" } }
  ]
}
```

### `theme`

Global visual definitions. All values can be overridden per-area or per-item via the `style` object. Color and size fields accept `$name` references into the palette/type_scale.

| Field | Type | Default | Description |
|---|---|---|---|
| `preset` | `"dark"` \| `"light"` \| `"warm"` \| `"cool"` \| `"mono"` | — | Built-in theme preset, loaded as defaults |
| `palette` | object | built-in | Named colors. Override `background`, `surface`, `text`, `muted`, `accent`, `divider` or add your own |
| `type_scale` | object | built-in | Custom font size tokens (em values) |
| `background` | string | — | Full-screen background. Color or `$name` |
| `text_color` | string | — | Default text color. Color or `$name` |
| `accent_color` | string | — | Accent color. Color or `$name` |
| `currency_symbol` | string | `""` | Symbol prepended to prices (e.g. `"$"`, `"€"`). Default is blank. |
| `price_format` | `"full"` \| `"fewest"` | `"full"` | `full` always shows 2 decimals (50.00). `fewest` drops trailing zeros (50, 2.4). |
| `area_title_font` | Font | Montserrat 600 $accent $md | Section heading font |
| `item_name_font` | Font | Lato 400 $text $base | Item name font |
| `item_price_font` | Font | Lato 700 $text $base | Price font |
| `variation_font` | Font | Lato 400 $muted $sm | Variation text font |
| `description_font` | Font | inherits variation_font | Item description font |
| `divider_color` | string | `"#444444"` | Divider between items |
| `divider_width` | number | `1` | Divider line width (px) |
| `divider_style` | `"solid"` \| `"dashed"` \| `"dotted"` | `"solid"` | Divider line style |
| `area_background` | string | `"transparent"` | Area section background |
| `area_border` | object | — | `{ color, width, style, radius }` for area borders |

### Font object

| Field | Type | Default | Description |
|---|---|---|---|
| `family` | string | `"Lato"` | Font family. Google Fonts are auto-loaded. |
| `weight` | string | `"400"` | CSS font weight |
| `color` | string | `"#ffffff"` | Text color |
| `size` | number | `1.375` | Size in em (multiplier of base font) |

Supported Google Fonts: Montserrat, Lato, Roboto, Open Sans, Oswald, Raleway, Poppins, Playfair Display, Merriweather, Nunito.

### `areas`

Array of area objects. Areas can be **leaf** (has `items`) or **group** (has nested `areas`).

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | **required** | Unique identifier |
| `title` | string | — | Section heading |
| `column_count` | number | `1` | Item grid columns (leaf areas) |
| `columns` | number | `1` | Sub-area columns (group areas) |
| `gutter` | number | `~0.4` | Gap between columns (%) |
| `padding` | number or `{top,right,bottom,left}` | `0` | Internal padding (%) |
| `align` | `"left"` \| `"center"` \| `"right"` | `"left"` | Title alignment |
| `valign` | `"top"` \| `"center"` \| `"bottom"` | `"top"` | Vertical alignment in grid |
| `item_align` | `"left"` \| `"center"` \| `"right"` | `"left"` | Default item text alignment |
| `price_align` | `"left"` \| `"right"` | `"right"` | Price alignment |
| `items` | array | — | Menu items (leaf area) |
| `areas` | array | — | Nested sub-areas (group area) |
| `style` | object | — | Per-area font/color overrides (see Style Overrides) |

### Nested areas (groups)

An area with `areas` instead of `items` acts as a grouping container. Sub-areas arrange in `columns` columns. This enables complex layouts like a 2-column page where one column has multiple stacked sections:

```json
{
  "layout": { "container": { "columns": 2 } },
  "areas": [
    {
      "id": "left",
      "columns": 1,
      "areas": [
        { "id": "hot", "title": "Hot Drinks", "items": [...] },
        { "id": "cold", "title": "Cold Drinks", "items": [...] }
      ]
    },
    { "id": "food", "title": "Food", "items": [...] }
  ]
}
```

### Items

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | **required** | Unique identifier |
| `name` | string | **required** | Display name |
| `description` | string | — | Short description below name |
| `price` | string | — | Base price (always shown, even with variations) |
| `variations` | array | — | Size/style variations with prices |
| `variations_inline` | boolean | `true` | Inline layout (default) or stacked rows |
| `show_variation_prices` | boolean | `true` | Show/hide individual variation prices |
| `align` | string | inherited | Text alignment override |
| `padding` | number or object | `~0.4` | Item padding (%) |
| `hide_if_empty` | boolean | `false` | Hide if no price and no variations |
| `style` | object | — | Per-item font/color overrides |

**Price + variations together**: An item can have both a base `price` and `variations`. This supports patterns like "Sandwich $10" with add-on variations "Extra Meat +$2".

### Variations

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Label (e.g. "Small", "Large", "Extra Meat") |
| `price` | string | Price for this variation |

### Style overrides

Areas and items can override global theme fonts and colors via a `style` object. Overrides cascade: item style > area style > theme.

**Area style:**

| Field | Type | Description |
|---|---|---|
| `style.title_font` | Font | Override area title font |
| `style.item_name_font` | Font | Override item name font for this area |
| `style.item_price_font` | Font | Override item price font for this area |
| `style.variation_font` | Font | Override variation font for this area |
| `style.divider_color` | string | Override divider color |
| `style.background` | string | Override area background |

**Item style:**

| Field | Type | Description |
|---|---|---|
| `style.name_font` | Font | Override name font for this item |
| `style.price_font` | Font | Override price font for this item |

Example:
```json
{
  "id": "specials",
  "title": "Today's Specials",
  "style": {
    "title_font": { "color": "#ff6600" },
    "background": "#1a0a00"
  },
  "items": [
    {
      "id": "special-1",
      "name": "Chef's Choice",
      "price": "18.00",
      "style": { "name_font": { "weight": "700", "color": "#ffcc00" } }
    }
  ]
}
```

## Resolution Handling

The renderer creates a viewport container at the exact pixel dimensions for the chosen resolution. All spacing and fonts scale automatically via the `%`/`em` unit system.

| Resolution | Viewport | Base font |
|---|---|---|
| `1080` | 1920 x 1080 | 16px |
| `2k` | 2560 x 1440 | 21px |
| `4k` | 3840 x 2160 | 32px |

Portrait orientation swaps width and height.

In `display` mode, the viewport renders at native size (for real displays). In `preview` mode, it scales to fit the browser window.

## Dev Toolbar

Access via `?preview` query parameter. Features:

- **Resolution switcher**: 1080p / 2K / 4K
- **JSON file picker**: Load a local `.json` file
- **Example selector**: Load bundled examples
- **Validation indicator**: Green (valid), yellow (warnings), red (errors) — click to expand error panel with JSON paths
- **Grid overlay**: Toggle colored outlines showing area boundaries, item regions, and spacing
- **Live JSON editor**: Side panel with monospace textarea, debounced re-render, parse error display

## PNG Export

The editor includes an **Export PNG** button that renders the menu at full native resolution (e.g. 3840x2160 for 4K) and downloads it as a PNG file. Requires [html2canvas](https://html2canvas.hertzen.com/) loaded via CDN (included in `editor.html`).

## Integration

### Embed the renderer

Copy `renderer.js` and `theme.css` into your project:

```html
<link rel="stylesheet" href="theme.css">
<script src="renderer.js"></script>
<div id="display"></div>
<script>
  MenuRenderer.loadFromUrl('/api/menu.json', document.getElementById('display'));
</script>
```

### Embed the editor

Copy `editor.js` and `editor.css` (plus renderer files for live preview):

```html
<link rel="stylesheet" href="theme.css">
<link rel="stylesheet" href="editor.css">
<script src="renderer.js"></script>
<script src="editor.js"></script>
<div id="editor"></div>
<script>
  var instance = MenuEditor.create(document.getElementById('editor'), {
    onChange: function(data) {
      // Save to your backend
      fetch('/api/menu', { method: 'POST', body: JSON.stringify(data) });
    }
  });
</script>
```

### Live display with auto-refresh

For screens connected to TVs/monitors, use watch mode to poll for updates:

```html
<script>
  MenuRenderer.watch('/api/menu.json', document.getElementById('display'), 30);
</script>
```

The renderer has zero external dependencies. The editor has zero runtime dependencies (html2canvas is optional, CDN-loaded, for PNG export only).

## IDs and External Systems

Every entity (area, item, variation) has an `id` field. IDs are rendered as `data-ds-id` attributes in the DOM output. This allows external systems to:

- Address specific elements in the template
- Update individual items via API
- Apply dynamic styling or content injection
- Track which items are displayed

The editor auto-generates IDs (`area-1`, `item-1`, `var-1`) and validates uniqueness.

## Examples

| File | Description | Layout |
|---|---|---|
| `coffee.json` | Coffee shop with nested drink areas | 4K portrait, 2-column |
| `cafe.json` | Full breakfast cafe with sides | 4K landscape, 2-column nested |
| `bakery.json` | Bakery with breads, pastries, cakes | 4K portrait, 1-column |
| `surf-shop.json` | Retail + lessons with inline variations | 4K landscape, 2-column nested |
| `server-status.json` | Infrastructure monitoring dashboard | 4K landscape, 3-column |
| `themed.json` | Wine bar — demos preset, palette refs, custom spacing/type tokens | 4K landscape |
| `minimal.json` | Bare-bones 3-item menu | 4K landscape, 1-column |

## License

MIT
