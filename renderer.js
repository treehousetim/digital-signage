/**
 * Digital Signage Menu Renderer
 * A standalone, framework-free rendering engine that takes a JSON menu definition
 * and produces a pixel-perfect, full-screen display suitable for TVs and monitors.
 *
 * Unit system:
 *   - Spatial values (padding, gutter, gap, position): % of viewport width or height
 *   - Font sizes: em (multiplier of resolution-scaled base font size)
 *   - Backward compat: strings ending in "px" are used as raw CSS values
 *
 * Usage:
 *   MenuRenderer.render(jsonObject, targetElement)
 *   MenuRenderer.loadFromUrl(url, targetElement)
 *   MenuRenderer.watch(url, targetElement, intervalSeconds)
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

  // Built-in design tokens — referenced via $name in JSON
  var DEFAULT_PALETTE = {
    background: '#1a1a1a',
    surface:    '#222222',
    text:       '#ffffff',
    muted:      '#cccccc',
    accent:     '#f0c040',
    divider:    '#444444'
  };

  var DEFAULT_TYPE_SCALE = {
    xs:   0.75,
    sm:   1,
    base: 1.375,
    md:   1.75,
    lg:   2.5,
    xl:   3.5,
    hero: 5
  };

  var DEFAULT_SPACING = {
    none: 0,
    xs:   0.25,
    sm:   0.5,
    md:   1,
    lg:   2,
    xl:   3,
    xxl:  5
  };

  // Theme presets — merged as defaults under user theme/layout
  var PRESETS = {
    dark: {
      theme: {
        palette: { background: '#1a1a1a', surface: '#222222', text: '#ffffff', muted: '#cccccc', accent: '#f0c040', divider: '#444444' },
        background: '$background',
        text_color: '$text',
        accent_color: '$accent',
        area_title_font: { family: 'Montserrat', weight: '600', color: '$accent', size: '$md' },
        item_name_font:  { family: 'Lato', weight: '400', color: '$text',  size: '$base' },
        item_price_font: { family: 'Lato', weight: '700', color: '$text',  size: '$base' },
        variation_font:  { family: 'Lato', weight: '400', color: '$muted', size: '$sm' },
        divider_color: '$divider',
        divider_width: 1,
        divider_style: 'solid',
        area_background: 'transparent'
      }
    },
    light: {
      theme: {
        palette: { background: '#fafafa', surface: '#ffffff', text: '#1a1a1a', muted: '#666666', accent: '#c8501e', divider: '#dddddd' },
        background: '$background',
        text_color: '$text',
        accent_color: '$accent',
        area_title_font: { family: 'Playfair Display', weight: '700', color: '$accent', size: '$md' },
        item_name_font:  { family: 'Lato', weight: '400', color: '$text',  size: '$base' },
        item_price_font: { family: 'Lato', weight: '700', color: '$text',  size: '$base' },
        variation_font:  { family: 'Lato', weight: '400', color: '$muted', size: '$sm' },
        divider_color: '$divider',
        divider_width: 1,
        divider_style: 'solid',
        area_background: 'transparent'
      }
    },
    warm: {
      theme: {
        palette: { background: '#2c1810', surface: '#3a2318', text: '#f5e6d3', muted: '#c4a882', accent: '#d4a574', divider: '#4a3528' },
        background: '$background',
        text_color: '$text',
        accent_color: '$accent',
        area_title_font: { family: 'Playfair Display', weight: '600', color: '$accent', size: '$md' },
        item_name_font:  { family: 'Lato', weight: '400', color: '$text',  size: '$base' },
        item_price_font: { family: 'Lato', weight: '700', color: '$text',  size: '$base' },
        variation_font:  { family: 'Lato', weight: '400', color: '$muted', size: '$sm' },
        divider_color: '$divider',
        divider_width: 1,
        divider_style: 'solid',
        area_background: 'transparent'
      }
    },
    cool: {
      theme: {
        palette: { background: '#0a2a3a', surface: '#1a3a4a', text: '#e8f0f5', muted: '#8ab8cc', accent: '#5cc8e8', divider: '#1a4a5e' },
        background: '$background',
        text_color: '$text',
        accent_color: '$accent',
        area_title_font: { family: 'Oswald', weight: '600', color: '$accent', size: '$md' },
        item_name_font:  { family: 'Lato', weight: '400', color: '$text',  size: '$base' },
        item_price_font: { family: 'Lato', weight: '700', color: '$accent', size: '$base' },
        variation_font:  { family: 'Lato', weight: '400', color: '$muted', size: '$sm' },
        divider_color: '$divider',
        divider_width: 1,
        divider_style: 'solid',
        area_background: 'transparent'
      }
    },
    mono: {
      theme: {
        palette: { background: '#000000', surface: '#0a0a0a', text: '#ffffff', muted: '#888888', accent: '#ffffff', divider: '#333333' },
        background: '$background',
        text_color: '$text',
        accent_color: '$accent',
        area_title_font: { family: 'Roboto', weight: '700', color: '$accent', size: '$md' },
        item_name_font:  { family: 'Roboto', weight: '400', color: '$text',  size: '$base' },
        item_price_font: { family: 'Roboto', weight: '700', color: '$text',  size: '$base' },
        variation_font:  { family: 'Roboto', weight: '400', color: '$muted', size: '$sm' },
        divider_color: '$divider',
        divider_width: 1,
        divider_style: 'solid',
        area_background: 'transparent'
      }
    }
  };

  // Defaults in the new unit system: spatial = %, fonts = em
  var DEFAULTS = {
    layout: {
      resolution: '4k',
      orientation: 'landscape',
      mode: 'display',
      x_spacer: 1.25,
      y_spacer: 3,
      viewport_padding: null,
      area_gap: null,
      area_padding: null,
      item_padding: null,
      item_gutter: null,
      spacing: null,
      container: { columns: 1, gutter: null }
    },
    theme: {
      preset: null,
      palette: null,
      type_scale: null,
      background: null,
      text_color: null,
      accent_color: null,
      area_title_font: { family: 'Montserrat', weight: '600', color: '#f0c040', size: 1.75 },
      item_name_font:  { family: 'Lato', weight: '400', color: '#ffffff', size: 1.375 },
      item_price_font: { family: 'Lato', weight: '700', color: '#ffffff', size: 1.375 },
      variation_font:  { family: 'Lato', weight: '400', color: '#cccccc', size: 1 },
      description_font: null,
      divider_color: '#444444',
      divider_width: 1,
      divider_style: 'solid',
      area_background: 'transparent',
      area_border: null
    }
  };

  // ── Reference Resolution ───────────────────────────────────────────────
  // Build a context object once per render holding palette/scale/spacing lookups,
  // then resolve $name references against it.

  function buildContext(layout, theme) {
    return {
      palette:    Object.assign({}, DEFAULT_PALETTE, theme.palette || {}),
      typeScale:  Object.assign({}, DEFAULT_TYPE_SCALE, theme.type_scale || {}),
      spacing:    Object.assign({}, DEFAULT_SPACING, layout.spacing || {})
    };
  }

  function resolveColorRef(val, ctx) {
    if (typeof val !== 'string' || val.charAt(0) !== '$') return val;
    var key = val.slice(1);
    return ctx.palette[key] != null ? ctx.palette[key] : val;
  }

  function resolveSpaceRef(val, ctx) {
    if (typeof val !== 'string' || val.charAt(0) !== '$') return val;
    var key = val.slice(1);
    return ctx.spacing[key] != null ? ctx.spacing[key] : val;
  }

  function resolveSizeRef(val, ctx) {
    if (typeof val !== 'string' || val.charAt(0) !== '$') return val;
    var key = val.slice(1);
    return ctx.typeScale[key] != null ? ctx.typeScale[key] : val;
  }

  // ── Unit Resolution Utilities ──────────────────────────────────────────

  function resolveH(val, vpW, ctx) {
    if (ctx) val = resolveSpaceRef(val, ctx);
    if (val == null) return 0;
    if (typeof val === 'string') {
      if (val.indexOf('px') !== -1) return parseFloat(val);
      return parseFloat(val);
    }
    return val / 100 * vpW;
  }

  function resolveV(val, vpH, ctx) {
    if (ctx) val = resolveSpaceRef(val, ctx);
    if (val == null) return 0;
    if (typeof val === 'string') {
      if (val.indexOf('px') !== -1) return parseFloat(val);
      return parseFloat(val);
    }
    return val / 100 * vpH;
  }

  function resolveFont(val, baseFontSize, ctx) {
    if (ctx) val = resolveSizeRef(val, ctx);
    if (val == null) return undefined;
    if (typeof val === 'string') return val; // raw CSS like "44px"
    return (val * baseFontSize) + 'px';
  }

  // ── General Utilities ──────────────────────────────────────────────────

  function merge(defaults, overrides) {
    if (!overrides) return JSON.parse(JSON.stringify(defaults));
    var result = JSON.parse(JSON.stringify(defaults));
    for (var key in overrides) {
      if (!overrides.hasOwnProperty(key)) continue;
      if (
        typeof overrides[key] === 'object' &&
        overrides[key] !== null &&
        !Array.isArray(overrides[key]) &&
        typeof result[key] === 'object' &&
        result[key] !== null
      ) {
        result[key] = merge(result[key], overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
    return result;
  }

  function normalizePadding(val, fallback) {
    if (val == null && fallback != null) return normalizePadding(fallback);
    if (val == null) return { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof val === 'number') return { top: val, right: val, bottom: val, left: val };
    return {
      top: val.top || 0,
      right: val.right || 0,
      bottom: val.bottom || 0,
      left: val.left || 0
    };
  }

  function resolvePaddingPx(pad, vpW, vpH, ctx) {
    return {
      top: resolveV(pad.top, vpH, ctx),
      right: resolveH(pad.right, vpW, ctx),
      bottom: resolveV(pad.bottom, vpH, ctx),
      left: resolveH(pad.left, vpW, ctx)
    };
  }

  function paddingCSS(p) {
    return p.top + 'px ' + p.right + 'px ' + p.bottom + 'px ' + p.left + 'px';
  }

  function formatPrice(value) {
    if (value == null || value === '') return '';
    var str = String(value).trim();
    if (str.charAt(0) === '$') return str;
    var num = parseFloat(str);
    if (isNaN(num)) return str;
    return '$' + num.toFixed(2);
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

  // ── Google Fonts ───────────────────────────────────────────────────────

  var loadedFontFamilies = {};

  function collectFonts(data, themeArg) {
    var fonts = {};
    function addFont(fontObj) {
      if (!fontObj || !fontObj.family) return;
      var family = fontObj.family;
      var isGoogle = GOOGLE_FONTS.some(function (gf) {
        return gf.toLowerCase() === family.toLowerCase();
      });
      if (!isGoogle) return;
      if (!fonts[family]) fonts[family] = {};
      var w = fontObj.weight || '400';
      fonts[family][w] = true;
    }

    if (data.header && data.header.elements) {
      data.header.elements.forEach(function (e) {
        if (e.type === 'text' && e.font) addFont(e.font);
      });
    }

    var theme = themeArg || data.theme || {};
    addFont(theme.area_title_font);
    addFont(theme.item_name_font);
    addFont(theme.item_price_font);
    addFont(theme.variation_font);
    addFont(theme.description_font);

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

  // ── CSS Custom Properties ──────────────────────────────────────────────

  function buildCSSVars(layout, theme, vpW, vpH, baseFontSize, ctx) {
    var vars = [];

    var bg = resolveColorRef(theme.background, ctx);
    if (bg) vars.push('--ds-background-color: ' + bg);

    var fontKeys = ['area_title', 'item_name', 'item_price', 'variation'];
    fontKeys.forEach(function (key) {
      var fontObj = theme[key + '_font'];
      if (!fontObj) return;
      var prefix = '--ds-' + key.replace(/_/g, '-') + '-font';
      if (fontObj.family) vars.push(prefix + "-family: '" + fontObj.family + "', sans-serif");
      if (fontObj.weight) vars.push(prefix + '-weight: ' + fontObj.weight);
      if (fontObj.color) vars.push(prefix + '-color: ' + resolveColorRef(fontObj.color, ctx));
      if (fontObj.size != null) vars.push(prefix + '-size: ' + resolveFont(fontObj.size, baseFontSize, ctx));
    });

    if (theme.divider_color) vars.push('--ds-divider-color: ' + resolveColorRef(theme.divider_color, ctx));
    if (theme.divider_width != null) vars.push('--ds-divider-width: ' + theme.divider_width + 'px');
    if (theme.divider_style) vars.push('--ds-divider-style: ' + theme.divider_style);
    if (theme.area_background) vars.push('--ds-area-background: ' + resolveColorRef(theme.area_background, ctx));

    return vars;
  }

  function injectThemeStyle(vars) {
    var id = 'ds-theme-overrides';
    var existing = document.getElementById(id);
    if (existing) existing.remove();

    var style = document.createElement('style');
    style.id = id;
    style.textContent = ':root {\n  ' + vars.join(';\n  ') + ';\n}';
    document.head.appendChild(style);
  }

  // ── Spacing Resolution ─────────────────────────────────────────────────

  function resolveSpacing(layout, vpW, vpH, ctx) {
    var xSp = layout.x_spacer;
    var ySp = layout.y_spacer;

    var viewportPadding;
    if (layout.viewport_padding != null) {
      var rawPad = normalizePadding(layout.viewport_padding);
      viewportPadding = resolvePaddingPx(rawPad, vpW, vpH, ctx);
    } else {
      viewportPadding = {
        top: resolveV(ySp, vpH, ctx),
        right: resolveH(xSp, vpW, ctx),
        bottom: resolveV(ySp, vpH, ctx),
        left: resolveH(xSp, vpW, ctx)
      };
    }

    var containerGutter = (layout.container && layout.container.gutter != null)
      ? resolveH(layout.container.gutter, vpW, ctx)
      : resolveH(xSp, vpW, ctx);

    var areaGap = (layout.area_gap != null)
      ? resolveV(layout.area_gap, vpH, ctx)
      : resolveV(ySp, vpH, ctx);

    return {
      viewportPadding: viewportPadding,
      containerGutter: containerGutter,
      areaGap: areaGap
    };
  }

  // ── Style Override Utility ──────────────────────────────────────────────

  function applyFontOverride(element, fontObj, baseFontSize, ctx) {
    if (!fontObj) return;
    if (fontObj.family) element.style.fontFamily = "'" + fontObj.family + "', sans-serif";
    if (fontObj.weight) element.style.fontWeight = fontObj.weight;
    if (fontObj.color) element.style.color = ctx ? resolveColorRef(fontObj.color, ctx) : fontObj.color;
    if (fontObj.size != null) element.style.fontSize = resolveFont(fontObj.size, baseFontSize, ctx);
  }

  // ── DOM Builders ───────────────────────────────────────────────────────

  function buildHeaderText(element, baseFontSize, ctx) {
    var div = el('div', 'ds-header-text');
    if (element.id) div.setAttribute('data-ds-id', element.id);
    div.textContent = element.text || '';
    applyFontOverride(div, element.font, baseFontSize, ctx);
    return div;
  }

  function buildHeaderLogo(element, vpH, ctx) {
    var img = el('img', 'ds-header-logo', { src: element.src, alt: 'Logo' });
    if (element.id) img.setAttribute('data-ds-id', element.id);
    var maxH = element.max_height != null ? element.max_height : 4;
    img.style.maxHeight = resolveV(maxH, vpH, ctx) + 'px';
    return img;
  }

  function buildHeaderRegion(header, vpW, vpH, baseFontSize, ctx) {
    if (!header) return null;
    var region = el('div', 'ds-header-region');

    if (header.height != null) {
      // min-height so the header grows if content is larger than the configured height
      region.style.minHeight = resolveV(header.height, vpH, ctx) + 'px';
    }
    if (header.padding != null) {
      var rawPad = normalizePadding(header.padding);
      var pad = resolvePaddingPx(rawPad, vpW, vpH, ctx);
      region.style.padding = paddingCSS(pad);
    }
    if (header.background) {
      region.style.background = resolveColorRef(header.background, ctx);
    }
    if (header.divider && header.divider.color) {
      var w = (header.divider.width != null) ? header.divider.width : 1;
      region.style.borderBottom = w + 'px solid ' + resolveColorRef(header.divider.color, ctx);
    }

    var leftCol = el('div', 'ds-header-col ds-header-col--left');
    var centerCol = el('div', 'ds-header-col ds-header-col--center');
    var rightCol = el('div', 'ds-header-col ds-header-col--right');

    // Build elements first so we can detect which columns are empty
    var elements = header.elements || [];
    elements.forEach(function (element) {
      var node = null;
      if (element.type === 'text') {
        node = buildHeaderText(element, baseFontSize, ctx);
      } else if (element.type === 'logo' && element.src) {
        node = buildHeaderLogo(element, vpH, ctx);
      }
      if (!node) return;

      var pos = element.position || (element.type === 'logo' ? 'left' : 'center');
      if (pos === 'left') leftCol.appendChild(node);
      else if (pos === 'right') rightCol.appendChild(node);
      else centerCol.appendChild(node);
    });

    // Column sizing rules:
    //   - explicit "fit" → wraps to content
    //   - explicit "fill" → takes available space (flex: 1 1 0)
    //   - no setting + empty column → collapses to zero (no wasted space)
    //   - no setting + has content → flex: 1 1 auto (content width + share of remaining)
    var cols = header.columns || {};
    function colFlex(cfg, columnEl) {
      var mode = cfg && cfg.mode;
      if (mode === 'fit') return '0 0 auto';
      if (mode === 'fill') return '1 1 0';
      // No explicit setting
      if (columnEl.children.length === 0) return '0 0 0';
      return '1 1 auto';
    }
    leftCol.style.flex = colFlex(cols.left, leftCol);
    centerCol.style.flex = colFlex(cols.center, centerCol);
    rightCol.style.flex = colFlex(cols.right, rightCol);

    region.appendChild(leftCol);
    region.appendChild(centerCol);
    region.appendChild(rightCol);

    return region;
  }

  function buildItem(item, areaDefaults, vpW, vpH, baseFontSize, ctx, layout) {
    var hasPrice = item.price != null && item.price !== '';
    var hasVariations = item.variations && item.variations.length > 0;

    if (item.hide_if_empty && !hasPrice && !hasVariations) {
      return null;
    }

    var defaultItemPad = (layout && layout.item_padding != null)
      ? layout.item_padding
      : { top: 0.4, right: 0, bottom: 0.4, left: 0 };
    var rawPad = normalizePadding(item.padding, defaultItemPad);
    var itemPadding = resolvePaddingPx(rawPad, vpW, vpH, ctx);

    var itemAlign = item.align || areaDefaults.itemAlign || 'left';
    var priceAlign = areaDefaults.priceAlign || 'right';

    var wrap = el('div', 'ds-item');
    if (item.id) wrap.setAttribute('data-ds-id', item.id);
    wrap.style.padding = paddingCSS(itemPadding);

    var row = el('div', 'ds-item__row');
    if (priceAlign === 'left') {
      row.style.justifyContent = 'flex-start';
      row.style.gap = resolveH(0.4, vpW) + 'px';
    }

    var itemStyle = item.style || {};
    var nameFont = itemStyle.name_font || areaDefaults.nameFont;
    var priceFont = itemStyle.price_font || areaDefaults.priceFont;

    var nameEl = el('span', 'ds-item__name');
    nameEl.textContent = item.name;
    if (itemAlign !== 'left') {
      nameEl.style.textAlign = itemAlign;
    }
    applyFontOverride(nameEl, nameFont, baseFontSize, ctx);
    row.appendChild(nameEl);

    // Show base price if present (even when variations exist)
    if (hasPrice) {
      var priceEl = el('span', 'ds-item__price');
      priceEl.textContent = formatPrice(item.price);
      applyFontOverride(priceEl, priceFont, baseFontSize, ctx);
      row.appendChild(priceEl);
    }

    wrap.appendChild(row);

    if (item.description) {
      var desc = el('div', 'ds-item__description');
      desc.textContent = item.description;
      if (itemAlign !== 'left') {
        desc.style.textAlign = itemAlign;
      }
      wrap.appendChild(desc);
    }

    // Variations
    if (hasVariations) {
      var showPrices = item.show_variation_prices !== false;
      var inline = item.variations_inline !== false;
      var varList = el('div', 'ds-variations' + (inline ? ' ds-variations--inline' : ''));
      item.variations.forEach(function (v) {
        var vRow = el('div', 'ds-variation');
        if (v.id) vRow.setAttribute('data-ds-id', v.id);
        var vName = el('span', 'ds-variation__name');
        vName.textContent = v.name;
        vRow.appendChild(vName);
        if (showPrices) {
          var vPrice = el('span', 'ds-variation__price');
          vPrice.textContent = formatPrice(v.price);
          vRow.appendChild(vPrice);
        }
        varList.appendChild(vRow);
      });
      wrap.appendChild(varList);
    }

    return wrap;
  }

  function buildLeafArea(area, spacing, vpW, vpH, baseFontSize, ctx, layout) {
    var section = el('div', 'ds-area');
    if (area.id) {
      section.setAttribute('data-area-id', area.id);
      section.setAttribute('data-ds-id', area.id);
    }

    // Area padding (uses layout.area_padding as default if not set on area)
    var defaultAreaPad = (layout && layout.area_padding != null) ? layout.area_padding : 0;
    var rawPad = normalizePadding(area.padding, defaultAreaPad);
    var areaPad = resolvePaddingPx(rawPad, vpW, vpH, ctx);
    section.style.padding = paddingCSS(areaPad);

    // Vertical alignment in parent grid
    if (area.valign) {
      var valignMap = { top: 'start', center: 'center', bottom: 'end' };
      section.style.alignSelf = valignMap[area.valign] || 'start';
    }

    // Area-level style overrides
    var areaStyle = area.style || {};
    if (areaStyle.background) section.style.background = resolveColorRef(areaStyle.background, ctx);
    if (areaStyle.divider_color) section.style.setProperty('--ds-divider-color', resolveColorRef(areaStyle.divider_color, ctx));

    // Area title
    if (area.title) {
      var titleAlign = area.align || 'left';
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      if (titleAlign !== 'left') {
        titleEl.style.textAlign = titleAlign;
      }
      applyFontOverride(titleEl, areaStyle.title_font, baseFontSize, ctx);
      section.appendChild(titleEl);
    }

    // Item grid
    var cols = area.column_count || 1;
    var grid = el('div', 'ds-items ds-items--cols-' + Math.min(cols, 3));
    var defaultItemGutter = (layout && layout.item_gutter != null) ? layout.item_gutter : 0.4;
    var gutter = (area.gutter != null) ? resolveH(area.gutter, vpW, ctx) : resolveH(defaultItemGutter, vpW, ctx);
    grid.style.columnGap = gutter + 'px';
    grid.style.rowGap = '0px';

    var areaDefaults = {
      itemAlign: area.item_align || 'left',
      priceAlign: area.price_align || 'right',
      nameFont: areaStyle.item_name_font || null,
      priceFont: areaStyle.item_price_font || null,
      variationFont: areaStyle.variation_font || null
    };

    (area.items || []).forEach(function (item) {
      var node = buildItem(item, areaDefaults, vpW, vpH, baseFontSize, ctx, layout);
      if (node) grid.appendChild(node);
    });

    section.appendChild(grid);
    return section;
  }

  function buildAreaGroup(area, spacing, depth, vpW, vpH, baseFontSize, ctx, layout) {
    var section = el('div', 'ds-area ds-area-group');
    if (area.id) {
      section.setAttribute('data-area-id', area.id);
      section.setAttribute('data-ds-id', area.id);
    }

    // Area padding
    var defaultAreaPad = (layout && layout.area_padding != null) ? layout.area_padding : 0;
    var rawPad = normalizePadding(area.padding, defaultAreaPad);
    var areaPad = resolvePaddingPx(rawPad, vpW, vpH, ctx);
    section.style.padding = paddingCSS(areaPad);

    // Vertical alignment in parent grid
    if (area.valign) {
      var valignMap = { top: 'start', center: 'center', bottom: 'end' };
      section.style.alignSelf = valignMap[area.valign] || 'start';
    }

    // Area-level style overrides
    var areaStyle = area.style || {};
    if (areaStyle.background) section.style.background = resolveColorRef(areaStyle.background, ctx);

    // Group title (optional)
    if (area.title) {
      var titleAlign = area.align || 'left';
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      if (titleAlign !== 'left') {
        titleEl.style.textAlign = titleAlign;
      }
      applyFontOverride(titleEl, areaStyle.title_font, baseFontSize, ctx);
      section.appendChild(titleEl);
    }

    // Sub-areas grid
    var subCols = area.columns || 1;
    var subGutter = (area.gutter != null) ? resolveH(area.gutter, vpW, ctx) : spacing.containerGutter;
    var subGap = spacing.areaGap;

    var grid = el('div', 'ds-area-group__grid');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(' + subCols + ', 1fr)';
    grid.style.columnGap = subGutter + 'px';
    grid.style.rowGap = subGap + 'px';

    (area.areas || []).forEach(function (subArea) {
      grid.appendChild(buildArea(subArea, spacing, depth + 1, vpW, vpH, baseFontSize, ctx, layout));
    });

    section.appendChild(grid);
    return section;
  }

  function buildArea(area, spacing, depth, vpW, vpH, baseFontSize, ctx, layout) {
    depth = depth || 0;
    if (depth > MAX_NESTING_DEPTH) {
      console.warn('[MenuRenderer] Max nesting depth exceeded, skipping area:', area.id);
      return el('div');
    }

    if (area.areas && area.areas.length > 0) {
      return buildAreaGroup(area, spacing, depth, vpW, vpH, baseFontSize, ctx, layout);
    }
    return buildLeafArea(area, spacing, vpW, vpH, baseFontSize, ctx, layout);
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

    // Apply preset as defaults under user theme/layout (preset < user)
    var presetName = data.theme && data.theme.preset;
    var preset = presetName && PRESETS[presetName] ? PRESETS[presetName] : null;

    var baseLayout = preset && preset.layout ? merge(DEFAULTS.layout, preset.layout) : DEFAULTS.layout;
    var baseTheme  = preset && preset.theme  ? merge(DEFAULTS.theme,  preset.theme)  : DEFAULTS.theme;

    var layout = merge(baseLayout, data.layout);
    var theme  = merge(baseTheme,  data.theme);
    var areas = data.areas || [];

    // Build resolution context (palette / type_scale / spacing lookups)
    var ctx = buildContext(layout, theme);

    // Resolve viewport dimensions
    var res = RESOLUTION_MAP[layout.resolution] || RESOLUTION_MAP['4k'];
    var isPortrait = layout.orientation === 'portrait';
    var vpW = isPortrait ? res.h : res.w;
    var vpH = isPortrait ? res.w : res.h;

    // Base font size for em resolution
    var baseFontSize = BASE_FONT_MAP[layout.resolution] || BASE_FONT_MAP['4k'];

    // Resolve spacing (% → px)
    var spacing = resolveSpacing(layout, vpW, vpH, ctx);

    // Inject Google Fonts
    var fontMap = collectFonts(data, theme);
    injectGoogleFonts(fontMap);

    // Inject CSS custom property overrides (resolved to px and against ctx)
    var cssVars = buildCSSVars(layout, theme, vpW, vpH, baseFontSize, ctx);
    injectThemeStyle(cssVars);

    // Clear target
    target.innerHTML = '';
    target.removeAttribute('style');

    // Viewport
    var viewport = el('div', 'ds-viewport');
    viewport.style.width = vpW + 'px';
    viewport.style.height = vpH + 'px';
    viewport.style.fontSize = baseFontSize + 'px';
    var bg = resolveColorRef(theme.background, ctx);
    if (bg) viewport.style.background = bg;

    // Header (only rendered if header is defined)
    if (data.header) {
      var headerRegion = buildHeaderRegion(data.header, vpW, vpH, baseFontSize, ctx);
      if (headerRegion) viewport.appendChild(headerRegion);
    }

    // Areas container — CSS grid
    var containerCols = (layout.container && layout.container.columns) || 1;
    var areasWrap = el('div', 'ds-areas');
    areasWrap.style.display = 'grid';
    areasWrap.style.gridTemplateColumns = 'repeat(' + containerCols + ', 1fr)';
    areasWrap.style.columnGap = spacing.containerGutter + 'px';
    areasWrap.style.rowGap = spacing.areaGap + 'px';
    areasWrap.style.padding = paddingCSS(spacing.viewportPadding);

    areas.forEach(function (area) {
      areasWrap.appendChild(buildArea(area, spacing, 0, vpW, vpH, baseFontSize, ctx, layout));
    });

    viewport.appendChild(areasWrap);
    target.appendChild(viewport);

    // Apply scaling — preview mode fits to browser viewport
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

  var KNOWN_LAYOUT_KEYS = [
    'resolution', 'orientation', 'mode', 'background_color',
    'x_spacer', 'y_spacer', 'viewport_padding', 'area_gap',
    'container'
  ];
  var KNOWN_AREA_KEYS = [
    'id', 'title', 'padding', 'gutter', 'align', 'valign',
    'item_align', 'price_align', 'column_count', 'columns',
    'items', 'areas', 'style'
  ];
  var KNOWN_ITEM_KEYS = [
    'id', 'name', 'description', 'price', 'variations',
    'padding', 'align', 'hide_if_empty',
    'show_variation_prices', 'variations_inline', 'style'
  ];

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
      if (lo.viewport_padding != null) {
        validatePadding(lo.viewport_padding, 'layout.viewport_padding', errors);
      }
      Object.keys(lo).forEach(function (k) {
        if (KNOWN_LAYOUT_KEYS.indexOf(k) === -1) {
          warnings.push({ path: 'layout.' + k, message: 'Unknown field' });
        }
      });
    }

    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  function validatePadding(val, path, errors) {
    if (typeof val === 'number') return;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      var validKeys = ['top', 'right', 'bottom', 'left'];
      Object.keys(val).forEach(function (k) {
        if (validKeys.indexOf(k) === -1) {
          errors.push({ path: path + '.' + k, message: 'Unknown padding key' });
        } else if (typeof val[k] !== 'number') {
          errors.push({ path: path + '.' + k, message: 'Must be a number' });
        }
      });
      return;
    }
    errors.push({ path: path, message: 'Must be a number or { top, right, bottom, left } object' });
  }

  function validateArea(area, path, errors, warnings) {
    if (!area || typeof area !== 'object') {
      errors.push({ path: path, message: 'Must be an object' });
      return;
    }
    if (!area.id) {
      errors.push({ path: path + '.id', message: 'Required field missing' });
    }
    if (area.align && VALID_ALIGNS.indexOf(area.align) === -1) {
      errors.push({ path: path + '.align', message: 'Must be one of: ' + VALID_ALIGNS.join(', ') });
    }
    if (area.valign && VALID_VALIGNS.indexOf(area.valign) === -1) {
      errors.push({ path: path + '.valign', message: 'Must be one of: ' + VALID_VALIGNS.join(', ') });
    }
    if (area.item_align && VALID_ALIGNS.indexOf(area.item_align) === -1) {
      errors.push({ path: path + '.item_align', message: 'Must be one of: ' + VALID_ALIGNS.join(', ') });
    }
    if (area.price_align && VALID_PRICE_ALIGNS.indexOf(area.price_align) === -1) {
      errors.push({ path: path + '.price_align', message: 'Must be one of: ' + VALID_PRICE_ALIGNS.join(', ') });
    }
    if (area.column_count != null && typeof area.column_count !== 'number') {
      errors.push({ path: path + '.column_count', message: 'Must be a number' });
    }
    if (area.padding != null) {
      validatePadding(area.padding, path + '.padding', errors);
    }

    Object.keys(area).forEach(function (k) {
      if (KNOWN_AREA_KEYS.indexOf(k) === -1) {
        warnings.push({ path: path + '.' + k, message: 'Unknown field' });
      }
    });

    if (area.areas && Array.isArray(area.areas)) {
      if (area.items && area.items.length > 0) {
        warnings.push({ path: path, message: 'Has both items and areas — items will be ignored' });
      }
      if (area.areas.length === 0) {
        warnings.push({ path: path + '.areas', message: 'Sub-areas array is empty' });
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
    if (!item.id) {
      errors.push({ path: path + '.id', message: 'Required field missing' });
    }
    if (!item.name) {
      errors.push({ path: path + '.name', message: 'Required field missing' });
    }
    if (!item.price && (!item.variations || item.variations.length === 0)) {
      if (!item.hide_if_empty) {
        warnings.push({ path: path, message: 'Item has no price and no variations' });
      }
    }
    if (item.variations && !Array.isArray(item.variations)) {
      errors.push({ path: path + '.variations', message: 'Must be an array' });
    }
    if (item.padding != null) {
      validatePadding(item.padding, path + '.padding', errors);
    }
    if (item.align && VALID_ALIGNS.indexOf(item.align) === -1) {
      errors.push({ path: path + '.align', message: 'Must be one of: ' + VALID_ALIGNS.join(', ') });
    }
    Object.keys(item).forEach(function (k) {
      if (KNOWN_ITEM_KEYS.indexOf(k) === -1) {
        warnings.push({ path: path + '.' + k, message: 'Unknown field' });
      }
    });
  }

  // Store last validation result for external access
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
    formatPrice: formatPrice,
    validate: validate,
    get lastValidation() { return lastValidation; }
  };

})();
