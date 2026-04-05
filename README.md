# Digital Signage Menu Renderer

A standalone HTML/CSS/JS templating engine for digital signage menu displays. Feed it a JSON definition and it produces a pixel-perfect, full-screen menu suitable for TVs and display monitors.

No frameworks. No build step. No npm. Just open `index.html` in a browser.

## Quick Start

Serve the project with any static file server:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080
```

Open `http://localhost:8080` to see the demo coffee shop menu.

### Dev toolbar

Add `?preview` to the URL to show developer controls:

```
http://localhost:8080?preview
```

The toolbar lets you switch resolutions, pick example JSON files, or load a local JSON file from disk.

### Load a specific menu

```
http://localhost:8080?menu=examples/minimal.json
```

## API

Include `renderer.js` and `theme.css` in your page, then use the global `MenuRenderer` object.

### `MenuRenderer.render(jsonObject, targetElement)`

Renders a menu from a parsed JSON object into the target DOM element. Clears the target first.

```html
<div id="display"></div>
<link rel="stylesheet" href="theme.css">
<script src="renderer.js"></script>
<script>
  var menu = { areas: [{ id: "main", title: "Menu", items: [{ id: "1", name: "Coffee", price: "3.00" }] }] };
  MenuRenderer.render(menu, document.getElementById('display'));
</script>
```

### `MenuRenderer.loadFromUrl(url, targetElement)`

Fetches JSON from a URL, then renders it. Returns a Promise.

```js
MenuRenderer.loadFromUrl('/api/menu.json', document.getElementById('display'));
```

### `MenuRenderer.watch(url, targetElement, intervalSeconds)`

Fetches and re-renders on an interval. Returns an object with a `stop()` method. This is how display screens stay up to date when menu data changes.

```js
// Re-fetch every 30 seconds
var watcher = MenuRenderer.watch('/api/menu.json', document.getElementById('display'), 30);

// Later, to stop:
watcher.stop();
```

## JSON Schema

The full JSON schema is in [`schema.json`](schema.json). Here is a summary of the structure:

### `layout` (optional)

| Field | Type | Default | Description |
|---|---|---|---|
| `resolution` | `"1080"` \| `"2k"` \| `"4k"` | `"1080"` | Scale factor: 1.0x, 1.5x, or 2.0x |
| `orientation` | `"landscape"` \| `"portrait"` | `"landscape"` | Screen orientation |
| `background_color` | string | `"#1a1a1a"` | CSS background color |
| `x_spacer` | number | `24` | Horizontal spacing (px) |
| `y_spacer` | number | `32` | Vertical spacing (px) |
| `container.columns` | `1` \| `2` | `1` | Area layout: vertical stack or side-by-side |
| `title.text` | string | — | Main title text |
| `title.font` | Font object | — | Title font styling |
| `title.position.x_align` | `"left"` \| `"center"` \| `"right"` | `"center"` | Title alignment |
| `title.position.top_padding` | number | `40` | Pixels from top edge |
| `logo.src` | string | — | Logo image path or URL |
| `logo.x_align` | `"left"` \| `"right"` | `"left"` | Logo corner placement |
| `logo.top_padding` | number | `20` | Pixels from top edge |
| `logo.max_height` | number | `80` | Max logo height (px) |

### `theme` (optional)

| Field | Type | Default | Description |
|---|---|---|---|
| `area_title_font` | Font object | Montserrat 600 #f0c040 28px | Section heading font |
| `item_name_font` | Font object | Lato 400 #ffffff 22px | Item name font |
| `item_price_font` | Font object | Lato 700 #ffffff 22px | Price font |
| `variation_font` | Font object | Lato 400 #cccccc 16px | Variation label font |
| `divider_color` | string | `"#444444"` | Item divider color |
| `area_background` | string | `"transparent"` | Area section background |

### Font object

| Field | Type | Default |
|---|---|---|
| `family` | string | `"Lato"` |
| `weight` | string | `"400"` |
| `color` | string | `"#ffffff"` |
| `size` | string | `"22px"` |

Google Fonts are auto-loaded when referenced. Supported: Montserrat, Lato, Roboto, Open Sans, Oswald, Raleway, Poppins, Playfair Display, Merriweather, Nunito.

### `areas` (required)

Array of area objects:

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | — | **Required.** Unique area identifier |
| `title` | string | — | Section heading text |
| `column_count` | number | `1` | Item grid columns (1–3) |
| `items` | array | — | **Required.** Menu items |

### Item object

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | — | **Required.** Unique item identifier |
| `name` | string | — | **Required.** Display name |
| `description` | string | — | Short description below the name |
| `price` | string | — | Single price (formatted as `$X.XX`) |
| `variations` | array | — | Size/style variations with individual prices |
| `hide_if_empty` | boolean | `false` | Hide item if no price and no variations |

### Variation object

| Field | Type | Description |
|---|---|---|
| `name` | string | Label (e.g. "Small", "Large") |
| `price` | string | Price for this variation |

## Resolution Handling

Content is authored at a native 1920x1080 coordinate space. The renderer applies a CSS `transform: scale()` based on the `resolution` field:

| Resolution | Scale | Output Size |
|---|---|---|
| `1080` | 1.0x | 1920 x 1080 |
| `2k` | 1.5x | 2880 x 1620 |
| `4k` | 2.0x | 3840 x 2160 |

The outer container uses `transform-origin: top left` and fills the viewport. No HTML changes needed when switching displays.

## Integration

To embed the renderer in another project:

1. Copy `renderer.js` and `theme.css` into your project
2. Include both in your HTML:
   ```html
   <link rel="stylesheet" href="theme.css">
   <script src="renderer.js"></script>
   ```
3. Add a target element: `<div id="display"></div>`
4. Call `MenuRenderer.render(data, element)` or `MenuRenderer.loadFromUrl(url, element)`

The renderer manages its own Google Fonts injection and CSS custom property overrides. It has zero external dependencies.

## License

MIT
