/**
 * Digital Signage Menu Renderer
 *
 * A standalone, framework-free design system for full-screen menu displays.
 *
 * ## Core concepts
 *
 *   vars     — design tokens (palette, spacing, type_scale). Reference with $name.
 *   layout   — canvas + arrangement (resolution, viewport_padding, container).
 *   theme    — semantic visual contract:
 *                colors   { background, surface, text, muted, accent, divider }
 *                fonts    { header, area_title, item_name, price, description, ... }
 *                dividers { color, width, style }
 *                areas    { padding, background, border, column_count, ... }
 *                items    { padding, name_font, price_font, ... }
 *                pricing  { symbol, format }
 *                header   { height, padding, background, columns }
 *   header   — { elements: [...] } (top-level data; visuals live in theme.header)
 *   areas    — content tree of areas, items, variations
 *
 * ## Key principles
 *   - One required field on items: `name`. IDs auto-generated.
 *   - Areas, items, header elements all auto-ID if missing.
 *   - Element fonts can reference theme roles: `"font": "area_title"`.
 *   - Spacing/sizes can reference token names: `"padding": "$md"`, `"size": "$lg"`.
 *   - Theme presets pre-fill the entire theme as defaults.
 *
 * ## Public API
 *   MenuRenderer.render(data, target)
 *   MenuRenderer.loadFromUrl(url, target)
 *   MenuRenderer.watch(url, target, intervalSeconds)
 *   MenuRenderer.validate(data)
 *
 * @license MIT
 * @see https://github.com/treehousetim/digital-signage
 */
var MenuRenderer = (function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────

  var RESOLUTION_MAP = {
    '1080': { w: 1920, h: 1080 },
    '2k':   { w: 2560, h: 1440 },
    '4k':   { w: 3840, h: 2160 }
  };

  var BASE_FONT_MAP = {
    '1080': 16,
    '2k':   21,
    '4k':   32
  };

  var GOOGLE_FONTS = [
    'Montserrat', 'Lato', 'Roboto', 'Open Sans', 'Oswald',
    'Raleway', 'Poppins', 'Playfair Display', 'Merriweather', 'Nunito'
  ];

  var MAX_NESTING_DEPTH = 4;

  // ── Built-in Design Tokens ─────────────────────────────────────────────

  var DEFAULT_VARS = {
    palette: {
      background: '#1a1a1a',
      surface:    '#222222',
      text:       '#ffffff',
      muted:      '#cccccc',
      accent:     '#f0c040',
      divider:    '#444444'
    },
    type_scale: {
      xs:   0.75,
      sm:   1,
      base: 1.375,
      md:   1.75,
      lg:   2.5,
      xl:   3.5,
      hero: 5
    },
    spacing: {
      none: '0%',
      xs:   '0.25%',
      sm:   '0.5%',
      md:   '1%',
      lg:   '2%',
      xl:   '3%',
      xxl:  '5%'
    }
  };

  // ── Default Theme ──────────────────────────────────────────────────────
  // The default theme is the baseline. User themes are merged on top of this
  // (or on top of a preset, which is merged on top of this).

  var DEFAULT_THEME = {
    layout: {
      resolution: '4k',
      orientation: 'landscape',
      mode: 'display',
      viewport_padding: { top: '$md', right: '$md', bottom: '$md', left: '$md' },
      row_gutter: '$lg',
      columns: 1,
      column_gutter: '$md'
    },
    colors: {
      background: '$background',
      surface:    '$surface',
      text:       '$text',
      muted:      '$muted',
      accent:     '$accent',
      divider:    '$divider'
    },
    fonts: {
      header:      { family: 'Montserrat', weight: '700', color: '$text',   size: '$xl' },
      area_title:  { family: 'Montserrat', weight: '600', color: '$accent', size: '$md' },
      item_name:   { family: 'Lato',       weight: '400', color: '$text',   size: '$base' },
      price:       { family: 'Lato',       weight: '700', color: '$text',   size: '$base' },
      description: { family: 'Lato',       weight: '400', color: '$muted',  size: '$sm' }
    },
    dividers: {
      default:   { color: '$divider', width: 1, style: 'solid' },
      header:    { sides: ['tb'] },
      area:      { sides: [] },
      item:      { sides: ['tb'] },
      variation: { sides: [] }
    },
    areas: {
      padding: '0%',
      background: 'transparent',
      border: null,
      title_font: 'area_title',
      column_count: 1,
      gutter: '$xs',
      item_align: 'left',
      price_align: 'right'
    },
    items: {
      padding: { top: '$xs', right: '0%', bottom: '$xs', left: '0%' },
      name_font: 'item_name',
      price_font: 'price',
      description_font: 'description',
      variation_font: 'description',
      align: 'left'
    },
    pricing: {
      symbol: '',
      symbol_position: 'before',
      format: 'full'
    },
    header: {
      height: null,
      padding: { top: '$md', right: '$lg', bottom: '$md', left: '$lg' },
      background: null,
      divider: null,
      columns: null
    }
  };

  // ── General Utilities ──────────────────────────────────────────────────

  function deepMerge(base, overrides) {
    if (overrides == null) return JSON.parse(JSON.stringify(base));
    if (base == null) return JSON.parse(JSON.stringify(overrides));
    if (typeof base !== 'object' || typeof overrides !== 'object') return overrides;
    if (Array.isArray(base) || Array.isArray(overrides)) return JSON.parse(JSON.stringify(overrides));
    var result = JSON.parse(JSON.stringify(base));
    for (var key in overrides) {
      if (!overrides.hasOwnProperty(key)) continue;
      if (
        typeof overrides[key] === 'object' &&
        overrides[key] !== null &&
        !Array.isArray(overrides[key]) &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
    return result;
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) node.setAttribute(k, attrs[k]);
      }
    }
    return node;
  }

  // ── Reference Resolution ───────────────────────────────────────────────
  // Build a render context once per render holding token lookups + theme.
  // Resolve $name references against the appropriate token table.

  function buildContext(vars, theme) {
    return {
      palette:   deepMerge(DEFAULT_VARS.palette,   vars.palette || {}),
      typeScale: deepMerge(DEFAULT_VARS.type_scale, vars.type_scale || {}),
      spacing:   deepMerge(DEFAULT_VARS.spacing,    vars.spacing || {}),
      theme: theme,
      currencySymbol: (theme.pricing && theme.pricing.symbol != null) ? theme.pricing.symbol : '',
      currencyPosition: (theme.pricing && theme.pricing.symbol_position) || 'before',
      currencySpace: !!(theme.pricing && theme.pricing.symbol_space),
      priceFormat: (theme.pricing && theme.pricing.format) || 'full'
    };
  }

  function resolveColor(val, ctx) {
    if (typeof val !== 'string' || val.charAt(0) !== '$') return val;
    var key = val.slice(1);
    return ctx.palette[key] != null ? ctx.palette[key] : val;
  }

  function resolveSpace(val, ctx) {
    if (typeof val !== 'string' || val.charAt(0) !== '$') return val;
    var key = val.slice(1);
    return ctx.spacing[key] != null ? ctx.spacing[key] : val;
  }

  function resolveSize(val, ctx) {
    if (typeof val !== 'string' || val.charAt(0) !== '$') return val;
    var key = val.slice(1);
    return ctx.typeScale[key] != null ? ctx.typeScale[key] : val;
  }

  // ── Divider Utilities ─────────────────────────────────────────────────

  function resolveDividerCfg(type, ctx) {
    var d = ctx.theme.dividers || {};
    var def = d.default || {};
    var specific = d[type] || {};
    return {
      color:   specific.color   != null ? specific.color   : (def.color   != null ? def.color   : '$divider'),
      width:   specific.width   != null ? specific.width   : (def.width   != null ? def.width   : 1),
      style:   specific.style   || def.style   || 'solid',
      sides:   specific.sides   !== undefined  ? specific.sides  : (def.sides  !== undefined ? def.sides  : null),
      padding: specific.padding != null ? specific.padding : (def.padding != null ? def.padding : null)
    };
  }

  // Used for area and header borders — applied directly to the element.
  // sides values: "tb" = top+bottom borders, "lr" = left+right borders
  function applyDivider(elem, type, defaultSides, vpW, vpH, ctx) {
    var cfg = resolveDividerCfg(type, ctx);
    var sides = cfg.sides != null ? cfg.sides : defaultSides;
    if (!sides || !sides.length || cfg.width === 0) return;
    var color = resolveColor(cfg.color, ctx) || 'transparent';
    var border = cfg.width + 'px ' + cfg.style + ' ' + color;
    sides.forEach(function (side) {
      var props = side === 'tb' ? ['borderTop', 'borderBottom']
                : side === 'lr' ? ['borderLeft', 'borderRight']
                : [];
      var padProps = side === 'tb' ? ['paddingTop', 'paddingBottom']
                  : side === 'lr' ? ['paddingLeft', 'paddingRight']
                  : [];
      props.forEach(function (p) { elem.style[p] = border; });
      if (cfg.padding != null) {
        var px = (side === 'tb')
          ? toVerticalPx(cfg.padding, vpH, ctx)
          : toHorizontalPx(cfg.padding, vpW, ctx);
        padProps.forEach(function (p) { elem.style[p] = toCSSPx(px); });
      }
    });
  }

  // Used for item and variation dividers — returns a standalone element placed
  // between siblings. Padding on active sides becomes margin on the element.
  // Standalone divider element placed between siblings.
  // sides values: "tb" = horizontal line (border-top, zero height, full width)
  //               "lr" = vertical line   (border-left, zero width, stretched height)
  function buildDividerEl(type, className, vpW, vpH, ctx) {
    var cfg = resolveDividerCfg(type, ctx);
    var sides = cfg.sides != null ? cfg.sides : [];
    if (!sides.length || cfg.width === 0) return null;
    var divEl = el('div', className);
    var color = resolveColor(cfg.color, ctx) || 'transparent';
    var border = cfg.width + 'px ' + cfg.style + ' ' + color;
    sides.forEach(function (side) {
      if (side === 'tb') {
        divEl.style.borderTop = border;
        divEl.style.height = '0';
        if (cfg.padding != null) {
          var px = toVerticalPx(cfg.padding, vpH, ctx);
          divEl.style.marginTop = toCSSPx(px);
          divEl.style.marginBottom = toCSSPx(px);
        }
      } else if (side === 'lr') {
        divEl.style.borderLeft = border;
        divEl.style.width = '0';
        if (cfg.padding != null) {
          var px = toHorizontalPx(cfg.padding, vpW, ctx);
          divEl.style.marginLeft = toCSSPx(px);
          divEl.style.marginRight = toCSSPx(px);
        }
      }
    });
    return divEl;
  }

  // ── Unit Resolution Utilities ──────────────────────────────────────────

  // Converts a resolved spacing value to a CSS string.
  // Numbers become 'Npx'. CSS unit strings (em, rem, pt, etc.) pass through.
  function toCSSPx(v) {
    return typeof v === 'string' ? v : v + 'px';
  }

  // Resolves a spacing value to a number (px) or a CSS unit string.
  // "%" → viewport-relative pixels. CSS unit strings pass through as-is.
  function toHorizontalPx(val, vpW, ctx) {
    if (ctx) val = resolveSpace(val, ctx);
    if (val == null) return 0;
    if (typeof val === 'string') {
      var n = parseFloat(val);
      if (isNaN(n)) return 0;
      if (val.indexOf('%') !== -1) return n / 100 * vpW;
      if (/[a-z]/i.test(val.trim())) return val.trim(); // CSS unit — pass through
      return n;
    }
    return val;
  }

  function toVerticalPx(val, vpH, ctx) {
    if (ctx) val = resolveSpace(val, ctx);
    if (val == null) return 0;
    if (typeof val === 'string') {
      var n = parseFloat(val);
      if (isNaN(n)) return 0;
      if (val.indexOf('%') !== -1) return n / 100 * vpH;
      if (/[a-z]/i.test(val.trim())) return val.trim(); // CSS unit — pass through
      return n;
    }
    return val;
  }

  function toFontSize(val, baseFontSize, ctx) {
    if (ctx) val = resolveSize(val, ctx);
    if (val == null) return undefined;
    if (typeof val === 'string') return val; // raw CSS like "44px"
    return (val * baseFontSize) + 'px';
  }

  function normalizePadding(val, fallback) {
    if (val == null && fallback != null) return normalizePadding(fallback);
    if (val == null) return { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof val === 'number' || typeof val === 'string') {
      return { top: val, right: val, bottom: val, left: val };
    }
    return {
      top:    val.top    != null ? val.top    : 0,
      right:  val.right  != null ? val.right  : 0,
      bottom: val.bottom != null ? val.bottom : 0,
      left:   val.left   != null ? val.left   : 0
    };
  }

  function resolvePaddingPx(pad, vpW, vpH, ctx) {
    return {
      top:    toVerticalPx(pad.top, vpH, ctx),
      right:  toHorizontalPx(pad.right, vpW, ctx),
      bottom: toVerticalPx(pad.bottom, vpH, ctx),
      left:   toHorizontalPx(pad.left, vpW, ctx)
    };
  }

  function paddingCSS(p) {
    return toCSSPx(p.top) + ' ' + toCSSPx(p.right) + ' ' + toCSSPx(p.bottom) + ' ' + toCSSPx(p.left);
  }

  // ── Font Resolution ────────────────────────────────────────────────────
  // A font value can be:
  //   - a string referencing a theme role: "area_title"
  //   - a font object: { family, weight, color, size }
  //   - undefined (use default for the element)

  function resolveFont(val, ctx) {
    if (val == null) return null;
    if (typeof val === 'string') {
      // Reference to a named role
      var role = ctx.theme.fonts && ctx.theme.fonts[val];
      return role || null;
    }
    if (typeof val === 'object') {
      // Allow extending a role: { extends: "area_title", color: "$accent" }
      if (val.extends && ctx.theme.fonts && ctx.theme.fonts[val.extends]) {
        var base = ctx.theme.fonts[val.extends];
        var merged = {};
        for (var k in base) merged[k] = base[k];
        for (var k2 in val) if (k2 !== 'extends') merged[k2] = val[k2];
        return merged;
      }
      return val;
    }
    return null;
  }

  function applyFont(element, fontVal, baseFontSize, ctx) {
    var font = resolveFont(fontVal, ctx);
    if (!font) return;
    if (font.family) element.style.fontFamily = "'" + font.family + "', sans-serif";
    if (font.weight) element.style.fontWeight = font.weight;
    if (font.color)  element.style.color = resolveColor(font.color, ctx);
    if (font.size != null) element.style.fontSize = toFontSize(font.size, baseFontSize, ctx);
  }

  // ── Price Formatting ───────────────────────────────────────────────────

  function formatPrice(value, ctx) {
    if (value == null || value === '') return '';
    var str = String(value).trim();
    var symbol = (ctx && ctx.currencySymbol != null) ? ctx.currencySymbol : '';
    var position = (ctx && ctx.currencyPosition) || 'before';
    var space = (ctx && ctx.currencySpace && symbol) ? ' ' : '';
    var format = (ctx && ctx.priceFormat) || 'full';
    if (str.charAt(0) === '$') str = str.slice(1).trim();
    if (/[a-zA-Z]/.test(str)) return str;
    var num = parseFloat(str);
    if (isNaN(num)) return str;
    var formatted;
    if (format === 'fewest') {
      formatted = parseFloat(num.toFixed(2)).toString();
    } else {
      formatted = num.toFixed(2);
    }
    return position === 'after' ? formatted + space + symbol : symbol + space + formatted;
  }

  // ── Auto-ID Generation ─────────────────────────────────────────────────
  // Walks the data tree and assigns IDs to entities that lack them.
  // Uses slug of name/title when possible, falls back to type-N.

  function slugify(s) {
    return String(s || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  function autoAssignIds(data) {
    var counters = { area: 0, item: 0, variation: 0, header: 0 };
    var seen = {};
    function unique(id) {
      var base = id || 'id';
      var n = base;
      var i = 1;
      while (seen[n]) {
        n = base + '-' + (++i);
      }
      seen[n] = true;
      return n;
    }
    function ensureId(obj, type) {
      if (obj.id) {
        seen[obj.id] = true;
        return;
      }
      var name = obj.title || obj.name || obj.text;
      var slug = slugify(name);
      counters[type]++;
      var preferred = slug || (type + '-' + counters[type]);
      obj.id = unique(preferred);
    }

    function walkAreas(areas) {
      if (!Array.isArray(areas)) return;
      areas.forEach(function (area) {
        ensureId(area, 'area');
        if (Array.isArray(area.areas)) walkAreas(area.areas);
        if (Array.isArray(area.items)) {
          area.items.forEach(function (item) {
            ensureId(item, 'item');
            if (Array.isArray(item.variations)) {
              item.variations.forEach(function (v) {
                ensureId(v, 'variation');
              });
            }
          });
        }
      });
    }

    if (data.header && Array.isArray(data.header.elements)) {
      data.header.elements.forEach(function (e) {
        ensureId(e, 'header');
      });
    }
    walkAreas(data.areas);
  }

  // ── Google Fonts ───────────────────────────────────────────────────────

  var loadedFontFamilies = {};

  // ── Icon Libraries ─────────────────────────────────────────────────────

  var loadedIconLibraries = {};

  function injectFontAwesome() {
    if (loadedIconLibraries['fontawesome']) return;
    loadedIconLibraries['fontawesome'] = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    document.head.appendChild(link);
  }

  function collectFonts(data, theme) {
    var fonts = {};
    function addFont(fontObj) {
      if (!fontObj) return;
      // String references resolve later through theme.fonts
      if (typeof fontObj === 'string') {
        var role = theme.fonts && theme.fonts[fontObj];
        if (role) addFont(role);
        return;
      }
      if (!fontObj.family) return;
      var family = fontObj.family;
      var isGoogle = GOOGLE_FONTS.some(function (gf) {
        return gf.toLowerCase() === family.toLowerCase();
      });
      if (!isGoogle) return;
      if (!fonts[family]) fonts[family] = {};
      fonts[family][fontObj.weight || '400'] = true;
    }

    // Theme fonts
    if (theme.fonts) {
      Object.keys(theme.fonts).forEach(function (k) { addFont(theme.fonts[k]); });
    }

    // Header element font overrides
    if (data.header && data.header.elements) {
      data.header.elements.forEach(function (e) {
        if (e.type === 'text' && e.font) addFont(e.font);
      });
    }

    // Area / item style overrides
    function walkAreas(areas) {
      if (!Array.isArray(areas)) return;
      areas.forEach(function (area) {
        if (area.style) {
          Object.keys(area.style).forEach(function (k) {
            var v = area.style[k];
            if (v && typeof v === 'object' && v.family) addFont(v);
          });
        }
        if (area.areas) walkAreas(area.areas);
        if (area.items) {
          area.items.forEach(function (item) {
            if (item.style) {
              Object.keys(item.style).forEach(function (k) {
                var v = item.style[k];
                if (v && typeof v === 'object' && v.family) addFont(v);
              });
            }
          });
        }
      });
    }
    walkAreas(data.areas);

    return fonts;
  }

  function injectGoogleFonts(fontMap) {
    var families = [];
    for (var family in fontMap) {
      if (!fontMap.hasOwnProperty(family)) continue;
      if (loadedFontFamilies[family]) continue;
      var weights = Object.keys(fontMap[family]).sort().join(';');
      families.push('family=' + family.replace(/ /g, '+') + ':wght@' + weights);
      loadedFontFamilies[family] = true;
    }
    if (families.length === 0) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?' + families.join('&') + '&display=swap';
    document.head.appendChild(link);
  }

  // ── Header Builders ────────────────────────────────────────────────────

  function buildHeaderText(element, baseFontSize, ctx) {
    var div = el('div', 'ds-header-text');
    if (element.id) div.setAttribute('data-ds-id', element.id);
    div.textContent = element.text || '';
    // Default to title role if no font specified
    var fontVal = element.font || 'header';
    applyFont(div, fontVal, baseFontSize, ctx);
    return div;
  }

  function buildHeaderLogo(element, vpH, ctx) {
    var img = el('img', 'ds-header-logo', { src: element.src, alt: element.alt || 'Logo' });
    if (element.id) img.setAttribute('data-ds-id', element.id);
    var maxH = element.max_height != null ? element.max_height : 4;
    img.style.maxHeight = toCSSPx(toVerticalPx(maxH, vpH, ctx));
    return img;
  }

  function buildHeaderRegion(headerData, themeHeader, vpW, vpH, baseFontSize, ctx) {
    if (!headerData || !headerData.elements || !headerData.elements.length) return null;

    var region = el('div', 'ds-header-region');

    var height  = themeHeader.height;
    var padding = themeHeader.padding;
    var bg      = themeHeader.background;
    var cols = themeHeader.columns || {};

    if (height != null) {
      region.style.minHeight = toCSSPx(toVerticalPx(height, vpH, ctx));
    }
    if (padding != null) {
      var pad = resolvePaddingPx(normalizePadding(padding), vpW, vpH, ctx);
      region.style.padding = paddingCSS(pad);
    }
    if (bg) region.style.background = resolveColor(bg, ctx);
    applyDivider(region, 'header', ['bottom'], vpW, vpH, ctx);

    var leftCol   = el('div', 'ds-header-col ds-header-col--left');
    var centerCol = el('div', 'ds-header-col ds-header-col--center');
    var rightCol  = el('div', 'ds-header-col ds-header-col--right');

    // Build elements
    headerData.elements.forEach(function (element) {
      var node = null;
      if (element.type === 'text') node = buildHeaderText(element, baseFontSize, ctx);
      else if (element.type === 'logo' && element.src) node = buildHeaderLogo(element, vpH, ctx);
      if (!node) return;
      var pos = element.position || (element.type === 'logo' ? 'left' : 'center');
      if (pos === 'left') leftCol.appendChild(node);
      else if (pos === 'right') rightCol.appendChild(node);
      else centerCol.appendChild(node);
    });

    // Column sizing — auto: empty collapses, content gets equal share
    function colFlex(cfg, columnEl) {
      var mode = cfg && cfg.mode;
      if (mode === 'fit') return '0 0 auto';
      if (mode === 'fill') return '1 1 0';
      if (columnEl.children.length === 0) return '0 0 0';
      return '1 1 auto';
    }
    leftCol.style.flex   = colFlex(cols.left,   leftCol);
    centerCol.style.flex = colFlex(cols.center, centerCol);
    rightCol.style.flex  = colFlex(cols.right,  rightCol);

    region.appendChild(leftCol);
    region.appendChild(centerCol);
    region.appendChild(rightCol);
    return region;
  }

  // ── Item Builder ───────────────────────────────────────────────────────

  function buildItem(item, areaConfig, vpW, vpH, baseFontSize, ctx) {
    var hasPrice = item.price != null && item.price !== '';
    var hasVariations = item.variations && item.variations.length > 0;

    if (item.hide_if_empty && !hasPrice && !hasVariations) return null;

    var themeItems = ctx.theme.items || {};
    var itemStyle  = item.style || {};

    // Resolve item-level config (item.style > theme.items)
    var padding   = item.padding != null ? item.padding : themeItems.padding;
    var nameFont  = itemStyle.name_font  || themeItems.name_font  || 'item_name';
    var priceFont = itemStyle.price_font || themeItems.price_font || 'price';
    var descFont  = itemStyle.description_font || themeItems.description_font || 'description';
    var align     = item.align || themeItems.align || areaConfig.item_align || 'left';
    var priceAlign = areaConfig.price_align || 'right';

    var pad = resolvePaddingPx(normalizePadding(padding), vpW, vpH, ctx);

    var wrap = el('div', 'ds-item');
    if (item.id) wrap.setAttribute('data-ds-id', item.id);
    wrap.style.padding = paddingCSS(pad);

    var row = el('div', 'ds-item__row');
    if (priceAlign === 'left') {
      row.style.justifyContent = 'flex-start';
      row.style.gap = toCSSPx(toHorizontalPx('$xs', vpW, ctx));
    }

    var nameEl = el('span', 'ds-item__name');
    nameEl.textContent = item.name || '';
    if (align !== 'left') nameEl.style.textAlign = align;
    applyFont(nameEl, nameFont, baseFontSize, ctx);
    row.appendChild(nameEl);

    if (hasPrice) {
      // Optional leader between name and price
      var pl = themeItems.price_line;
      if (pl && pl.style && pl.style !== 'none') {
        var leader = el('span', 'ds-item__leader');
        leader.style.flex = '1 1 auto';
        leader.style.alignSelf = 'center';
        var color = resolveColor(pl.color || '$muted', ctx);
        var thickness = (pl.thickness != null ? pl.thickness : 1);
        var segDefault = pl.style === 'dots' ? 2 : 6;
        var segVal = pl.segment_size != null ? pl.segment_size : segDefault;
        var leaderH = pl.style === 'dots' ? Math.max(thickness, segVal) : thickness;
        leader.style.height = leaderH + 'px';
        leader.style.marginLeft = toCSSPx(toHorizontalPx(pl.padding_left != null ? pl.padding_left : '$xs', vpW, ctx));
        leader.style.marginRight = toCSSPx(toHorizontalPx(pl.padding_right != null ? pl.padding_right : '$xs', vpW, ctx));
        if (pl.style === 'solid') {
          leader.style.background = color;
        } else {
          var seg = segVal;
          var gap = pl.gap_size != null ? pl.gap_size : 4;
          var period = seg + gap;
          if (pl.style === 'dots') {
            // Radial gradient circle — bg tile is seg×seg so circle is round
            leader.style.backgroundImage = 'radial-gradient(circle at center, ' + color + ' ' + (seg/2) + 'px, transparent ' + ((seg/2) + 0.5) + 'px)';
            leader.style.backgroundSize = period + 'px ' + seg + 'px';
            leader.style.backgroundRepeat = 'space no-repeat';
            leader.style.backgroundPosition = 'left center';
          } else { // dashes
            leader.style.backgroundImage = 'linear-gradient(to right, ' + color + ' 0 ' + seg + 'px, transparent ' + seg + 'px ' + period + 'px)';
            leader.style.backgroundSize = period + 'px ' + thickness + 'px';
            leader.style.backgroundRepeat = 'space no-repeat';
            leader.style.backgroundPosition = 'left center';
          }
        }
        row.appendChild(leader);
      }
      var priceEl = el('span', 'ds-item__price');
      priceEl.textContent = formatPrice(item.price, ctx);
      applyFont(priceEl, priceFont, baseFontSize, ctx);
      row.appendChild(priceEl);
    }

    wrap.appendChild(row);

    if (item.description) {
      var desc = el('div', 'ds-item__description');
      desc.textContent = item.description;
      if (align !== 'left') desc.style.textAlign = align;
      applyFont(desc, descFont, baseFontSize, ctx);
      wrap.appendChild(desc);
    }

    if (hasVariations) {
      var showPrices = item.show_variation_prices !== false;
      var inline = item.variations_inline !== false;
      var varList = el('div', 'ds-variations' + (inline ? ' ds-variations--inline' : ''));
      var varFont = itemStyle.variation_font || themeItems.variation_font || 'description';

      item.variations.forEach(function (v, vi) {
        if (vi > 0) {
          var vDiv = buildDividerEl('variation', 'ds-variation__divider', vpW, vpH, ctx);
          if (vDiv) varList.appendChild(vDiv);
        }
        var vRow = el('div', 'ds-variation');
        if (v.id) vRow.setAttribute('data-ds-id', v.id);
        var vName = el('span', 'ds-variation__name');
        vName.textContent = v.name || '';
        applyFont(vName, varFont, baseFontSize, ctx);
        vRow.appendChild(vName);
        if (showPrices && v.price != null) {
          var vPrice = el('span', 'ds-variation__price');
          vPrice.textContent = formatPrice(v.price, ctx);
          applyFont(vPrice, varFont, baseFontSize, ctx);
          vRow.appendChild(vPrice);
        }
        varList.appendChild(vRow);
      });
      wrap.appendChild(varList);
    }

    return wrap;
  }

  // ── Area Builder ───────────────────────────────────────────────────────

  function buildLeafArea(area, vpW, vpH, baseFontSize, ctx) {
    var themeAreas = ctx.theme.areas || {};
    var areaStyle  = area.style || {};

    // Resolve area config (area > area.style > theme.areas)
    var padding      = area.padding != null ? area.padding : themeAreas.padding;
    var background   = areaStyle.background || area.background || themeAreas.background;
    var border       = areaStyle.border     || themeAreas.border;
    var titleFont    = areaStyle.title_font || area.title_font || themeAreas.title_font || 'area_title';
    var columnCount  = area.column_count || themeAreas.column_count || 1;
    var gutter       = area.gutter != null ? area.gutter : themeAreas.gutter;
    var itemAlign    = area.item_align  || themeAreas.item_align  || 'left';
    var priceAlign   = area.price_align || themeAreas.price_align || 'right';

    var section = el('div', 'ds-area');
    if (area.id) {
      section.setAttribute('data-area-id', area.id);
      section.setAttribute('data-ds-id', area.id);
    }
    var pad = resolvePaddingPx(normalizePadding(padding), vpW, vpH, ctx);
    section.style.padding = paddingCSS(pad);
    applyDivider(section, 'area', [], vpW, vpH, ctx);
    if (background) section.style.background = resolveColor(background, ctx);
    if (border) {
      var bw = border.width != null ? border.width : 1;
      var bs = border.style || 'solid';
      var bc = resolveColor(border.color || '$divider', ctx);
      section.style.border = bw + 'px ' + bs + ' ' + bc;
      if (border.radius != null) section.style.borderRadius = border.radius + 'px';
    }
    if (area.valign) {
      var jcMap = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
      var asMap = { top: 'start',      center: 'center', bottom: 'end'      };
      section.style.display        = 'flex';
      section.style.flexDirection  = 'column';
      section.style.justifyContent = jcMap[area.valign] || 'flex-start';
      section.style.alignSelf      = asMap[area.valign] || 'start';
    }

    if (area.icon) {
      var iconH     = area.icon_height != null ? area.icon_height : '25%';
      var iconPx    = toVerticalPx(iconH, vpH, ctx);
      var iconAlign = area.align || 'left';
      var iconColor = area.icon_color || '#ffffff';
      var isFAIcon  = !/^https?:\/\/|^\/|^\./.test(area.icon);

      if (isFAIcon) {
        // Font Awesome — inject stylesheet once, then render <i> element
        injectFontAwesome();
        var iconEl = el('i', 'ds-area__icon');
        area.icon.split(/\s+/).forEach(function(cls) { if (cls) iconEl.classList.add(cls); });
        iconEl.style.fontSize   = toCSSPx(iconPx);
        iconEl.style.color      = iconColor;
        iconEl.style.display    = 'block';
        if (iconAlign === 'center') { iconEl.style.textAlign = 'center'; }
        else if (iconAlign === 'right') { iconEl.style.textAlign = 'right'; }
      } else {
        // URL — img element; use height (not maxHeight) so intrinsic size is overridden
        var iconEl = el('img', 'ds-area__icon');
        iconEl.src = area.icon;
        iconEl.style.height = toCSSPx(iconPx);
        iconEl.style.width  = 'auto';
        if (iconAlign === 'center') { iconEl.style.marginLeft = 'auto'; iconEl.style.marginRight = 'auto'; }
        else if (iconAlign === 'right') { iconEl.style.marginLeft = 'auto'; }
      }
      section.appendChild(iconEl);
    }

    if (area.title) {
      var titleAlign = area.align || 'left';
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      if (titleAlign !== 'left') titleEl.style.textAlign = titleAlign;
      applyFont(titleEl, titleFont, baseFontSize, ctx);
      section.appendChild(titleEl);
    }

    if (area.subtitle) {
      var subEl = el('p', 'ds-area__subtitle');
      subEl.textContent = area.subtitle;
      var subAlign = area.align || 'left';
      if (subAlign !== 'left') subEl.style.textAlign = subAlign;
      applyFont(subEl, 'description', baseFontSize, ctx);
      section.appendChild(subEl);
    }

    var grid = el('div', 'ds-items ds-items--cols-' + Math.min(columnCount, 3));
    grid.style.columnGap = toCSSPx(toHorizontalPx(gutter, vpW, ctx));
    grid.style.rowGap = '0px';

    var areaConfig = {
      item_align: itemAlign,
      price_align: priceAlign
    };

    var areaItems = area.items || [];
    areaItems.forEach(function (item, i) {
      if (i > 0) {
        var iDiv = buildDividerEl('item', 'ds-item-divider', vpW, vpH, ctx);
        if (iDiv) {
          iDiv.style.gridColumn = '1 / -1';
          grid.appendChild(iDiv);
        }
      }
      var node = buildItem(item, areaConfig, vpW, vpH, baseFontSize, ctx);
      if (node) grid.appendChild(node);
    });

    section.appendChild(grid);
    return section;
  }

  function buildAreaGroup(area, spacing, depth, vpW, vpH, baseFontSize, ctx) {
    var themeAreas = ctx.theme.areas || {};
    var areaStyle  = area.style || {};

    var padding    = area.padding != null ? area.padding : themeAreas.padding;
    var background = areaStyle.background || area.background || themeAreas.background;
    var titleFont  = areaStyle.title_font || area.title_font || themeAreas.title_font || 'area_title';

    var section = el('div', 'ds-area ds-area-group');
    if (area.id) {
      section.setAttribute('data-area-id', area.id);
      section.setAttribute('data-ds-id', area.id);
    }
    var pad = resolvePaddingPx(normalizePadding(padding), vpW, vpH, ctx);
    section.style.padding = paddingCSS(pad);
    applyDivider(section, 'area', [], vpW, vpH, ctx);
    if (background) section.style.background = resolveColor(background, ctx);

    if (area.valign) {
      var jcMapG = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
      var asMapG = { top: 'start',      center: 'center', bottom: 'end'      };
      section.style.display        = 'flex';
      section.style.flexDirection  = 'column';
      section.style.justifyContent = jcMapG[area.valign] || 'flex-start';
      section.style.alignSelf      = asMapG[area.valign] || 'start';
    }

    if (area.icon) {
      var iconElG = el('img', 'ds-area__icon');
      iconElG.src = area.icon;
      var iconHG = area.icon_height != null ? area.icon_height : '25%';
      iconElG.style.maxHeight = toCSSPx(toVerticalPx(iconHG, vpH, ctx));
      iconElG.style.width = 'auto';
      var iconAlignG = area.align || 'left';
      if (iconAlignG === 'center') { iconElG.style.marginLeft = 'auto'; iconElG.style.marginRight = 'auto'; }
      else if (iconAlignG === 'right') { iconElG.style.marginLeft = 'auto'; }
      section.appendChild(iconElG);
    }

    if (area.title) {
      var titleAlign = area.align || 'left';
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      if (titleAlign !== 'left') titleEl.style.textAlign = titleAlign;
      applyFont(titleEl, titleFont, baseFontSize, ctx);
      section.appendChild(titleEl);
    }

    if (area.subtitle) {
      var subElG = el('p', 'ds-area__subtitle');
      subElG.textContent = area.subtitle;
      var subAlignG = area.align || 'left';
      if (subAlignG !== 'left') subElG.style.textAlign = subAlignG;
      applyFont(subElG, 'description', baseFontSize, ctx);
      section.appendChild(subElG);
    }

    var subCols = area.columns || 1;
    var subGutter = (area.gutter != null) ? toHorizontalPx(area.gutter, vpW, ctx) : spacing.containerGutter;
    var subGap = spacing.areaGap;

    var grid = el('div', 'ds-area-group__grid');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(' + subCols + ', 1fr)';
    grid.style.columnGap = toCSSPx(subGutter);
    grid.style.rowGap = toCSSPx(subGap);

    var subAreas = area.areas || [];
    subAreas.forEach(function (subArea) {
      grid.appendChild(buildArea(subArea, spacing, depth + 1, vpW, vpH, baseFontSize, ctx));
    });

    section.appendChild(grid);
    return section;
  }

  function buildArea(area, spacing, depth, vpW, vpH, baseFontSize, ctx) {
    depth = depth || 0;
    if (depth > MAX_NESTING_DEPTH) {
      console.warn('[MenuRenderer] Max nesting depth exceeded, skipping area:', area.id);
      return el('div');
    }
    if (area.areas && area.areas.length > 0) {
      return buildAreaGroup(area, spacing, depth, vpW, vpH, baseFontSize, ctx);
    }
    return buildLeafArea(area, vpW, vpH, baseFontSize, ctx);
  }

  // ── Spacing Resolution ─────────────────────────────────────────────────

  function resolveSpacing(layout, vpW, vpH, ctx) {
    var rawVp = normalizePadding(layout.viewport_padding);
    var viewportPadding = resolvePaddingPx(rawVp, vpW, vpH, ctx);
    var containerGutter = (layout.column_gutter != null)
      ? toHorizontalPx(layout.column_gutter, vpW, ctx)
      : 0;
    var areaGap = (layout.row_gutter != null) ? toVerticalPx(layout.row_gutter, vpH, ctx) : 0;
    return {
      viewportPadding: viewportPadding,
      containerGutter: containerGutter,
      areaGap: areaGap
    };
  }

  // ── Preview Mode ───────────────────────────────────────────────────────

  var resizeHandler = null;

  function applyPreviewScale(viewport, canvasW, canvasH) {
    var availW = window.innerWidth;
    var availH = window.innerHeight;
    var fitScale = Math.min(availW / canvasW, availH / canvasH);
    viewport.style.transform = 'scale(' + fitScale + ')';
    viewport.style.transformOrigin = 'top left';
  }

  function setupPreviewMode(viewport, layout, target) {
    var res = RESOLUTION_MAP[layout.resolution] || RESOLUTION_MAP['4k'];
    var isPortrait = layout.orientation === 'portrait';
    var canvasW = isPortrait ? res.h : res.w;
    var canvasH = isPortrait ? res.w : res.h;

    target.style.overflow = 'hidden';
    applyPreviewScale(viewport, canvasW, canvasH);

    var debounceTimer;
    resizeHandler = function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        applyPreviewScale(viewport, canvasW, canvasH);
      }, 150);
    };
    window.addEventListener('resize', resizeHandler);
  }

  function cleanupPreview() {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
  }

  // ── Main Render ────────────────────────────────────────────────────────

  function render(data, target) {
    if (!target) throw new Error('MenuRenderer.render: target element is required');
    if (typeof data === 'string') data = JSON.parse(data);

    cleanupPreview();

    // If data has unresolved `uses` references, warn — they should be
    // resolved with MenuRenderer.resolve() or loaded via loadFromUrl().
    if (data.uses) {
      console.warn('[MenuRenderer] data.uses is set but render() is synchronous; ' +
        'use MenuRenderer.loadFromUrl() or MenuRenderer.resolve() to apply it.');
    }

    var vars  = deepMerge({},            data.vars  || {});
    var theme = deepMerge(DEFAULT_THEME, data.theme || {});
    // Layout is now a section of theme — extract it for the rest of the pipeline
    var layout = theme.layout || {};

    // Auto-assign IDs in-place on a clone so caller's data isn't mutated
    var workingData = JSON.parse(JSON.stringify(data));
    autoAssignIds(workingData);
    var areas = workingData.areas || [];

    // Build context
    var ctx = buildContext(vars, theme);

    // Resolve viewport dimensions
    var res = RESOLUTION_MAP[layout.resolution] || RESOLUTION_MAP['4k'];
    var isPortrait = layout.orientation === 'portrait';
    var vpW = isPortrait ? res.h : res.w;
    var vpH = isPortrait ? res.w : res.h;
    var baseFontSize = BASE_FONT_MAP[layout.resolution] || BASE_FONT_MAP['4k'];

    // Inject Google Fonts
    injectGoogleFonts(collectFonts(workingData, theme));

    // Resolve spacing
    var spacing = resolveSpacing(layout, vpW, vpH, ctx);

    // Clear target
    target.innerHTML = '';
    target.removeAttribute('style');

    // Viewport — flex column so areas grid can fill remaining height after header
    var viewport = el('div', 'ds-viewport');
    viewport.style.width = vpW + 'px';
    viewport.style.height = vpH + 'px';
    viewport.style.fontSize = baseFontSize + 'px';
    viewport.style.display = 'flex';
    viewport.style.flexDirection = 'column';
    var bg = resolveColor(theme.colors && theme.colors.background, ctx);
    if (bg) viewport.style.background = bg;

    // Header
    if (workingData.header && workingData.header.elements && workingData.header.elements.length) {
      var headerRegion = buildHeaderRegion(workingData.header, theme.header || {}, vpW, vpH, baseFontSize, ctx);
      if (headerRegion) viewport.appendChild(headerRegion);
    }

    // Areas container — flex:1 fills the remaining viewport height;
    // align-content:stretch distributes that height evenly across grid rows
    var containerCols = layout.columns || 1;
    var areasWrap = el('div', 'ds-areas');
    areasWrap.style.display = 'grid';
    areasWrap.style.flex = '1';
    areasWrap.style.minHeight = '0';
    areasWrap.style.gridTemplateColumns = 'repeat(' + containerCols + ', 1fr)';
    areasWrap.style.alignContent = 'stretch';
    areasWrap.style.columnGap = toCSSPx(spacing.containerGutter);
    areasWrap.style.rowGap = toCSSPx(spacing.areaGap);
    areasWrap.style.padding = paddingCSS(spacing.viewportPadding);

    areas.forEach(function (area) {
      areasWrap.appendChild(buildArea(area, spacing, 0, vpW, vpH, baseFontSize, ctx));
    });

    viewport.appendChild(areasWrap);
    target.appendChild(viewport);

    // Apply preview scaling if requested
    if (layout.mode === 'preview') {
      setupPreviewMode(viewport, layout, target);
    }
  }

  // ── External Imports (uses) ────────────────────────────────────────────
  // Any data file may have a `uses` field referencing one or more other
  // JSON files. Each referenced file is fetched, recursively resolved, and
  // deep-merged in order under the data (later wins, user data wins over all).

  function resolveUrl(ref, baseUrl) {
    if (!baseUrl) return ref;
    try {
      return new URL(ref, baseUrl).href;
    } catch (e) {
      return ref;
    }
  }

  /**
   * Fetch a single JSON file. Returns Promise<data>.
   */
  function importUrl(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('Failed to fetch ' + url + ': ' + res.status);
      return res.json();
    });
  }

  /**
   * Recursively resolve all `uses` references in data, deep-merging them
   * in order under the data. Later files override earlier ones, user data
   * overrides all. Returns Promise<flatData> with `uses` removed.
   *
   * Cycle detection: if the same URL appears twice in the chain, throws.
   */
  function resolveData(data, baseUrl, visited) {
    visited = visited || {};
    if (!data || !data.uses) return Promise.resolve(data);

    var refs = Array.isArray(data.uses) ? data.uses : [data.uses];
    var promises = refs.map(function (ref) {
      var url = resolveUrl(ref, baseUrl);
      if (visited[url]) {
        return Promise.reject(new Error('[MenuRenderer] Circular `uses` reference: ' + url));
      }
      visited[url] = true;
      return importUrl(url).then(function (imported) {
        return resolveData(imported, url, visited);
      });
    });

    return Promise.all(promises).then(function (resolvedRefs) {
      // Layer them in order: first ref is base, later refs override, user data overrides all
      var merged = {};
      resolvedRefs.forEach(function (r) {
        merged = deepMerge(merged, r);
      });
      // Apply user data on top, but drop the `uses` field from the result
      var clean = {};
      for (var k in data) {
        if (data.hasOwnProperty(k) && k !== 'uses') clean[k] = data[k];
      }
      merged = deepMerge(merged, clean);
      return merged;
    });
  }

  // ── URL Loading ────────────────────────────────────────────────────────

  function loadFromUrl(url, target) {
    return importUrl(url)
      .then(function (data) { return resolveData(data, url); })
      .then(function (resolved) {
        render(resolved, target);
        return resolved;
      });
  }

  // ── Watch Mode ─────────────────────────────────────────────────────────

  var watchTimers = {};

  function watch(url, target, intervalSeconds) {
    var interval = (intervalSeconds || 60) * 1000;
    var key = url + '::' + (target.id || Math.random());
    if (watchTimers[key]) clearInterval(watchTimers[key]);
    loadFromUrl(url, target);
    watchTimers[key] = setInterval(function () {
      loadFromUrl(url, target).catch(function (err) {
        console.warn('[MenuRenderer] watch refresh failed:', err.message);
      });
    }, interval);
    return {
      stop: function () {
        clearInterval(watchTimers[key]);
        delete watchTimers[key];
      }
    };
  }

  // ── Validation ──────────────────────────────────────────────────────────

  var VALID_RESOLUTIONS = ['1080', '2k', '4k'];
  var VALID_ORIENTATIONS = ['landscape', 'portrait'];
  var VALID_MODES = ['display', 'preview'];
  var VALID_ALIGNS = ['left', 'center', 'right'];
  var VALID_VALIGNS = ['top', 'center', 'bottom'];
  var VALID_PRICE_ALIGNS = ['left', 'right'];

  function validate(data) {
    var errors = [];
    var warnings = [];

    if (!data || typeof data !== 'object') {
      errors.push({ path: '', message: 'Data must be an object' });
      return { valid: false, errors: errors, warnings: warnings };
    }

    if (!data.areas) {
      errors.push({ path: 'areas', message: 'Required field missing' });
    } else if (!Array.isArray(data.areas)) {
      errors.push({ path: 'areas', message: 'Must be an array' });
    } else if (data.areas.length === 0) {
      warnings.push({ path: 'areas', message: 'Areas array is empty' });
    } else {
      data.areas.forEach(function (area, i) {
        validateArea(area, 'areas[' + i + ']', errors, warnings);
      });
    }

    if (data.theme && data.theme.layout) {
      var lo = data.theme.layout;
      if (lo.resolution && VALID_RESOLUTIONS.indexOf(lo.resolution) === -1) {
        errors.push({ path: 'theme.layout.resolution', message: 'Must be one of: ' + VALID_RESOLUTIONS.join(', ') });
      }
      if (lo.orientation && VALID_ORIENTATIONS.indexOf(lo.orientation) === -1) {
        errors.push({ path: 'theme.layout.orientation', message: 'Must be one of: ' + VALID_ORIENTATIONS.join(', ') });
      }
      if (lo.mode && VALID_MODES.indexOf(lo.mode) === -1) {
        errors.push({ path: 'theme.layout.mode', message: 'Must be one of: ' + VALID_MODES.join(', ') });
      }
    }

    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  function validateArea(area, path, errors, warnings) {
    if (!area || typeof area !== 'object') {
      errors.push({ path: path, message: 'Must be an object' });
      return;
    }
    if (area.align && VALID_ALIGNS.indexOf(area.align) === -1) {
      errors.push({ path: path + '.align', message: 'Must be one of: ' + VALID_ALIGNS.join(', ') });
    }
    if (area.valign && VALID_VALIGNS.indexOf(area.valign) === -1) {
      errors.push({ path: path + '.valign', message: 'Must be one of: ' + VALID_VALIGNS.join(', ') });
    }
    if (area.areas && Array.isArray(area.areas)) {
      if (area.items && area.items.length > 0) {
        warnings.push({ path: path, message: 'Has both items and areas — items will be ignored' });
      }
      area.areas.forEach(function (sub, j) {
        validateArea(sub, path + '.areas[' + j + ']', errors, warnings);
      });
    } else if (area.items) {
      if (!Array.isArray(area.items)) {
        errors.push({ path: path + '.items', message: 'Must be an array' });
      } else {
        area.items.forEach(function (item, j) {
          validateItem(item, path + '.items[' + j + ']', errors, warnings);
        });
      }
    } else {
      warnings.push({ path: path, message: 'Area has neither items nor sub-areas' });
    }
  }

  function validateItem(item, path, errors, warnings) {
    if (!item || typeof item !== 'object') {
      errors.push({ path: path, message: 'Must be an object' });
      return;
    }
    if (!item.name) {
      errors.push({ path: path + '.name', message: 'Required field missing' });
    }
    if (item.variations && !Array.isArray(item.variations)) {
      errors.push({ path: path + '.variations', message: 'Must be an array' });
    }
  }

  // Patch render with validation
  var lastValidation = null;
  var _origRender = render;
  function renderWithValidation(data, target) {
    if (typeof data === 'string') data = JSON.parse(data);
    lastValidation = validate(data);
    _origRender(data, target);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  return {
    render: renderWithValidation,
    loadFromUrl: loadFromUrl,
    watch: watch,
    validate: validate,
    formatPrice: formatPrice,
    autoAssignIds: autoAssignIds,
    /** Fetch a single JSON file. Returns Promise<data>. */
    import: importUrl,
    /** Recursively resolve all `uses` references in data. Returns Promise<flatData>. */
    resolve: resolveData,
    get lastValidation() { return lastValidation; }
  };

})();
