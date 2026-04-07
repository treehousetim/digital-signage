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

  // Defaults in the new unit system: spatial = %, fonts = em
  var DEFAULTS = {
    layout: {
      resolution: '4k',
      orientation: 'landscape',
      mode: 'display',
      background_color: '#1a1a1a',
      x_spacer: 1.25,
      y_spacer: 3,
      viewport_padding: null,
      area_gap: null,
      container: { columns: 1, gutter: null }
    },
    theme: {
      area_title_font: { family: 'Montserrat', weight: '600', color: '#f0c040', size: 1.75 },
      item_name_font: { family: 'Lato', weight: '400', color: '#ffffff', size: 1.375 },
      item_price_font: { family: 'Lato', weight: '700', color: '#ffffff', size: 1.375 },
      variation_font: { family: 'Lato', weight: '400', color: '#cccccc', size: 1 },
      divider_color: '#444444',
      area_background: 'transparent'
    }
  };

  // ── Unit Resolution Utilities ──────────────────────────────────────────

  function resolveH(val, vpW) {
    if (val == null) return 0;
    if (typeof val === 'string') {
      if (val.indexOf('px') !== -1) return parseFloat(val);
      return parseFloat(val);
    }
    return val / 100 * vpW;
  }

  function resolveV(val, vpH) {
    if (val == null) return 0;
    if (typeof val === 'string') {
      if (val.indexOf('px') !== -1) return parseFloat(val);
      return parseFloat(val);
    }
    return val / 100 * vpH;
  }

  function resolveFont(val, baseFontSize) {
    if (val == null) return undefined;
    if (typeof val === 'string') return val; // backward compat: "44px" used as-is
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

  function resolvePaddingPx(pad, vpW, vpH) {
    return {
      top: resolveV(pad.top, vpH),
      right: resolveH(pad.right, vpW),
      bottom: resolveV(pad.bottom, vpH),
      left: resolveH(pad.left, vpW)
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

  function collectFonts(data) {
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

    var layout = data.layout || {};
    if (layout.header && layout.header.elements) {
      layout.header.elements.forEach(function (e) {
        if (e.type === 'text' && e.font) addFont(e.font);
      });
    }

    var theme = data.theme || {};
    addFont(theme.area_title_font);
    addFont(theme.item_name_font);
    addFont(theme.item_price_font);
    addFont(theme.variation_font);

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

  function buildCSSVars(layout, theme, vpW, vpH, baseFontSize) {
    var vars = [];

    vars.push('--ds-background-color: ' + layout.background_color);

    var fontKeys = ['area_title', 'item_name', 'item_price', 'variation'];
    fontKeys.forEach(function (key) {
      var fontObj = theme[key + '_font'];
      if (!fontObj) return;
      var prefix = '--ds-' + key.replace(/_/g, '-') + '-font';
      if (fontObj.family) vars.push(prefix + "-family: '" + fontObj.family + "', sans-serif");
      if (fontObj.weight) vars.push(prefix + '-weight: ' + fontObj.weight);
      if (fontObj.color) vars.push(prefix + '-color: ' + fontObj.color);
      if (fontObj.size != null) vars.push(prefix + '-size: ' + resolveFont(fontObj.size, baseFontSize));
    });

    if (theme.divider_color) vars.push('--ds-divider-color: ' + theme.divider_color);
    if (theme.area_background) vars.push('--ds-area-background: ' + theme.area_background);

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

  function resolveSpacing(layout, vpW, vpH) {
    var xSp = layout.x_spacer;
    var ySp = layout.y_spacer;

    var viewportPadding;
    if (layout.viewport_padding != null) {
      var rawPad = normalizePadding(layout.viewport_padding);
      viewportPadding = resolvePaddingPx(rawPad, vpW, vpH);
    } else {
      viewportPadding = {
        top: resolveV(ySp, vpH),
        right: resolveH(xSp, vpW),
        bottom: resolveV(ySp, vpH),
        left: resolveH(xSp, vpW)
      };
    }

    var containerGutter = (layout.container && layout.container.gutter != null)
      ? resolveH(layout.container.gutter, vpW)
      : resolveH(xSp, vpW);

    var areaGap = (layout.area_gap != null)
      ? resolveV(layout.area_gap, vpH)
      : resolveV(ySp, vpH);

    return {
      viewportPadding: viewportPadding,
      containerGutter: containerGutter,
      areaGap: areaGap
    };
  }

  // ── Style Override Utility ──────────────────────────────────────────────

  function applyFontOverride(element, fontObj, baseFontSize) {
    if (!fontObj) return;
    if (fontObj.family) element.style.fontFamily = "'" + fontObj.family + "', sans-serif";
    if (fontObj.weight) element.style.fontWeight = fontObj.weight;
    if (fontObj.color) element.style.color = fontObj.color;
    if (fontObj.size != null) element.style.fontSize = resolveFont(fontObj.size, baseFontSize);
  }

  // ── DOM Builders ───────────────────────────────────────────────────────

  function buildHeaderText(element, baseFontSize) {
    var div = el('div', 'ds-header-text');
    if (element.id) div.setAttribute('data-ds-id', element.id);
    div.textContent = element.text || '';
    applyFontOverride(div, element.font, baseFontSize);
    return div;
  }

  function buildHeaderLogo(element, vpH) {
    var img = el('img', 'ds-header-logo', { src: element.src, alt: 'Logo' });
    if (element.id) img.setAttribute('data-ds-id', element.id);
    var maxH = element.max_height != null ? element.max_height : 4;
    img.style.maxHeight = resolveV(maxH, vpH) + 'px';
    return img;
  }

  function buildHeaderRegion(header, vpW, vpH, baseFontSize) {
    if (!header) return null;
    var region = el('div', 'ds-header-region');

    if (header.height != null) {
      region.style.height = resolveV(header.height, vpH) + 'px';
    }
    if (header.padding != null) {
      var rawPad = normalizePadding(header.padding);
      var pad = resolvePaddingPx(rawPad, vpW, vpH);
      region.style.padding = paddingCSS(pad);
    }
    if (header.background) {
      region.style.background = header.background;
    }
    if (header.divider && header.divider.color) {
      var w = (header.divider.width != null) ? header.divider.width : 1;
      region.style.borderBottom = w + 'px solid ' + header.divider.color;
    }

    var leftCol = el('div', 'ds-header-col ds-header-col--left');
    var centerCol = el('div', 'ds-header-col ds-header-col--center');
    var rightCol = el('div', 'ds-header-col ds-header-col--right');

    var elements = header.elements || [];
    elements.forEach(function (element) {
      var node = null;
      if (element.type === 'text') {
        node = buildHeaderText(element, baseFontSize);
      } else if (element.type === 'logo' && element.src) {
        node = buildHeaderLogo(element, vpH);
      }
      if (!node) return;

      var pos = element.position || (element.type === 'logo' ? 'left' : 'center');
      if (pos === 'left') leftCol.appendChild(node);
      else if (pos === 'right') rightCol.appendChild(node);
      else centerCol.appendChild(node);
    });

    region.appendChild(leftCol);
    region.appendChild(centerCol);
    region.appendChild(rightCol);

    return region;
  }

  function buildItem(item, areaDefaults, vpW, vpH, baseFontSize) {
    var hasPrice = item.price != null && item.price !== '';
    var hasVariations = item.variations && item.variations.length > 0;

    if (item.hide_if_empty && !hasPrice && !hasVariations) {
      return null;
    }

    var rawPad = normalizePadding(item.padding, { top: 0.4, right: 0, bottom: 0.4, left: 0 });
    var itemPadding = resolvePaddingPx(rawPad, vpW, vpH);

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
    applyFontOverride(nameEl, nameFont, baseFontSize);
    row.appendChild(nameEl);

    // Show base price if present (even when variations exist)
    if (hasPrice) {
      var priceEl = el('span', 'ds-item__price');
      priceEl.textContent = formatPrice(item.price);
      applyFontOverride(priceEl, priceFont, baseFontSize);
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

  function buildLeafArea(area, spacing, vpW, vpH, baseFontSize) {
    var section = el('div', 'ds-area');
    if (area.id) {
      section.setAttribute('data-area-id', area.id);
      section.setAttribute('data-ds-id', area.id);
    }

    // Area padding
    var rawPad = normalizePadding(area.padding, 0);
    var areaPad = resolvePaddingPx(rawPad, vpW, vpH);
    section.style.padding = paddingCSS(areaPad);

    // Vertical alignment in parent grid
    if (area.valign) {
      var valignMap = { top: 'start', center: 'center', bottom: 'end' };
      section.style.alignSelf = valignMap[area.valign] || 'start';
    }

    // Area-level style overrides
    var areaStyle = area.style || {};
    if (areaStyle.background) section.style.background = areaStyle.background;
    if (areaStyle.divider_color) section.style.setProperty('--ds-divider-color', areaStyle.divider_color);

    // Area title
    if (area.title) {
      var titleAlign = area.align || 'left';
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      if (titleAlign !== 'left') {
        titleEl.style.textAlign = titleAlign;
      }
      applyFontOverride(titleEl, areaStyle.title_font, baseFontSize);
      section.appendChild(titleEl);
    }

    // Item grid
    var cols = area.column_count || 1;
    var grid = el('div', 'ds-items ds-items--cols-' + Math.min(cols, 3));
    var gutter = (area.gutter != null) ? resolveH(area.gutter, vpW) : resolveH(0.4, vpW);
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
      var node = buildItem(item, areaDefaults, vpW, vpH, baseFontSize);
      if (node) grid.appendChild(node);
    });

    section.appendChild(grid);
    return section;
  }

  function buildAreaGroup(area, spacing, depth, vpW, vpH, baseFontSize) {
    var section = el('div', 'ds-area ds-area-group');
    if (area.id) {
      section.setAttribute('data-area-id', area.id);
      section.setAttribute('data-ds-id', area.id);
    }

    // Area padding
    var rawPad = normalizePadding(area.padding, 0);
    var areaPad = resolvePaddingPx(rawPad, vpW, vpH);
    section.style.padding = paddingCSS(areaPad);

    // Vertical alignment in parent grid
    if (area.valign) {
      var valignMap = { top: 'start', center: 'center', bottom: 'end' };
      section.style.alignSelf = valignMap[area.valign] || 'start';
    }

    // Area-level style overrides
    var areaStyle = area.style || {};
    if (areaStyle.background) section.style.background = areaStyle.background;

    // Group title (optional)
    if (area.title) {
      var titleAlign = area.align || 'left';
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      if (titleAlign !== 'left') {
        titleEl.style.textAlign = titleAlign;
      }
      applyFontOverride(titleEl, areaStyle.title_font, baseFontSize);
      section.appendChild(titleEl);
    }

    // Sub-areas grid
    var subCols = area.columns || 1;
    var subGutter = (area.gutter != null) ? resolveH(area.gutter, vpW) : spacing.containerGutter;
    var subGap = spacing.areaGap;

    var grid = el('div', 'ds-area-group__grid');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(' + subCols + ', 1fr)';
    grid.style.columnGap = subGutter + 'px';
    grid.style.rowGap = subGap + 'px';

    (area.areas || []).forEach(function (subArea) {
      grid.appendChild(buildArea(subArea, spacing, depth + 1, vpW, vpH, baseFontSize));
    });

    section.appendChild(grid);
    return section;
  }

  function buildArea(area, spacing, depth, vpW, vpH, baseFontSize) {
    depth = depth || 0;
    if (depth > MAX_NESTING_DEPTH) {
      console.warn('[MenuRenderer] Max nesting depth exceeded, skipping area:', area.id);
      return el('div');
    }

    if (area.areas && area.areas.length > 0) {
      return buildAreaGroup(area, spacing, depth, vpW, vpH, baseFontSize);
    }
    return buildLeafArea(area, spacing, vpW, vpH, baseFontSize);
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

    var layout = merge(DEFAULTS.layout, data.layout);
    var theme = merge(DEFAULTS.theme, data.theme);
    var areas = data.areas || [];

    // Resolve viewport dimensions
    var res = RESOLUTION_MAP[layout.resolution] || RESOLUTION_MAP['4k'];
    var isPortrait = layout.orientation === 'portrait';
    var vpW = isPortrait ? res.h : res.w;
    var vpH = isPortrait ? res.w : res.h;

    // Base font size for em resolution
    var baseFontSize = BASE_FONT_MAP[layout.resolution] || BASE_FONT_MAP['4k'];

    // Resolve spacing (% → px)
    var spacing = resolveSpacing(layout, vpW, vpH);

    // Inject Google Fonts
    var fontMap = collectFonts(data);
    injectGoogleFonts(fontMap);

    // Inject CSS custom property overrides (resolved to px)
    var cssVars = buildCSSVars(layout, theme, vpW, vpH, baseFontSize);
    injectThemeStyle(cssVars);

    // Clear target
    target.innerHTML = '';
    target.removeAttribute('style');

    // Viewport
    var viewport = el('div', 'ds-viewport');
    viewport.style.width = vpW + 'px';
    viewport.style.height = vpH + 'px';
    viewport.style.fontSize = baseFontSize + 'px';

    // Header (only rendered if layout.header is defined)
    if (layout.header) {
      var headerRegion = buildHeaderRegion(layout.header, vpW, vpH, baseFontSize);
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
      areasWrap.appendChild(buildArea(area, spacing, 0, vpW, vpH, baseFontSize));
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
    'container', 'header'
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
