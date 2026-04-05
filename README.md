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
- **Drag padding handles**: Selected elements show draggable handles on their padding edges — drag to resize padding visually, values update in real-time as `%`
- **IDs**: Every entity (area, item, variation) gets an auto-generated ID for external system addressing

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

### `layout`

| Field | Type | Default | Description |
|---|---|---|---|
| `resolution` | `"1080"` \| `"2k"` \| `"4k"` | `"4k"` | Sets viewport container size |
| `orientation` | `"landscape"` \| `"portrait"` | `"landscape"` | Screen orientation |
| `mode` | `"display"` \| `"preview"` | `"display"` | Preview mode scales to fit browser |
| `background_color` | string | `"#1a1a1a"` | CSS background color |
| `viewport_padding` | number or `{top,right,bottom,left}` | `~1.25/3` | Padding from screen edges (%) |
| `area_gap` | number | `~3` | Vertical gap between areas (%) |
| `container.columns` | `1` \| `2` \| `3` | `1` | Top-level area column layout |
| `container.gutter` | number | `~1.25` | Gap between area columns (%) |
| `title.text` | string | — | Main title text |
| `title.font` | Font | — | Title font |
| `title.position.x_align` | `"left"` \| `"center"` \| `"right"` | `"center"` | Title alignment |
| `title.position.top_padding` | number | `~1.85` | Distance from top edge (%) |
| `logo.src` | string | — | Logo image path/URL |
| `logo.x_align` | `"left"` \| `"right"` | `"left"` | Logo corner |
| `logo.top_padding` | number | `~1` | Distance from top (%) |
| `logo.max_height` | number | `~3.7` | Max logo height (%) |

### `theme`

Global font and color definitions. All values can be overridden per-area or per-item via the `style` object.

| Field | Type | Default | Description |
|---|---|---|---|
| `area_title_font` | Font | Montserrat 600 #f0c040 1.75em | Section heading font |
| `item_name_font` | Font | Lato 400 #ffffff 1.375em | Item name font |
| `item_price_font` | Font | Lato 700 #ffffff 1.375em | Price font |
| `variation_font` | Font | Lato 400 #cccccc 1em | Variation text font |
| `divider_color` | string | `"#444444"` | Divider between items |
| `area_background` | string | `"transparent"` | Area section background |

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
| `minimal.json` | Bare-bones 3-item menu | 4K landscape, 1-column |

## License

MIT
