/**
 * Digital Signage Menu Renderer
 * A standalone, framework-free rendering engine that takes a JSON menu definition
 * and produces a pixel-perfect, full-screen display suitable for TVs and monitors.
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

  var SCALE_MAP = {
    '1080': 1.0,
    '2k': 1.5,
    '4k': 2.0
  };

  var GOOGLE_FONTS = [
    'Montserrat', 'Lato', 'Roboto', 'Open Sans', 'Oswald',
    'Raleway', 'Poppins', 'Playfair Display', 'Merriweather', 'Nunito'
  ];

  var DEFAULTS = {
    layout: {
      resolution: '1080',
      orientation: 'landscape',
      background_color: '#1a1a1a',
      x_spacer: 24,
      y_spacer: 32,
      container: { columns: 1 }
    },
    theme: {
      area_title_font: { family: 'Montserrat', weight: '600', color: '#f0c040', size: '28px' },
      item_name_font: { family: 'Lato', weight: '400', color: '#ffffff', size: '22px' },
      item_price_font: { family: 'Lato', weight: '700', color: '#ffffff', size: '22px' },
      variation_font: { family: 'Lato', weight: '400', color: '#cccccc', size: '16px' },
      divider_color: '#444444',
      area_background: 'transparent'
    }
  };

  // ── Utilities ──────────────────────────────────────────────────────────

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
    if (layout.title && layout.title.font) addFont(layout.title.font);

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

  function buildCSSVars(layout, theme) {
    var vars = [];

    vars.push('--ds-background-color: ' + layout.background_color);
    vars.push('--ds-x-spacer: ' + layout.x_spacer + 'px');
    vars.push('--ds-y-spacer: ' + layout.y_spacer + 'px');

    if (layout.title && layout.title.font) {
      var tf = layout.title.font;
      if (tf.family) vars.push("--ds-title-font-family: '" + tf.family + "', sans-serif");
      if (tf.weight) vars.push('--ds-title-font-weight: ' + tf.weight);
      if (tf.color) vars.push('--ds-title-font-color: ' + tf.color);
      if (tf.size) vars.push('--ds-title-font-size: ' + tf.size);
    }

    var fontKeys = ['area_title', 'item_name', 'item_price', 'variation'];
    fontKeys.forEach(function (key) {
      var fontObj = theme[key + '_font'];
      if (!fontObj) return;
      var prefix = '--ds-' + key.replace(/_/g, '-') + '-font';
      if (fontObj.family) vars.push(prefix + "-family: '" + fontObj.family + "', sans-serif");
      if (fontObj.weight) vars.push(prefix + '-weight: ' + fontObj.weight);
      if (fontObj.color) vars.push(prefix + '-color: ' + fontObj.color);
      if (fontObj.size) vars.push(prefix + '-size: ' + fontObj.size);
    });

    if (theme.divider_color) vars.push('--ds-divider-color: ' + theme.divider_color);
    if (theme.area_background) vars.push('--ds-area-background: ' + theme.area_background);

    return vars;
  }

  function injectThemeStyle(vars, target) {
    var id = 'ds-theme-overrides';
    var existing = document.getElementById(id);
    if (existing) existing.remove();

    var style = document.createElement('style');
    style.id = id;
    style.textContent = ':root {\n  ' + vars.join(';\n  ') + ';\n}';
    document.head.appendChild(style);
  }

  // ── DOM Builders ───────────────────────────────────────────────────────

  function buildHeader(layout) {
    var header = el('div', 'ds-header');

    // Logo
    if (layout.logo && layout.logo.src) {
      var logo = layout.logo;
      var logoWrap = el('div', 'ds-logo ds-logo--' + (logo.x_align || 'left'));
      logoWrap.style.top = (logo.top_padding || 20) + 'px';
      if (logo.x_align === 'left') {
        logoWrap.style.left = layout.x_spacer + 'px';
      } else {
        logoWrap.style.right = layout.x_spacer + 'px';
      }
      var img = el('img', null, {
        src: logo.src,
        alt: 'Logo'
      });
      img.style.maxHeight = (logo.max_height || 80) + 'px';
      logoWrap.appendChild(img);
      header.appendChild(logoWrap);
    }

    // Title
    if (layout.title && layout.title.text) {
      var titleCfg = layout.title;
      var pos = titleCfg.position || {};
      var align = pos.x_align || 'center';
      var titleEl = el('div', 'ds-title ds-title--' + align);
      titleEl.textContent = titleCfg.text;
      titleEl.style.paddingTop = (pos.top_padding || 40) + 'px';
      titleEl.style.paddingLeft = layout.x_spacer + 'px';
      titleEl.style.paddingRight = layout.x_spacer + 'px';
      header.appendChild(titleEl);
    }

    return header;
  }

  function buildItem(item, theme) {
    var hasPrice = item.price != null && item.price !== '';
    var hasVariations = item.variations && item.variations.length > 0;

    if (item.hide_if_empty && !hasPrice && !hasVariations) {
      return null;
    }

    var wrap = el('div', 'ds-item');

    var row = el('div', 'ds-item__row');
    var nameEl = el('span', 'ds-item__name');
    nameEl.textContent = item.name;
    row.appendChild(nameEl);

    if (hasPrice && !hasVariations) {
      var priceEl = el('span', 'ds-item__price');
      priceEl.textContent = formatPrice(item.price);
      row.appendChild(priceEl);
    }

    wrap.appendChild(row);

    if (item.description) {
      var desc = el('div', 'ds-item__description');
      desc.textContent = item.description;
      wrap.appendChild(desc);
    }

    if (hasVariations) {
      var varList = el('ul', 'ds-variations');
      item.variations.forEach(function (v) {
        var li = el('li', 'ds-variation');
        var vName = el('span', 'ds-variation__name');
        vName.textContent = v.name;
        var vPrice = el('span', 'ds-variation__price');
        vPrice.textContent = formatPrice(v.price);
        li.appendChild(vName);
        li.appendChild(vPrice);
        varList.appendChild(li);
      });
      wrap.appendChild(varList);
    }

    return wrap;
  }

  function buildArea(area, layout) {
    var section = el('div', 'ds-area');

    if (area.title) {
      var titleEl = el('h2', 'ds-area__title');
      titleEl.textContent = area.title;
      section.appendChild(titleEl);
    }

    var cols = area.column_count || 1;
    var grid = el('div', 'ds-items ds-items--cols-' + Math.min(cols, 3));
    grid.style.columnGap = layout.x_spacer + 'px';

    (area.items || []).forEach(function (item) {
      var node = buildItem(item);
      if (node) grid.appendChild(node);
    });

    section.appendChild(grid);
    return section;
  }

  // ── Main Render ────────────────────────────────────────────────────────

  function render(data, target) {
    if (!target) throw new Error('MenuRenderer.render: target element is required');
    if (typeof data === 'string') data = JSON.parse(data);

    var layout = merge(DEFAULTS.layout, data.layout);
    var theme = merge(DEFAULTS.theme, data.theme);
    var areas = data.areas || [];

    // Inject Google Fonts
    var fontMap = collectFonts(data);
    injectGoogleFonts(fontMap);

    // Inject CSS custom property overrides
    var cssVars = buildCSSVars(layout, theme);
    injectThemeStyle(cssVars);

    // Clear target
    target.innerHTML = '';

    // Viewport
    var scale = SCALE_MAP[layout.resolution] || 1.0;
    var isPortrait = layout.orientation === 'portrait';
    var viewport = el('div', 'ds-viewport' + (isPortrait ? ' ds-viewport--portrait' : ''));
    viewport.style.transform = 'scale(' + scale + ')';

    // Header
    var header = buildHeader(layout);
    viewport.appendChild(header);

    // Areas container
    var containerCols = (layout.container && layout.container.columns) || 1;
    var areasWrap = el('div', 'ds-areas ds-areas--cols-' + containerCols);
    areasWrap.style.padding = layout.y_spacer + 'px ' + layout.x_spacer + 'px';
    areasWrap.style.gap = layout.y_spacer + 'px ' + layout.x_spacer + 'px';

    areas.forEach(function (area) {
      areasWrap.appendChild(buildArea(area, layout));
    });

    viewport.appendChild(areasWrap);
    target.appendChild(viewport);
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

    // Clear previous watcher for this key
    if (watchTimers[key]) clearInterval(watchTimers[key]);

    // Initial load
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

  // ── Public API ─────────────────────────────────────────────────────────

  return {
    render: render,
    loadFromUrl: loadFromUrl,
    watch: watch,
    /** Utility: format a price string as a dollar amount */
    formatPrice: formatPrice
  };

})();
