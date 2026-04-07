/**
 * Digital Signage Menu Renderer
 *
 * A standalone, framework-free design system for full-screen menu displays.
 *
 * ## Core concepts
 *
 *   tokens   — design tokens (palette, spacing, type_scale). Reference with $name.
 *   layout   — canvas + arrangement (resolution, viewport_padding, container).
 *   theme    — semantic visual contract:
 *                colors   { background, surface, text, muted, accent, divider }
 *                fonts    { title, heading, body, emphasis, caption }
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
 *   - Element fonts can reference theme roles: `"font": "heading"`.
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

  var DEFAULT_TOKENS = {
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
      none: 0,
      xs:   0.25,
      sm:   0.5,
      md:   1,
      lg:   2,
      xl:   3,
      xxl:  5
    }
  };

  // ── Default Theme ──────────────────────────────────────────────────────
  // The default theme is the baseline. User themes are merged on top of this
  // (or on top of a preset, which is merged on top of this).

  var DEFAULT_THEME = {
    colors: {
      background: '$background',
      surface:    '$surface',
      text:       '$text',
      muted:      '$muted',
      accent:     '$accent',
      divider:    '$divider'
    },
    fonts: {
      title:    { family: 'Montserrat', weight: '700', color: '$text',   size: '$xl' },
      heading:  { family: 'Montserrat', weight: '600', color: '$accent', size: '$md' },
      body:     { family: 'Lato',       weight: '400', color: '$text',   size: '$base' },
      emphasis: { family: 'Lato',       weight: '700', color: '$text',   size: '$base' },
      caption:  { family: 'Lato',       weight: '400', color: '$muted',  size: '$sm' }
    },
    dividers: {
      color: '$divider',
      width: 1,
      style: 'solid'
    },
    areas: {
      padding: 0,
      background: 'transparent',
      border: null,
      title_font: 'heading',
      column_count: 1,
      gutter: '$xs',
      item_align: 'left',
      price_align: 'right'
    },
    items: {
      padding: { top: '$xs', right: 0, bottom: '$xs', left: 0 },
      name_font: 'body',
      price_font: 'emphasis',
      description_font: 'caption',
      variation_font: 'caption',
      align: 'left'
    },
    pricing: {
      symbol: '',
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

  var DEFAULT_LAYOUT = {
    resolution: '4k',
    orientation: 'landscape',
    mode: 'display',
    viewport_padding: { top: '$md', right: '$md', bottom: '$md', left: '$md' },
    area_gap: '$lg',
    container: { columns: 1, gutter: '$md' }
  };

  // ── Theme Presets ──────────────────────────────────────────────────────
  // Presets layer over DEFAULT_THEME. Users layer over presets.

  var PRESETS = {
    dark: {
      tokens: { palette: { background: '#1a1a1a', surface: '#222222', text: '#ffffff', muted: '#cccccc', accent: '#f0c040', divider: '#444444' } }
    },
    light: {
      tokens: { palette: { background: '#fafafa', surface: '#ffffff', text: '#1a1a1a', muted: '#666666', accent: '#c8501e', divider: '#dddddd' } },
      theme: {
        fonts: {
          title:   { family: 'Playfair Display', weight: '700' },
          heading: { family: 'Playfair Display', weight: '700' }
        }
      }
    },
    warm: {
      tokens: { palette: { background: '#2c1810', surface: '#3a2318', text: '#f5e6d3', muted: '#c4a882', accent: '#d4a574', divider: '#4a3528' } },
      theme: {
        fonts: {
          title:   { family: 'Playfair Display' },
          heading: { family: 'Playfair Display' }
        }
      }
    },
    cool: {
      tokens: { palette: { background: '#0a2a3a', surface: '#1a3a4a', text: '#e8f0f5', muted: '#8ab8cc', accent: '#5cc8e8', divider: '#1a4a5e' } },
      theme: {
        fonts: {
          title:   { family: 'Oswald' },
          heading: { family: 'Oswald' }
        }
      }
    },
    mono: {
      tokens: { palette: { background: '#000000', surface: '#0a0a0a', text: '#ffffff', muted: '#888888', accent: '#ffffff', divider: '#333333' } },
      theme: {
        fonts: {
          title:   { family: 'Roboto', weight: '700' },
          heading: { family: 'Roboto', weight: '700' },
          body:    { family: 'Roboto' },
          emphasis: { family: 'Roboto' },
          caption: { family: 'Roboto' }
        }
      }
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

  function buildContext(tokens, theme) {
    return {
      palette:   deepMerge(DEFAULT_TOKENS.palette,   tokens.palette || {}),
      typeScale: deepMerge(DEFAULT_TOKENS.type_scale, tokens.type_scale || {}),
      spacing:   deepMerge(DEFAULT_TOKENS.spacing,    tokens.spacing || {}),
      theme: theme,
      currencySymbol: (theme.pricing && theme.pricing.symbol != null) ? theme.pricing.symbol : '',
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

  // ── Unit Resolution Utilities ──────────────────────────────────────────

  function toHorizontalPx(val, vpW, ctx) {
    if (ctx) val = resolveSpace(val, ctx);
    if (val == null) return 0;
    if (typeof val === 'string') {
      if (val.indexOf('px') !== -1) return parseFloat(val);
      return parseFloat(val);
    }
    return val / 100 * vpW;
  }

  function toVerticalPx(val, vpH, ctx) {
    if (ctx) val = resolveSpace(val, ctx);
    if (val == null) return 0;
    if (typeof val === 'string') {
      if (val.indexOf('px') !== -1) return parseFloat(val);
      return parseFloat(val);
    }
    return val / 100 * vpH;
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
    return p.top + 'px ' + p.right + 'px ' + p.bottom + 'px ' + p.left + 'px';
  }

  // ── Font Resolution ────────────────────────────────────────────────────
  // A font value can be:
  //   - a string referencing a theme role: "heading"
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
      // Allow extending a role: { extends: "heading", color: "$accent" }
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
    var format = (ctx && ctx.priceFormat) || 'full';
    if (str.charAt(0) === '$') str = str.slice(1).trim();
    var num = parseFloat(str);
    if (isNaN(num)) return str;
    var formatted;
    if (format === 'fewest') {
      formatted = parseFloat(num.toFixed(2)).toString();
    } else {
      formatted = num.toFixed(2);
    }
    return symbol + formatted;
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
    var fontVal = element.font || 'title';
    applyFont(div, fontVal, baseFontSize, ctx);
    return div;
  }

  function buildHeaderLogo(element, vpH, ctx) {
    var img = el('img', 'ds-header-logo', { src: element.src, alt: element.alt || 'Logo' });
    if (element.id) img.setAttribute('data-ds-id', element.id);
    var maxH = element.max_height != null ? element.max_height : 4;
    img.style.maxHeight = toVerticalPx(maxH, vpH, ctx) + 'px';
    return img;
  }

  function buildHeaderRegion(headerData, themeHeader, vpW, vpH, baseFontSize, ctx) {
    if (!headerData || !headerData.elements || !headerData.elements.length) return null;

    var region = el('div', 'ds-header-region');

    var height  = themeHeader.height;
    var padding = themeHeader.padding;
    var bg      = themeHeader.background;
    var divider = themeHeader.divider;
    var cols    = themeHeader.columns || {};

    if (height != null) {
      region.style.minHeight = toVerticalPx(height, vpH, ctx) + 'px';
    }
    if (padding != null) {
      var pad = resolvePaddingPx(normalizePadding(padding), vpW, vpH, ctx);
      region.style.padding = paddingCSS(pad);
    }
    if (bg) region.style.background = resolveColor(bg, ctx);
    if (divider && divider.color) {
      var w = (divider.width != null) ? divider.width : 1;
      region.style.borderBottom = w + 'px solid ' + resolveColor(divider.color, ctx);
    }

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
    var nameFont  = itemStyle.name_font  || themeItems.name_font  || 'body';
    var priceFont = itemStyle.price_font || themeItems.price_font || 'emphasis';
    var descFont  = itemStyle.description_font || themeItems.description_font || 'caption';
    var align     = item.align || themeItems.align || areaConfig.item_align || 'left';
    var priceAlign = areaConfig.price_align || 'right';

    var pad = resolvePaddingPx(normalizePadding(padding), vpW, vpH, ctx);

    var wrap = el('div', 'ds-item');
    if (item.id) wrap.setAttribute('data-ds-id', item.id);
    wrap.style.padding = paddingCSS(pad);

    var row = el('div', 'ds-item__row');
    if (priceAlign === 'left') {
      row.style.justifyContent = 'flex-start';
      row.style.gap = toHorizontalPx('$xs', vpW, ctx) + 'px';
    }

    var nameEl = el('span', 'ds-item__name');
    nameEl.textContent = item.name || '';
    if (align !== 'left') nameEl.style.textAlign = align;
    applyFont(nameEl, nameFont, baseFontSize, ctx);
    row.appendChild(nameEl);

    if (hasPrice) {
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
      var varFont = itemStyle.variation_font || themeItems.variation_font || 'caption';

      item.variations.forEach(function (v) {
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
    var titleFont    = areaStyle.title_font || area.title_font || themeAreas.title_font || 'heading';
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
    if (background) section.style.background = resolveColor(background, ctx);
    if (border) {
      var bw = border.width != null ? border.width : 1;
      var bs = border.style || 'solid';
      var bc = resolveColor(border.color || '$divider', ctx);
      section.style.border = bw + 'px ' + bs + ' ' + bc;
      if (border.radius != null) section.style.borderRadius = border.radius + 'px';
    }
    if (area.valign) {
      var valignMap = { top: 'start', center: 'center', bottom: 'end' };
      section.style.alignSelf = valignMap[area.valign] || 'start';
    }

    if (area.title) {
      var titleAlign = area.align || 'left';
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      if (titleAlign !== 'left') titleEl.style.textAlign = titleAlign;
      applyFont(titleEl, titleFont, baseFontSize, ctx);
      section.appendChild(titleEl);
    }

    var grid = el('div', 'ds-items ds-items--cols-' + Math.min(columnCount, 3));
    grid.style.columnGap = toHorizontalPx(gutter, vpW, ctx) + 'px';
    grid.style.rowGap = '0px';

    var areaConfig = {
      item_align: itemAlign,
      price_align: priceAlign
    };

    (area.items || []).forEach(function (item) {
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
    var titleFont  = areaStyle.title_font || area.title_font || themeAreas.title_font || 'heading';

    var section = el('div', 'ds-area ds-area-group');
    if (area.id) {
      section.setAttribute('data-area-id', area.id);
      section.setAttribute('data-ds-id', area.id);
    }
    var pad = resolvePaddingPx(normalizePadding(padding), vpW, vpH, ctx);
    section.style.padding = paddingCSS(pad);
    if (background) section.style.background = resolveColor(background, ctx);

    if (area.valign) {
      var valignMap = { top: 'start', center: 'center', bottom: 'end' };
      section.style.alignSelf = valignMap[area.valign] || 'start';
    }

    if (area.title) {
      var titleAlign = area.align || 'left';
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      if (titleAlign !== 'left') titleEl.style.textAlign = titleAlign;
      applyFont(titleEl, titleFont, baseFontSize, ctx);
      section.appendChild(titleEl);
    }

    var subCols = area.columns || 1;
    var subGutter = (area.gutter != null) ? toHorizontalPx(area.gutter, vpW, ctx) : spacing.containerGutter;
    var subGap = spacing.areaGap;

    var grid = el('div', 'ds-area-group__grid');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(' + subCols + ', 1fr)';
    grid.style.columnGap = subGutter + 'px';
    grid.style.rowGap = subGap + 'px';

    (area.areas || []).forEach(function (subArea) {
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
    var containerGutter = (layout.container && layout.container.gutter != null)
      ? toHorizontalPx(layout.container.gutter, vpW, ctx)
      : 0;
    var areaGap = (layout.area_gap != null) ? toVerticalPx(layout.area_gap, vpH, ctx) : 0;
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

    // Apply preset → defaults → user
    var presetName = data.preset || (data.theme && data.theme.preset);
    var preset = (presetName && PRESETS[presetName]) ? PRESETS[presetName] : null;

    var baseTokens = preset && preset.tokens ? deepMerge({}, preset.tokens) : {};
    var baseTheme  = preset && preset.theme  ? deepMerge(DEFAULT_THEME, preset.theme) : DEFAULT_THEME;
    var baseLayout = preset && preset.layout ? deepMerge(DEFAULT_LAYOUT, preset.layout) : DEFAULT_LAYOUT;

    var tokens = deepMerge(baseTokens, data.tokens || {});
    var theme  = deepMerge(baseTheme,  data.theme  || {});
    var layout = deepMerge(baseLayout, data.layout || {});

    // Auto-assign IDs in-place on a clone so caller's data isn't mutated
    var workingData = JSON.parse(JSON.stringify(data));
    autoAssignIds(workingData);
    var areas = workingData.areas || [];

    // Build context
    var ctx = buildContext(tokens, theme);

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

    // Viewport
    var viewport = el('div', 'ds-viewport');
    viewport.style.width = vpW + 'px';
    viewport.style.height = vpH + 'px';
    viewport.style.fontSize = baseFontSize + 'px';
    var bg = resolveColor(theme.colors && theme.colors.background, ctx);
    if (bg) viewport.style.background = bg;

    // Header
    if (workingData.header && workingData.header.elements && workingData.header.elements.length) {
      var headerRegion = buildHeaderRegion(workingData.header, theme.header || {}, vpW, vpH, baseFontSize, ctx);
      if (headerRegion) viewport.appendChild(headerRegion);
    }

    // Areas container
    var containerCols = (layout.container && layout.container.columns) || 1;
    var areasWrap = el('div', 'ds-areas');
    areasWrap.style.display = 'grid';
    areasWrap.style.gridTemplateColumns = 'repeat(' + containerCols + ', 1fr)';
    areasWrap.style.columnGap = spacing.containerGutter + 'px';
    areasWrap.style.rowGap = spacing.areaGap + 'px';
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

  // ── URL Loading ────────────────────────────────────────────────────────

  function loadFromUrl(url, target) {
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch menu JSON: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        render(data, target);
        return data;
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

    if (data.layout) {
      var lo = data.layout;
      if (lo.resolution && VALID_RESOLUTIONS.indexOf(lo.resolution) === -1) {
        errors.push({ path: 'layout.resolution', message: 'Must be one of: ' + VALID_RESOLUTIONS.join(', ') });
      }
      if (lo.orientation && VALID_ORIENTATIONS.indexOf(lo.orientation) === -1) {
        errors.push({ path: 'layout.orientation', message: 'Must be one of: ' + VALID_ORIENTATIONS.join(', ') });
      }
      if (lo.mode && VALID_MODES.indexOf(lo.mode) === -1) {
        errors.push({ path: 'layout.mode', message: 'Must be one of: ' + VALID_MODES.join(', ') });
      }
    }

    if (data.preset && !PRESETS[data.preset]) {
      warnings.push({ path: 'preset', message: 'Unknown preset: ' + data.preset });
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
    presets: Object.keys(PRESETS),
    get lastValidation() { return lastValidation; }
  };

})();
