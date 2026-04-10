/**
 * Digital Signage Menu Editor
 * A standalone, embeddable GUI editor for creating and editing menu JSON definitions.
 * Works with the MenuRenderer for live preview, or standalone for JSON-only output.
 *
 * Usage:
 *   var instance = MenuEditor.create(document.getElementById('editor'), { data, onChange });
 *
 * @license MIT
 * @see https://github.com/treehousetim/digital-signage
 */
var MenuEditor = (function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────

  var GOOGLE_FONTS = [
    'Montserrat', 'Lato', 'Roboto', 'Open Sans', 'Oswald',
    'Raleway', 'Poppins', 'Playfair Display', 'Merriweather', 'Nunito'
  ];

  var FONT_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

  // Minimal blank template — relies on defaults for almost everything
  var BLANK_TEMPLATE = {
    uses: 'themes/dark.json',
    header: {
      elements: [
        { type: 'text', text: 'Menu' }
      ]
    },
    areas: [
      {
        title: 'Menu',
        items: [
          { name: 'Coffee', price: '3.00' }
        ]
      }
    ]
  };

  var MAX_UNDO = 50;

  // ── Utilities ──────────────────────────────────────────────────────────

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Store pure numeric strings as numbers, unit strings as strings.
  function coerceSpacing(v) {
    var n = Number(v);
    return isNaN(n) ? v : n;
  }

  // ArrowUp/Down on spacing text inputs: nudge the numeric component, preserve the unit suffix.
  // Shift → ×10 step, Alt/Option → ×0.1 step, default → 1.
  // No-op for var references ($name) or non-numeric values.
  function spacingArrowKey(e, input, onUpdate) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    var raw = input.value.trim();
    if (!raw || raw.charAt(0) === '$') return;
    var n = parseFloat(raw);
    if (isNaN(n)) return;
    e.preventDefault();
    var suffix = raw.replace(/^-?\d+\.?\d*/, '');
    var step = e.shiftKey ? 10 : (e.altKey ? 0.1 : 1);
    var delta = e.key === 'ArrowUp' ? step : -step;
    var newN = Math.round((n + delta) * 1000) / 1000;
    if (newN < 0) newN = 0;
    var formatted = String(newN) + suffix;
    input.value = formatted;
    onUpdate(coerceSpacing(formatted));
  }

  // ── Gradient Helpers ──────────────────────────────────────────────────

  // Split 'Ndeg, #color P%, ...' respecting nested parens (e.g. rgb(...))
  function splitGradientArgs(str) {
    var parts = [], depth = 0, cur = '';
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur) parts.push(cur);
    return parts;
  }

  // Parse 'linear-gradient(...)' → { angle, stops: [{color, pos}] } or null
  function parseLinearGradient(str) {
    if (typeof str !== 'string') return null;
    var m = str.match(/^linear-gradient\((.+)\)$/i);
    if (!m) return null;
    var parts = splitGradientArgs(m[1]);
    var angle = 135;
    var stops = [];
    var first = parts[0].trim();
    if (/^\d+deg$/i.test(first)) {
      angle = parseInt(first);
      parts = parts.slice(1);
    }
    parts.forEach(function (p) {
      p = p.trim();
      var m2 = p.match(/^(#[0-9a-fA-F]{3,8})\s+(\d+)%$/);
      if (m2) { stops.push({ color: m2[1], pos: parseInt(m2[2]) }); return; }
      if (/^#[0-9a-fA-F]{3,8}$/.test(p)) stops.push({ color: p, pos: null });
    });
    return stops.length >= 2 ? { angle: angle, stops: stops } : null;
  }

  // Compose { angle, stops } → CSS linear-gradient string
  function composeLinearGradient(angle, stops) {
    return 'linear-gradient(' + angle + 'deg, ' +
      stops.map(function (s) {
        return s.pos != null ? s.color + ' ' + s.pos + '%' : s.color;
      }).join(', ') + ')';
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

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ── Path Utilities ─────────────────────────────────────────────────────

  function parsePath(path) {
    if (!path) return [];
    return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  }

  function getAtPath(obj, path) {
    var parts = parsePath(path);
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setAtPath(obj, path, value) {
    var parts = parsePath(path);
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      var nextKey = parts[i + 1];
      if (cur[key] == null) {
        cur[key] = isNaN(nextKey) ? {} : [];
      }
      cur = cur[key];
    }
    var lastKey = parts[parts.length - 1];
    if (value === undefined) {
      if (Array.isArray(cur)) {
        cur.splice(parseInt(lastKey), 1);
      } else {
        delete cur[lastKey];
      }
    } else {
      cur[lastKey] = value;
    }
  }

  function parentPath(path) {
    var parts = parsePath(path);
    parts.pop();
    return parts.reduce(function (acc, part, i) {
      if (!isNaN(part)) return acc + '[' + part + ']';
      return acc ? acc + '.' + part : part;
    }, '');
  }

  function lastSegment(path) {
    var parts = parsePath(path);
    return parts[parts.length - 1];
  }

  // ── ID Generation ──────────────────────────────────────────────────────

  function scanMaxIds(data) {
    var counters = { area: 0, item: 0, var: 0 };

    function scan(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(scan);
        return;
      }
      if (obj.id) {
        var m = obj.id.match(/^(area|item|var)-(\d+)$/);
        if (m) {
          var type = m[1];
          var num = parseInt(m[2]);
          if (num > counters[type]) counters[type] = num;
        }
      }
      if (obj.areas) scan(obj.areas);
      if (obj.items) scan(obj.items);
      if (obj.variations) scan(obj.variations);
    }

    scan(data.areas || []);
    return counters;
  }

  function ensureVariationIds(data, counters) {
    function walk(areas) {
      if (!areas) return;
      areas.forEach(function (area) {
        if (area.areas) walk(area.areas);
        if (area.items) {
          area.items.forEach(function (item) {
            if (item.variations) {
              item.variations.forEach(function (v) {
                if (!v.id) {
                  counters.var++;
                  v.id = 'var-' + counters.var;
                }
              });
            }
          });
        }
      });
    }
    walk(data.areas);
  }

  // ── DataStore ──────────────────────────────────────────────────────────

  function createDataStore(initialData, onChange) {
    var data = deepClone(initialData || BLANK_TEMPLATE);
    var idCounters = scanMaxIds(data);
    ensureVariationIds(data, idCounters);
    var selectedPath = 'theme';
    var undoStack = [];
    var redoStack = [];
    var listeners = {};

    function emit(event) {
      (listeners[event] || []).forEach(function (fn) { fn(); });
    }

    function on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    }

    function snapshot() {
      undoStack.push(JSON.stringify(data));
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
    }

    var store = {
      getData: function () { return data; },
      getClone: function () { return deepClone(data); },
      getSelectedPath: function () { return selectedPath; },

      select: function (path) {
        selectedPath = path;
        emit('select');
      },

      update: function (path, value) {
        snapshot();
        setAtPath(data, path, value);
        emit('change');
        if (onChange) onChange(deepClone(data));
      },

      // Update without snapshotting — for continuous drag operations.
      // Call snapshotNow() once before the drag starts.
      updateSilent: function (path, value) {
        setAtPath(data, path, value);
        emit('change');
        if (onChange) onChange(deepClone(data));
      },

      snapshotNow: function () {
        snapshot();
      },

      replaceData: function (newData, resetUndo) {
        if (resetUndo) {
          undoStack = [];
          redoStack = [];
        } else {
          snapshot();
        }
        data = deepClone(newData);
        if (typeof MenuRenderer !== 'undefined' && MenuRenderer.autoAssignIds) {
          MenuRenderer.autoAssignIds(data);
        }
        idCounters = scanMaxIds(data);
        ensureVariationIds(data, idCounters);
        emit('change');
        if (onChange) onChange(deepClone(data));
      },

      addEntity: function (parentPath, type) {
        snapshot();
        var parent = getAtPath(data, parentPath);
        if (!parent) return;

        if (type === 'area') {
          idCounters.area++;
          var arr = parent.areas || parent;
          if (!Array.isArray(arr)) return;
          arr.push({ id: 'area-' + idCounters.area, title: 'New Area', column_count: 1, items: [] });
        } else if (type === 'subarea') {
          idCounters.area++;
          if (!parent.areas) parent.areas = [];
          parent.areas.push({ id: 'area-' + idCounters.area, title: 'New Sub-Area', column_count: 1, items: [] });
        } else if (type === 'item') {
          idCounters.item++;
          if (!parent.items) parent.items = [];
          parent.items.push({ id: 'item-' + idCounters.item, name: 'New Item', price: '0.00' });
        } else if (type === 'variation') {
          idCounters.var++;
          if (!parent.variations) parent.variations = [];
          parent.variations.push({ id: 'var-' + idCounters.var, name: 'New', price: '0.00' });
        } else if (type === 'header_text' || type === 'header_logo') {
          if (!idCounters.header) idCounters.header = 0;
          idCounters.header++;
          // Ensure header.elements exists
          if (!data.header) data.header = { elements: [] };
          if (!data.header.elements) data.header.elements = [];
          if (type === 'header_text') {
            data.header.elements.push({
              id: 'header-' + idCounters.header,
              type: 'text',
              text: 'New Text',
              position: 'center'
            });
          } else {
            data.header.elements.push({
              id: 'header-' + idCounters.header,
              type: 'logo',
              src: '',
              max_height: 4,
              position: 'left'
            });
          }
        }

        emit('change');
        if (onChange) onChange(deepClone(data));
      },

      deleteAtPath: function (path) {
        snapshot();
        var parts = parsePath(path);
        var idx = parts.pop();
        var parentObj = parts.length ? getAtPath(data, parts.join('.')) : data;
        if (Array.isArray(parentObj)) {
          parentObj.splice(parseInt(idx), 1);
        } else if (parentObj) {
          delete parentObj[idx];
        }
        if (selectedPath === path || selectedPath.indexOf(path + '.') === 0 || selectedPath.indexOf(path + '[') === 0) {
          selectedPath = parentPath(path) || 'theme';
          emit('select');
        }
        emit('change');
        if (onChange) onChange(deepClone(data));
      },

      moveItem: function (fromPath, toPath, position) {
        snapshot();
        var fromParts = parsePath(fromPath);
        var fromIdx = parseInt(fromParts.pop());
        var fromParent = getAtPath(data, fromParts.join('.'));
        if (!Array.isArray(fromParent)) return;

        var item = fromParent.splice(fromIdx, 1)[0];

        var toParts = parsePath(toPath);
        var toIdx = parseInt(toParts.pop());
        var toParent = getAtPath(data, toParts.join('.'));
        if (!Array.isArray(toParent)) return;

        if (position === 'after') toIdx++;
        toParent.splice(toIdx, 0, item);

        emit('change');
        if (onChange) onChange(deepClone(data));
      },

      duplicateAtPath: function (path) {
        snapshot();
        var parts = parsePath(path);
        var idx = parseInt(parts.pop());
        var parentObj = parts.length ? getAtPath(data, parts.join('.')) : data;
        if (!Array.isArray(parentObj)) return;
        var original = parentObj[idx];
        var clone = deepClone(original);
        // Generate new IDs
        function reId(obj) {
          if (!obj || typeof obj !== 'object') return;
          if (obj.id) {
            if (obj.id.match(/^area-/)) { idCounters.area++; obj.id = 'area-' + idCounters.area; }
            else if (obj.id.match(/^item-/)) { idCounters.item++; obj.id = 'item-' + idCounters.item; }
            else if (obj.id.match(/^var-/)) { idCounters.var++; obj.id = 'var-' + idCounters.var; }
            else { obj.id = obj.id + '-copy'; }
          }
          if (obj.areas) obj.areas.forEach(reId);
          if (obj.items) obj.items.forEach(reId);
          if (obj.variations) obj.variations.forEach(reId);
        }
        reId(clone);
        parentObj.splice(idx + 1, 0, clone);
        emit('change');
        if (onChange) onChange(deepClone(data));
      },

      undo: function () {
        if (!undoStack.length) return;
        redoStack.push(JSON.stringify(data));
        data = JSON.parse(undoStack.pop());
        emit('change');
        emit('select');
        if (onChange) onChange(deepClone(data));
      },

      redo: function () {
        if (!redoStack.length) return;
        undoStack.push(JSON.stringify(data));
        data = JSON.parse(redoStack.pop());
        emit('change');
        emit('select');
        if (onChange) onChange(deepClone(data));
      },

      canUndo: function () { return undoStack.length > 0; },
      canRedo: function () { return redoStack.length > 0; },

      nextId: function (type) {
        idCounters[type]++;
        return type + '-' + idCounters[type];
      },

      on: on
    };

    return store;
  }

  // ── Field Definitions ──────────────────────────────────────────────────

  var DEFAULT_FONT_ROLES = ['header', 'area_title', 'item_name', 'price', 'description'];
  var BUILT_IN_THEMES = [
    '',
    'themes/dark.json',
    'themes/light.json',
    'themes/warm.json',
    'themes/cool.json',
    'themes/mono.json'
  ];

  var FIELD_DEFS = {
    root: [
      { key: 'uses', type: 'select', options: BUILT_IN_THEMES, label: 'Theme (uses)' }
    ],
    layout: [
      { key: 'resolution', type: 'select', options: ['1080', '2k', '4k'], label: 'Resolution' },
      { key: 'orientation', type: 'select', options: ['landscape', 'portrait'], label: 'Orientation' },
      { key: 'viewport_padding', type: 'padding', label: 'Viewport Padding' },
      { key: 'row_gutter', type: 'text', label: 'Area Gap', placeholder: '24px  1em  2%  $lg' },
      { group: 'Container', fields: [
        { key: 'container.columns', type: 'select', options: ['1', '2', '3'], label: 'Columns' },
        { key: 'container.gutter', type: 'text', label: 'Gutter', placeholder: '24px  1em  2%  $lg' }
      ]}
    ],
    vars: [
      // Vars are key/value tables of design vars
      { key: 'palette', type: 'vars_palette', label: 'Palette (colors)' },
      { key: 'spacing', type: 'vars_map', label: 'Spacing' },
      { key: 'type_scale', type: 'vars_map', label: 'Type scale' }
    ],
    theme: [
      { group: 'Layout', fields: [
        { key: 'layout.resolution', type: 'select', options: ['1080', '2k', '4k'], label: 'Resolution' },
        { key: 'layout.orientation', type: 'select', options: ['landscape', 'portrait'], label: 'Orientation' },
        { key: 'layout.viewport_padding', type: 'padding', label: 'Viewport Padding' },
        { key: 'layout.row_gutter', type: 'text', label: 'Row Gutter', placeholder: '24px  1em  2%  $lg' },
        { key: 'layout.columns', type: 'select', options: ['1', '2', '3', '4', '5', '6'], label: 'Columns' },
        { key: 'layout.column_gutter', type: 'text', label: 'Column Gutter', placeholder: '24px  1em  2%  $lg' }
      ]},
      { group: 'Colors', fields: [
        { key: 'colors.background', type: 'background', label: 'Background' },
        { key: 'colors.surface', type: 'color', label: 'Surface' },
        { key: 'colors.text', type: 'color', label: 'Text' },
        { key: 'colors.muted', type: 'color', label: 'Muted' },
        { key: 'colors.accent', type: 'color', label: 'Accent' },
        { key: 'colors.divider', type: 'color', label: 'Divider' }
      ]},
      { group: 'Fonts', defaultCollapsed: true, type: 'fonts_editor', key: 'fonts' },
      { group: 'Dividers: Default', defaultCollapsed: true, fields: [
        { key: 'dividers.default.color', type: 'color', label: 'Color' },
        { key: 'dividers.default.width', type: 'number', label: 'Width (px)', step: 1 },
        { key: 'dividers.default.style', type: 'select', options: ['', 'solid', 'dashed', 'dotted'], label: 'Style' },
        { key: 'dividers.default.sides', type: 'sides', label: 'Sides' },
        { key: 'dividers.default.padding', type: 'text', label: 'Padding', placeholder: '8px  1em  2%  $xs' }
      ]},
      { group: 'Dividers: Header', defaultCollapsed: true, fields: [
        { key: 'dividers.header.color', type: 'color', label: 'Color' },
        { key: 'dividers.header.width', type: 'number', label: 'Width (px)', step: 1 },
        { key: 'dividers.header.style', type: 'select', options: ['', 'solid', 'dashed', 'dotted'], label: 'Style' },
        { key: 'dividers.header.sides', type: 'sides', label: 'Sides' },
        { key: 'dividers.header.padding', type: 'text', label: 'Padding', placeholder: '8px  1em  2%  $xs' }
      ]},
      { group: 'Dividers: Area', defaultCollapsed: true, fields: [
        { key: 'dividers.area.color', type: 'color', label: 'Color' },
        { key: 'dividers.area.width', type: 'number', label: 'Width (px)', step: 1 },
        { key: 'dividers.area.style', type: 'select', options: ['', 'solid', 'dashed', 'dotted'], label: 'Style' },
        { key: 'dividers.area.sides', type: 'sides', label: 'Sides' },
        { key: 'dividers.area.padding', type: 'text', label: 'Padding', placeholder: '8px  1em  2%  $xs' }
      ]},
      { group: 'Dividers: Item', defaultCollapsed: true, fields: [
        { key: 'dividers.item.color', type: 'color', label: 'Color' },
        { key: 'dividers.item.width', type: 'number', label: 'Width (px)', step: 1 },
        { key: 'dividers.item.style', type: 'select', options: ['', 'solid', 'dashed', 'dotted'], label: 'Style' },
        { key: 'dividers.item.sides', type: 'sides', label: 'Sides' },
        { key: 'dividers.item.padding', type: 'text', label: 'Padding', placeholder: '8px  1em  2%  $xs' }
      ]},
      { group: 'Dividers: Variation', defaultCollapsed: true, fields: [
        { key: 'dividers.variation.color', type: 'color', label: 'Color' },
        { key: 'dividers.variation.width', type: 'number', label: 'Width (px)', step: 1 },
        { key: 'dividers.variation.style', type: 'select', options: ['', 'solid', 'dashed', 'dotted'], label: 'Style' },
        { key: 'dividers.variation.sides', type: 'sides', label: 'Sides' },
        { key: 'dividers.variation.padding', type: 'text', label: 'Padding', placeholder: '8px  1em  2%  $xs' }
      ]},
      { group: 'Areas (defaults)', defaultCollapsed: true, fields: [
        { key: 'areas.padding', type: 'padding', label: 'Padding' },
        { key: 'areas.background', type: 'background', label: 'Background' },
        { key: 'areas.column_count', type: 'number', label: 'Item Columns' },
        { key: 'areas.gutter', type: 'text', label: 'Item Gutter', placeholder: '24px  1em  2%  $lg' },
        { key: 'areas.item_align', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Item Align' },
        { key: 'areas.price_align', type: 'select', options: ['', 'left', 'right'], label: 'Price Align' },
        { key: 'areas.title_font', type: 'font_role', label: 'Title Font Role' }
      ]},
      { group: 'Items (defaults)', defaultCollapsed: true, fields: [
        { key: 'items.padding', type: 'padding', label: 'Padding' },
        { key: 'items.align', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Align' },
        { key: 'items.name_font', type: 'font_role', label: 'Name Font Role' },
        { key: 'items.price_font', type: 'font_role', label: 'Price Font Role' },
        { key: 'items.description_font', type: 'font_role', label: 'Description Font Role' },
        { key: 'items.variation_font', type: 'font_role', label: 'Variation Font Role' }
      ]},
      { group: 'Price Line', defaultCollapsed: true, fields: [
        { key: 'items.price_line.style', type: 'select', options: ['', 'none', 'dots', 'dashes', 'solid'], label: 'Style' },
        { key: 'items.price_line.color', type: 'color', label: 'Color' },
        { key: 'items.price_line.thickness', type: 'number', label: 'Thickness (px)', step: 1 },
        { key: 'items.price_line.segment_size', type: 'number', label: 'Dot/Dash Size (px)', step: 1 },
        { key: 'items.price_line.gap_size', type: 'number', label: 'Gap Between (px)', step: 1 },
        { key: 'items.price_line.padding_left', type: 'text', label: 'Left Padding', placeholder: '8px  1em  2%  $xs' },
        { key: 'items.price_line.padding_right', type: 'text', label: 'Right Padding', placeholder: '8px  1em  2%  $xs' }
      ]},
      { group: 'Pricing', defaultCollapsed: true, fields: [
        { key: 'pricing.symbol', type: 'text', label: 'Currency Symbol' },
        { key: 'pricing.symbol_position', type: 'select', options: ['before', 'after'], label: 'Symbol Position' },
        { key: 'pricing.symbol_space', type: 'checkbox', label: 'Add Symbol Space' },
        { key: 'pricing.format', type: 'select', options: ['full', 'fewest'], label: 'Price Format' }
      ]},
      { group: 'Header', defaultCollapsed: true, fields: [
        { key: 'header.height', type: 'text', label: 'Height', placeholder: '24px  1em  2%  $lg' },
        { key: 'header.padding', type: 'padding', label: 'Padding' },
        { key: 'header.background', type: 'background', label: 'Background' },
        { key: 'header.columns.left.mode', type: 'select', options: ['', 'fit', 'fill'], label: 'Left Col' },
        { key: 'header.columns.center.mode', type: 'select', options: ['', 'fit', 'fill'], label: 'Center Col' },
        { key: 'header.columns.right.mode', type: 'select', options: ['', 'fit', 'fill'], label: 'Right Col' }
      ]}
    ],
    header_text: [
      { key: 'id', type: 'text', label: 'ID (auto)' },
      { key: 'text', type: 'text', label: 'Text' },
      { key: 'position', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Position' },
      { key: 'font', type: 'font_role', label: 'Font Role' }
    ],
    header_logo: [
      { key: 'id', type: 'text', label: 'ID (auto)' },
      { key: 'src', type: 'text', label: 'Image URL' },
      { key: 'position', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Position' },
      { key: 'max_height', type: 'number', label: 'Max Height', step: 0.25 }
    ],
    area: [
      { key: 'id', type: 'text', label: 'ID (auto)' },
      { key: 'title',       type: 'text',       label: 'Title' },
      { key: 'subtitle',    type: 'text',       label: 'Subtitle' },
      { key: 'icon',        type: 'text',       label: 'Icon URL' },
      { key: 'icon_height', type: 'text',       label: 'Icon Height', placeholder: '24px  1em  25%  $lg' },
      { key: 'background',  type: 'background', label: 'Background' },
      { key: 'align', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Title Align' },
      { key: 'valign', type: 'select', options: ['', 'top', 'center', 'bottom'], label: 'Vertical Align' },
      { key: 'column_count', type: 'number', label: 'Item Columns' },
      { key: 'columns', type: 'number', label: 'Sub-Area Columns' },
      { key: 'gutter', type: 'text', label: 'Gutter', placeholder: '24px  1em  2%  $lg' },
      { key: 'item_align', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Item Align' },
      { key: 'price_align', type: 'select', options: ['', 'left', 'right'], label: 'Price Align' },
      { key: 'padding', type: 'padding', label: 'Padding' },
      { group: 'Style Overrides', inheritable: true, fields: [
        { key: 'style.title_font', type: 'font', label: 'Title Font' },
        { key: 'style.background', type: 'background', label: 'Background' }
      ]}
    ],
    item: [
      { key: 'id', type: 'text', label: 'ID (auto)' },
      { key: 'name', type: 'text', label: 'Name' },
      { key: 'description', type: 'text', label: 'Description' },
      { key: 'price', type: 'text', label: 'Price' },
      { key: 'align', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Align' },
      { key: 'hide_if_empty', type: 'checkbox', label: 'Hide If Empty' },
      { key: 'variations_inline', type: 'checkbox', label: 'Variations Inline' },
      { key: 'show_variation_prices', type: 'checkbox', label: 'Show Variation Prices', defaultChecked: true },
      { key: 'padding', type: 'padding', label: 'Padding' },
      { group: 'Style Overrides', inheritable: true, fields: [
        { key: 'style.name_font', type: 'font', label: 'Name Font' },
        { key: 'style.price_font', type: 'font', label: 'Price Font' }
      ]}
    ],
    variation: [
      { key: 'id', type: 'text', label: 'ID' },
      { key: 'name', type: 'text', label: 'Name' },
      { key: 'price', type: 'text', label: 'Price' }
    ]
  };

  // ── Field Renderers ────────────────────────────────────────────────────

  function renderField(container, basePath, fieldDef, store) {
    var fullPath = basePath ? basePath + '.' + fieldDef.key : fieldDef.key;
    var value = getAtPath(store.getData(), fullPath);

    var wrapper = el('div', 'me-field');
    var label = el('label', 'me-field__label');
    label.textContent = fieldDef.label;

    if (fieldDef.type === 'text') {
      var input = el('input', 'me-field__input', { type: 'text' });
      input.value = value || '';
      if (fieldDef.placeholder) input.placeholder = fieldDef.placeholder;
      var timer;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          store.update(fullPath, input.value || undefined);
        }, 300);
      });
      input.addEventListener('keydown', function (e) {
        spacingArrowKey(e, input, function (v) {
          clearTimeout(timer);
          store.update(fullPath, v != null ? v : undefined);
        });
      });
      wrapper.appendChild(label);
      wrapper.appendChild(input);

    } else if (fieldDef.type === 'number') {
      var numAttrs = { type: 'number' };
      if (fieldDef.step) numAttrs.step = String(fieldDef.step);
      var input = el('input', 'me-field__input', numAttrs);
      input.value = value != null ? value : '';
      input.addEventListener('input', function () {
        var v = input.value === '' ? undefined : parseFloat(input.value);
        store.update(fullPath, v);
      });
      wrapper.appendChild(label);
      wrapper.appendChild(input);

    } else if (fieldDef.type === 'font_role') {
      var frSelect = el('select', 'me-field__select');
      var frData = store.getData();
      var frRoles = Object.keys((frData.theme && frData.theme.fonts) || {});
      DEFAULT_FONT_ROLES.forEach(function (r) { if (frRoles.indexOf(r) === -1) frRoles.push(r); });
      var frOpts = [''].concat(frRoles);
      frOpts.forEach(function (opt) {
        var option = el('option');
        option.value = opt;
        option.textContent = opt || '(default)';
        if (String(value) === String(opt)) option.selected = true;
        frSelect.appendChild(option);
      });
      frSelect.addEventListener('change', function () {
        store.update(fullPath, frSelect.value || undefined);
      });
      wrapper.appendChild(label);
      wrapper.appendChild(frSelect);

    } else if (fieldDef.type === 'select') {
      var select = el('select', 'me-field__select');
      (fieldDef.options || []).forEach(function (opt) {
        var option = el('option');
        option.value = opt;
        option.textContent = opt || '(default)';
        if (String(value) === String(opt)) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', function () {
        var v = select.value;
        if (v === '') v = undefined;
        else if (!isNaN(v) && fieldDef.options.some(function (o) { return typeof o === 'number'; })) v = parseInt(v);
        store.update(fullPath, v);
      });
      wrapper.appendChild(label);
      wrapper.appendChild(select);

    } else if (fieldDef.type === 'checkbox') {
      var cb = el('input', 'me-field__checkbox', { type: 'checkbox' });
      cb.checked = (value != null) ? !!value : !!fieldDef.defaultChecked;
      cb.addEventListener('change', function () {
        // Store explicit false for unchecked when default is true; otherwise undefined
        var v;
        if (cb.checked) v = true;
        else v = fieldDef.defaultChecked ? false : undefined;
        store.update(fullPath, v);
      });
      var cbLabel = el('span', 'me-field__cb-label');
      cbLabel.textContent = fieldDef.label;
      var cbWrap = el('label', 'me-field__cb-wrap');
      cbWrap.appendChild(cb);
      cbWrap.appendChild(cbLabel);
      wrapper.appendChild(cbWrap);

    } else if (fieldDef.type === 'color') {
      var isTransparent = value === 'transparent' || value === '';
      var lastColor = (isTransparent || !value) ? '#000000' : value;
      var colorInput = el('input', 'me-field__color', { type: 'color' });
      colorInput.value = lastColor;
      var hexInput = el('input', 'me-field__input me-field__input--short', { type: 'text' });
      hexInput.value = isTransparent ? 'transparent' : lastColor;
      var transpCb = el('input', '', { type: 'checkbox' });
      transpCb.checked = isTransparent;
      var transpLabel = el('label', 'me-field__cb-wrap me-field__cb-wrap--small');
      transpLabel.appendChild(transpCb);
      var transpText = el('span');
      transpText.textContent = 'transparent';
      transpLabel.appendChild(transpText);

      colorInput.addEventListener('input', function () {
        lastColor = colorInput.value;
        hexInput.value = colorInput.value;
        transpCb.checked = false;
        store.update(fullPath, colorInput.value);
      });
      hexInput.addEventListener('change', function () {
        if (hexInput.value === 'transparent') {
          transpCb.checked = true;
          store.update(fullPath, 'transparent');
        } else {
          lastColor = hexInput.value;
          colorInput.value = hexInput.value;
          transpCb.checked = false;
          store.update(fullPath, hexInput.value);
        }
      });
      transpCb.addEventListener('change', function () {
        if (transpCb.checked) {
          hexInput.value = 'transparent';
          store.update(fullPath, 'transparent');
        } else {
          hexInput.value = lastColor;
          colorInput.value = lastColor;
          store.update(fullPath, lastColor);
        }
      });

      wrapper.appendChild(label);
      var colorRow = el('div', 'me-field__color-row');
      colorRow.appendChild(colorInput);
      colorRow.appendChild(hexInput);
      colorRow.appendChild(transpLabel);
      wrapper.appendChild(colorRow);

    } else if (fieldDef.type === 'background') {
      var bgVal = value || '';
      var parsed = parseLinearGradient(bgVal);
      var bgMode = parsed ? 'gradient' : 'solid';

      // State
      var bgAngle = parsed ? parsed.angle : 135;
      var bgStops = parsed ? parsed.stops.map(function (s) { return { color: s.color, pos: s.pos }; })
                           : [{ color: '#000000', pos: 0 }, { color: '#ffffff', pos: 100 }];
      var bgSolidColor = (!parsed && bgVal && bgVal !== 'transparent') ? bgVal : '#000000';
      var bgTransparent = bgVal === 'transparent';

      var bgWrap = el('div', 'me-bg-editor');

      // Mode toggle row
      var bgModeRow = el('div', 'me-bg-editor__mode-row');
      var solidBtn = el('button', 'me-bg-editor__mode-btn' + (bgMode === 'solid' ? ' active' : ''));
      solidBtn.type = 'button';
      solidBtn.textContent = 'Solid';
      var gradBtn = el('button', 'me-bg-editor__mode-btn' + (bgMode === 'gradient' ? ' active' : ''));
      gradBtn.type = 'button';
      gradBtn.textContent = 'Gradient';
      bgModeRow.appendChild(solidBtn);
      bgModeRow.appendChild(gradBtn);
      bgWrap.appendChild(bgModeRow);

      // ── Solid panel ──────────────────────────────────────────────────
      var solidPanel = el('div', 'me-bg-editor__solid');
      solidPanel.style.display = bgMode === 'solid' ? '' : 'none';

      var solidColorIn = el('input', 'me-field__color', { type: 'color' });
      solidColorIn.value = bgSolidColor;
      var solidHexIn = el('input', 'me-field__input me-field__input--short', { type: 'text' });
      solidHexIn.value = bgTransparent ? 'transparent' : bgSolidColor;
      var sCb = el('input', '', { type: 'checkbox' });
      sCb.checked = bgTransparent;
      var sCbLabel = el('label', 'me-field__cb-wrap me-field__cb-wrap--small');
      sCbLabel.appendChild(sCb);
      var sCbText = el('span'); sCbText.textContent = 'transparent';
      sCbLabel.appendChild(sCbText);

      solidColorIn.addEventListener('input', function () {
        bgSolidColor = solidColorIn.value;
        solidHexIn.value = bgSolidColor;
        sCb.checked = false;
        bgTransparent = false;
        store.update(fullPath, bgSolidColor);
      });
      solidHexIn.addEventListener('change', function () {
        if (solidHexIn.value === 'transparent') {
          sCb.checked = true; bgTransparent = true;
          store.update(fullPath, 'transparent');
        } else {
          bgSolidColor = solidHexIn.value;
          solidColorIn.value = bgSolidColor;
          sCb.checked = false; bgTransparent = false;
          store.update(fullPath, bgSolidColor);
        }
      });
      sCb.addEventListener('change', function () {
        bgTransparent = sCb.checked;
        if (bgTransparent) {
          solidHexIn.value = 'transparent';
          store.update(fullPath, 'transparent');
        } else {
          solidHexIn.value = bgSolidColor;
          solidColorIn.value = bgSolidColor;
          store.update(fullPath, bgSolidColor);
        }
      });

      var solidColorRow = el('div', 'me-field__color-row');
      solidColorRow.appendChild(solidColorIn);
      solidColorRow.appendChild(solidHexIn);
      solidColorRow.appendChild(sCbLabel);
      solidPanel.appendChild(solidColorRow);
      bgWrap.appendChild(solidPanel);

      // ── Gradient panel ───────────────────────────────────────────────
      var gradPanel = el('div', 'me-bg-editor__gradient');
      gradPanel.style.display = bgMode === 'gradient' ? '' : 'none';

      // Preview bar
      var gradPreview = el('div', 'me-gradient-preview');

      // Angle row
      var angleRow = el('div', 'me-gradient-angle-row');
      var presetRow = el('div', 'me-gradient-presets');
      var anglePresets = [
        { label: '→', angle: 90 }, { label: '↓', angle: 180 },
        { label: '↘', angle: 135 }, { label: '↗', angle: 45 }
      ];
      anglePresets.forEach(function (p) {
        var pb = el('button', 'me-gradient-preset');
        pb.type = 'button';
        pb.title = p.angle + '°';
        pb.textContent = p.label;
        pb.addEventListener('click', function () {
          bgAngle = p.angle;
          angleIn.value = bgAngle;
          refreshGradient();
        });
        presetRow.appendChild(pb);
      });
      var angleIn = el('input', 'me-field__input me-gradient-angle-input', { type: 'number', min: '0', max: '360' });
      angleIn.value = bgAngle;
      angleIn.addEventListener('input', function () {
        bgAngle = parseInt(angleIn.value) || 0;
        refreshGradient();
      });
      angleRow.appendChild(presetRow);
      angleRow.appendChild(angleIn);
      var angleDeg = el('span', 'me-gradient-angle-deg');
      angleDeg.textContent = '°';
      angleRow.appendChild(angleDeg);

      // Stops list
      var stopsWrap = el('div', 'me-gradient-stops');

      function refreshGradient() {
        var css = composeLinearGradient(bgAngle, bgStops);
        gradPreview.style.background = css;
        store.update(fullPath, css);
      }

      function renderStops() {
        stopsWrap.innerHTML = '';
        bgStops.forEach(function (stop, idx) {
          var row = el('div', 'me-gradient-stop');

          var stopColor = el('input', 'me-field__color', { type: 'color' });
          stopColor.value = stop.color;
          stopColor.addEventListener('input', function () {
            bgStops[idx].color = stopColor.value;
            refreshGradient();
          });

          var posIn = el('input', 'me-field__input me-gradient-stop__pos', { type: 'number', min: '0', max: '100' });
          posIn.value = stop.pos != null ? stop.pos : '';
          posIn.placeholder = '%';
          posIn.addEventListener('input', function () {
            var v = parseInt(posIn.value);
            bgStops[idx].pos = isNaN(v) ? null : Math.min(100, Math.max(0, v));
            refreshGradient();
          });

          var pct = el('span', 'me-gradient-stop__pct');
          pct.textContent = '%';

          var delBtn = el('button', 'me-gradient-stop__delete');
          delBtn.type = 'button';
          delBtn.textContent = '×';
          delBtn.disabled = bgStops.length <= 2;
          delBtn.addEventListener('click', function () {
            if (bgStops.length <= 2) return;
            bgStops.splice(idx, 1);
            renderStops();
            refreshGradient();
          });

          row.appendChild(stopColor);
          row.appendChild(posIn);
          row.appendChild(pct);
          row.appendChild(delBtn);
          stopsWrap.appendChild(row);
        });
      }
      renderStops();

      var addStopBtn = el('button', 'me-gradient-add');
      addStopBtn.type = 'button';
      addStopBtn.textContent = '+ Stop';
      addStopBtn.addEventListener('click', function () {
        // Insert new stop at midpoint between last two
        var last = bgStops[bgStops.length - 1];
        var prev = bgStops[bgStops.length - 2];
        var newPos = (prev.pos != null && last.pos != null) ? Math.round((prev.pos + last.pos) / 2) : null;
        bgStops.splice(bgStops.length - 1, 0, { color: '#888888', pos: newPos });
        renderStops();
        refreshGradient();
      });

      gradPanel.appendChild(gradPreview);
      gradPanel.appendChild(angleRow);
      gradPanel.appendChild(stopsWrap);
      gradPanel.appendChild(addStopBtn);
      bgWrap.appendChild(gradPanel);

      // Initialize preview
      if (bgMode === 'gradient') refreshGradient();

      // Mode toggle logic
      solidBtn.addEventListener('click', function () {
        bgMode = 'solid';
        solidBtn.classList.add('active');
        gradBtn.classList.remove('active');
        solidPanel.style.display = '';
        gradPanel.style.display = 'none';
        store.update(fullPath, bgTransparent ? 'transparent' : bgSolidColor);
      });
      gradBtn.addEventListener('click', function () {
        bgMode = 'gradient';
        gradBtn.classList.add('active');
        solidBtn.classList.remove('active');
        gradPanel.style.display = '';
        solidPanel.style.display = 'none';
        refreshGradient();
      });

      wrapper.appendChild(label);
      wrapper.appendChild(bgWrap);

    } else if (fieldDef.type === 'padding') {
      var padVal = value;
      var isUniform = padVal == null || typeof padVal !== 'object';
      var padWrap = el('div', 'me-padding-editor');

      var modeBtn = el('button', 'me-padding-editor__toggle');
      modeBtn.textContent = isUniform ? 'Per-side' : 'Uniform';

      var uniformInput = el('input', 'me-field__input', { type: 'text', placeholder: '8px  1em  2%  $xs' });
      uniformInput.value = isUniform ? (padVal != null ? padVal : '') : '';

      var perSideWrap = el('div', 'me-padding-editor__sides');
      var sides = ['top', 'right', 'bottom', 'left'];
      var sideInputs = {};
      sides.forEach(function (s) {
        var sideGroup = el('div', 'me-padding-editor__side');
        var sLabel = el('span', 'me-padding-editor__side-label');
        sLabel.textContent = s.charAt(0).toUpperCase();
        var sInput = el('input', 'me-field__input me-field__input--tiny', { type: 'text', placeholder: '0' });
        sInput.value = (!isUniform && padVal && padVal[s] != null) ? padVal[s] : '';
        sInput.addEventListener('input', function () {
          var obj = {};
          sides.forEach(function (side) {
            var v = sideInputs[side].value.trim();
            if (v !== '') obj[side] = coerceSpacing(v);
          });
          store.update(fullPath, Object.keys(obj).length ? obj : undefined);
        });
        sInput.addEventListener('keydown', function (e) {
          spacingArrowKey(e, sInput, function () {
            var obj = {};
            sides.forEach(function (side) {
              var v = sideInputs[side].value.trim();
              if (v !== '') obj[side] = coerceSpacing(v);
            });
            store.update(fullPath, Object.keys(obj).length ? obj : undefined);
          });
        });
        sideInputs[s] = sInput;
        sideGroup.appendChild(sLabel);
        sideGroup.appendChild(sInput);
        perSideWrap.appendChild(sideGroup);
      });

      uniformInput.addEventListener('input', function () {
        var v = uniformInput.value.trim();
        store.update(fullPath, v === '' ? undefined : coerceSpacing(v));
      });
      uniformInput.addEventListener('keydown', function (e) {
        spacingArrowKey(e, uniformInput, function (v) {
          store.update(fullPath, v != null ? v : undefined);
        });
      });

      modeBtn.addEventListener('click', function () {
        isUniform = !isUniform;
        modeBtn.textContent = isUniform ? 'Per-side' : 'Uniform';
        uniformInput.style.display = isUniform ? '' : 'none';
        perSideWrap.style.display = isUniform ? 'none' : '';
        if (isUniform) {
          var v = uniformInput.value.trim();
          store.update(fullPath, v ? coerceSpacing(v) : undefined);
        }
      });

      uniformInput.style.display = isUniform ? '' : 'none';
      perSideWrap.style.display = isUniform ? 'none' : '';

      wrapper.appendChild(label);
      wrapper.appendChild(modeBtn);
      wrapper.appendChild(uniformInput);
      wrapper.appendChild(perSideWrap);

    } else if (fieldDef.type === 'font') {
      var fontVal = value || {};
      var fontDetails = document.createElement('details');
      fontDetails.className = 'me-font-details';
      var fontSummary = document.createElement('summary');
      fontSummary.className = 'me-font-summary';
      fontSummary.textContent = fieldDef.label || fieldDef.key;
      if (fieldDef.removable) {
        var rmBtn = el('button', 'me-inspector-group__clear', { title: 'Remove role' });
        rmBtn.textContent = '\u2715';
        rmBtn.style.marginLeft = '8px';
        rmBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          store.deleteAtPath(fullPath);
          store.select(store.getSelectedPath());
        });
        fontSummary.appendChild(rmBtn);
      }
      fontDetails.appendChild(fontSummary);
      var fontGroup = el('div', 'me-font-editor');

      // Family
      var famWrap = el('div', 'me-field');
      var famLabel = el('label', 'me-field__label');
      famLabel.textContent = 'Family';
      var famSelect = el('select', 'me-field__select');
      var defOpt = el('option');
      defOpt.value = '';
      defOpt.textContent = '(default)';
      famSelect.appendChild(defOpt);
      GOOGLE_FONTS.forEach(function (f) {
        var opt = el('option');
        opt.value = f;
        opt.textContent = f;
        if (fontVal.family === f) opt.selected = true;
        famSelect.appendChild(opt);
      });
      famSelect.addEventListener('change', function () {
        store.update(fullPath + '.family', famSelect.value || undefined);
      });
      famWrap.appendChild(famLabel);
      famWrap.appendChild(famSelect);
      fontGroup.appendChild(famWrap);

      // Weight
      var wtWrap = el('div', 'me-field');
      var wtLabel = el('label', 'me-field__label');
      wtLabel.textContent = 'Weight';
      var wtSelect = el('select', 'me-field__select');
      FONT_WEIGHTS.forEach(function (w) {
        var opt = el('option');
        opt.value = w;
        opt.textContent = w;
        if (fontVal.weight === w) opt.selected = true;
        wtSelect.appendChild(opt);
      });
      wtSelect.addEventListener('change', function () {
        store.update(fullPath + '.weight', wtSelect.value || undefined);
      });
      wtWrap.appendChild(wtLabel);
      wtWrap.appendChild(wtSelect);
      fontGroup.appendChild(wtWrap);

      // Color
      var fcWrap = el('div', 'me-field');
      var fcLabel = el('label', 'me-field__label');
      fcLabel.textContent = 'Color';
      var fcInput = el('input', 'me-field__color', { type: 'color' });
      fcInput.value = fontVal.color || '#ffffff';
      fcInput.addEventListener('input', function () {
        store.update(fullPath + '.color', fcInput.value);
      });
      fcWrap.appendChild(fcLabel);
      fcWrap.appendChild(fcInput);
      fontGroup.appendChild(fcWrap);

      // Size
      var szWrap = el('div', 'me-field');
      var szLabel = el('label', 'me-field__label');
      szLabel.textContent = 'Size (em)';
      var szInput = el('input', 'me-field__input', { type: 'number', step: '0.125', placeholder: '1.375' });
      szInput.value = fontVal.size != null ? fontVal.size : '';
      var szTimer;
      szInput.addEventListener('input', function () {
        clearTimeout(szTimer);
        szTimer = setTimeout(function () {
          var v = szInput.value === '' ? undefined : parseFloat(szInput.value);
          store.update(fullPath + '.size', v);
        }, 300);
      });
      szWrap.appendChild(szLabel);
      szWrap.appendChild(szInput);
      fontGroup.appendChild(szWrap);

      fontDetails.appendChild(fontGroup);
      wrapper.appendChild(fontDetails);

    } else if (fieldDef.type === 'vars_palette' || fieldDef.type === 'vars_map') {
      // Inline key/value editor for design vars (palette: color, scale: number)
      var isPalette = fieldDef.type === 'vars_palette';
      var vars = (value && typeof value === 'object') ? value : {};
      var tableWrap = el('div', 'me-vars-editor');
      var entries = Object.keys(vars);

      function rebuildVarRows() {
        tableWrap.innerHTML = '';
        entries = Object.keys(vars);
        entries.forEach(function (k) {
          // Capture the current key in a closure variable so renames work
          // without rebuilding the row (which would destroy focus).
          var currentKey = k;
          var row = el('div', 'me-vars-row');
          var keyInput = el('input', 'me-field__input me-field__input--short', { type: 'text' });
          keyInput.value = k;
          var valInput = el('input', 'me-field__input', { type: isPalette ? 'text' : 'number' });
          valInput.value = vars[k];
          if (isPalette) {
            var swatch = el('input', 'me-field__color', { type: 'color' });
            swatch.value = (typeof vars[k] === 'string' && vars[k].charAt(0) === '#') ? vars[k] : '#000000';
            swatch.addEventListener('input', function () {
              vars[currentKey] = swatch.value;
              valInput.value = swatch.value;
              store.update(fullPath, vars);
            });
            row.appendChild(swatch);
          }
          var keyTimer;
          keyInput.addEventListener('input', function () {
            clearTimeout(keyTimer);
            keyTimer = setTimeout(function () {
              var newKey = keyInput.value.trim();
              if (newKey && newKey !== currentKey) {
                vars[newKey] = vars[currentKey];
                delete vars[currentKey];
                currentKey = newKey;
                store.update(fullPath, vars);
                // No rebuild — the input keeps focus, currentKey points to new name
              }
            }, 400);
          });
          var valTimer;
          valInput.addEventListener('input', function () {
            clearTimeout(valTimer);
            valTimer = setTimeout(function () {
              var v = isPalette ? valInput.value : parseFloat(valInput.value);
              if (isPalette || !isNaN(v)) {
                vars[currentKey] = v;
                store.update(fullPath, vars);
              }
            }, 400);
          });
          var delBtn = el('button', 'me-tree-btn me-tree-btn--danger');
          delBtn.textContent = '\u2715';
          delBtn.addEventListener('click', function () {
            delete vars[currentKey];
            store.update(fullPath, vars);
            rebuildVarRows();
          });
          row.appendChild(keyInput);
          row.appendChild(valInput);
          row.appendChild(delBtn);
          tableWrap.appendChild(row);
        });
        // Add new
        var addBtn = el('button', 'me-tree-btn');
        addBtn.textContent = '+ add';
        addBtn.addEventListener('click', function () {
          var newKey = 'var-' + (entries.length + 1);
          vars[newKey] = isPalette ? '#000000' : 1;
          store.update(fullPath, vars);
          rebuildVarRows();
        });
        tableWrap.appendChild(addBtn);
      }
      rebuildVarRows();

      wrapper.appendChild(label);
      wrapper.appendChild(tableWrap);

    } else if (fieldDef.type === 'sides') {
      var sidesVal = Array.isArray(value) ? value : [];
      var sidesRow = el('div', 'me-field__sides');
      [['tb', 'T/B'], ['lr', 'L/R']].forEach(function (pair) {
        var sKey = pair[0], sLabel = pair[1];
        var sCb = el('input', '', { type: 'checkbox' });
        sCb.checked = sidesVal.indexOf(sKey) !== -1;
        var sLbl = el('label', 'me-field__side-label');
        sLbl.appendChild(sCb);
        var sTxt = el('span');
        sTxt.textContent = sLabel;
        sLbl.appendChild(sTxt);
        sCb.addEventListener('change', function () {
          var cur = Array.isArray(getAtPath(store.getData(), fullPath)) ? getAtPath(store.getData(), fullPath).slice() : [];
          if (sCb.checked) { if (cur.indexOf(sKey) === -1) cur.push(sKey); }
          else { cur = cur.filter(function (s) { return s !== sKey; }); }
          store.update(fullPath, cur.length ? cur : undefined);
        });
        sidesRow.appendChild(sLbl);
      });
      wrapper.appendChild(label);
      wrapper.appendChild(sidesRow);
    }

    container.appendChild(wrapper);
  }

  // ── Tree Panel ─────────────────────────────────────────────────────────

  function createTreePanel(container, store) {
    var collapsedPaths = new Set();
    var dragSourcePath = null;
    var dropIndicator = el('div', 'me-drop-indicator');
    dropIndicator.style.display = 'none';
    container.appendChild(dropIndicator);

    function getNodeType(path) {
      if (path === 'theme.layout') return 'layout';
      if (path === 'theme' || path.indexOf('theme') === 0) return 'theme';
      var obj = getAtPath(store.getData(), path);
      if (!obj) return 'unknown';
      if (obj.variations !== undefined || (obj.price !== undefined && obj.name !== undefined && !obj.items && !obj.areas)) {
        if (obj.name !== undefined && obj.price !== undefined && !obj.id) return 'variation';
        // Check if it's a variation by context
        if (path.indexOf('.variations[') !== -1) return 'variation';
        return 'item';
      }
      if (path.indexOf('.variations[') !== -1) return 'variation';
      if (path.indexOf('.items[') !== -1) return 'item';
      if (path.indexOf('areas') !== -1) return 'area';
      return 'unknown';
    }

    function getNodeLabel(path, obj) {
      if (path === '') return 'Menu';
      if (path === 'theme.layout') return 'Layout';
      if (path === 'theme') return 'Theme';
      if (path === 'vars') return 'Vars';
      if (obj.title) return obj.title;
      if (obj.name) return obj.name;
      if (obj.id) return obj.id;
      return '(untitled)';
    }

    function getNodeIcon(type) {
      var icons = {
        root: '\u25C6',     // diamond
        vars: '\u269C',     // fleur
        layout: '\u2630',   // trigram
        theme: '\u2726',    // star
        area: '\u25A1',     // square
        item: '\u2022',     // bullet
        variation: '\u2013' // dash
      };
      return icons[type] || '\u2022';
    }

    function buildNode(path, obj, type, depth) {
      var node = el('div', 'me-tree-node');
      node.setAttribute('data-path', path);
      node.setAttribute('data-type', type);
      node.style.paddingLeft = (depth * 16) + 'px';

      var header = el('div', 'me-tree-node__header');
      if (path === store.getSelectedPath()) {
        header.classList.add('me-tree-node__header--selected');
      }

      // Determine if expandable
      var hasChildren = false;
      if (type === 'area' && (obj.items && obj.items.length || obj.areas && obj.areas.length)) hasChildren = true;
      if (type === 'item' && obj.variations && obj.variations.length) hasChildren = true;

      var arrow = el('span', 'me-tree-arrow');
      if (hasChildren) {
        var collapsed = collapsedPaths.has(path);
        arrow.textContent = collapsed ? '\u25B6' : '\u25BC';
        arrow.addEventListener('click', function (e) {
          e.stopPropagation();
          if (collapsedPaths.has(path)) {
            collapsedPaths.delete(path);
          } else {
            collapsedPaths.add(path);
          }
          refresh();
        });
      } else {
        arrow.textContent = ' ';
        arrow.style.opacity = '0';
      }

      var icon = el('span', 'me-tree-icon');
      icon.textContent = getNodeIcon(type);

      var label = el('span', 'me-tree-label');
      label.textContent = getNodeLabel(path, obj);

      header.appendChild(arrow);
      header.appendChild(icon);
      header.appendChild(label);

      // Action buttons on hover (with delayed hide)
      var actions = el('span', 'me-tree-actions');
      var hideTimer;
      function showActions() {
        clearTimeout(hideTimer);
        // Hide any other open popover immediately
        document.querySelectorAll('.me-tree-actions--show').forEach(function (a) {
          if (a !== actions) a.classList.remove('me-tree-actions--show');
        });
        actions.classList.add('me-tree-actions--show');
      }
      function scheduleHide() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () {
          actions.classList.remove('me-tree-actions--show');
        }, 600);
      }
      header.addEventListener('mouseenter', showActions);
      header.addEventListener('mouseleave', scheduleHide);
      actions.addEventListener('mouseenter', showActions);
      actions.addEventListener('mouseleave', scheduleHide);

      if (type === 'area') {
        var addItem = el('button', 'me-tree-btn', { title: 'Add Item' });
        addItem.textContent = '+';
        addItem.addEventListener('click', function (e) {
          e.stopPropagation();
          store.addEntity(path, 'item');
          collapsedPaths.delete(path);
          refresh();
        });
        actions.appendChild(addItem);

        var addSub = el('button', 'me-tree-btn', { title: 'Add Sub-Area' });
        addSub.textContent = '\u25A1';
        addSub.addEventListener('click', function (e) {
          e.stopPropagation();
          store.addEntity(path, 'subarea');
          collapsedPaths.delete(path);
          refresh();
        });
        actions.appendChild(addSub);
      }

      if (type === 'item') {
        var addVar = el('button', 'me-tree-btn', { title: 'Add Variation' });
        addVar.textContent = '+';
        addVar.addEventListener('click', function (e) {
          e.stopPropagation();
          store.addEntity(path, 'variation');
          collapsedPaths.delete(path);
          refresh();
        });
        actions.appendChild(addVar);
      }

      if (type === 'area' || type === 'item' || type === 'variation') {
        var dupBtn = el('button', 'me-tree-btn', { title: 'Duplicate' });
        dupBtn.textContent = '\u2398';
        dupBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          store.duplicateAtPath(path);
          refresh();
        });
        actions.appendChild(dupBtn);

        var delBtn = el('button', 'me-tree-btn me-tree-btn--danger', { title: 'Delete' });
        delBtn.textContent = '\u2715';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          store.deleteAtPath(path);
          refresh();
        });
        actions.appendChild(delBtn);
      }

      header.appendChild(actions);

      // Click to select
      header.addEventListener('click', function () {
        store.select(path);
      });

      // Hover to highlight in preview
      var entityId = obj.id || null;
      header.addEventListener('mouseenter', function () {
        if (!entityId) return;
        var iframeEl = document.querySelector('.me-preview-iframe');
        if (iframeEl && iframeEl.contentWindow) {
          iframeEl.contentWindow.postMessage({ type: 'highlight', id: entityId }, '*');
        }
      });
      header.addEventListener('mouseleave', function () {
        var iframeEl = document.querySelector('.me-preview-iframe');
        if (iframeEl && iframeEl.contentWindow) {
          iframeEl.contentWindow.postMessage({ type: 'highlight', id: null }, '*');
        }
      });

      // Drag and drop for reorderable nodes
      if (type === 'area' || type === 'item' || type === 'variation') {
        header.setAttribute('draggable', 'true');
        header.addEventListener('dragstart', function (e) {
          dragSourcePath = path;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', path);
          header.classList.add('me-tree-node__header--dragging');
        });
        header.addEventListener('dragend', function () {
          dragSourcePath = null;
          header.classList.remove('me-tree-node__header--dragging');
          dropIndicator.style.display = 'none';
        });
        header.addEventListener('dragover', function (e) {
          if (!dragSourcePath) return;
          var srcType = getNodeType(dragSourcePath);
          if (srcType !== type) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          var rect = header.getBoundingClientRect();
          var y = e.clientY - rect.top;
          var position = y < rect.height / 2 ? 'before' : 'after';
          dropIndicator.style.display = 'block';
          dropIndicator.style.left = header.offsetLeft + 'px';
          dropIndicator.style.width = header.offsetWidth + 'px';
          if (position === 'before') {
            dropIndicator.style.top = (header.getBoundingClientRect().top - container.getBoundingClientRect().top) + 'px';
          } else {
            dropIndicator.style.top = (header.getBoundingClientRect().bottom - container.getBoundingClientRect().top) + 'px';
          }
          dropIndicator.setAttribute('data-position', position);
        });
        header.addEventListener('dragleave', function () {
          dropIndicator.style.display = 'none';
        });
        header.addEventListener('drop', function (e) {
          e.preventDefault();
          dropIndicator.style.display = 'none';
          if (!dragSourcePath || dragSourcePath === path) return;
          var position = dropIndicator.getAttribute('data-position');
          store.moveItem(dragSourcePath, path, position);
          dragSourcePath = null;
          refresh();
        });
      }

      node.appendChild(header);

      // Children
      if (hasChildren && !collapsedPaths.has(path)) {
        var children = el('div', 'me-tree-children');
        if (obj.areas) {
          obj.areas.forEach(function (sub, i) {
            children.appendChild(buildNode(path + '.areas[' + i + ']', sub, 'area', depth + 1));
          });
        }
        if (obj.items) {
          obj.items.forEach(function (item, i) {
            children.appendChild(buildNode(path + '.items[' + i + ']', item, 'item', depth + 1));
          });
        }
        if (obj.variations) {
          obj.variations.forEach(function (v, i) {
            children.appendChild(buildNode(path + '.variations[' + i + ']', v, 'variation', depth + 1));
          });
        }
        node.appendChild(children);
      }

      return node;
    }

    function refresh() {
      // Clear all tree nodes but preserve the drop indicator
      var child = container.firstChild;
      while (child) {
        var next = child.nextSibling;
        if (child !== dropIndicator) container.removeChild(child);
        child = next;
      }

      var data = store.getData();

      // Root (Menu) — shows theme `uses` selector
      container.appendChild(buildNode('', data, 'root', 0));

      // Tokens
      container.appendChild(buildNode('vars', data.vars || {}, 'vars', 0));

      // Theme node
      container.appendChild(buildNode('theme', data.theme || {}, 'theme', 0));

      // Header section label (not selectable — like Areas)
      var headerSection = el('div', 'me-tree-node');
      var headerSecH = el('div', 'me-tree-node__header me-tree-node__header--section');
      var headerLabel = el('span', 'me-tree-label me-tree-label--section');
      headerLabel.textContent = 'Header';
      var addTextBtn = el('button', 'me-tree-btn', { title: 'Add Text Element' });
      addTextBtn.textContent = 'T+';
      addTextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        store.addEntity('header.elements', 'header_text');
        refresh();
      });
      var addLogoBtn = el('button', 'me-tree-btn', { title: 'Add Logo Element' });
      addLogoBtn.textContent = 'L+';
      addLogoBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        store.addEntity('header.elements', 'header_logo');
        refresh();
      });
      headerSecH.appendChild(headerLabel);
      headerSecH.appendChild(addTextBtn);
      headerSecH.appendChild(addLogoBtn);
      headerSection.appendChild(headerSecH);
      container.appendChild(headerSection);

      // Header element nodes
      var headerElements = (data.header && data.header.elements) || [];
      headerElements.forEach(function (he, i) {
        var nodePath = 'header.elements[' + i + ']';
        var hNode = el('div', 'me-tree-node');
        hNode.style.paddingLeft = '16px';
        var hHeader = el('div', 'me-tree-node__header');
        if (nodePath === store.getSelectedPath()) {
          hHeader.classList.add('me-tree-node__header--selected');
        }
        var hIcon = el('span', 'me-tree-icon');
        hIcon.textContent = he.type === 'logo' ? '\u25A3' : '\u201C';
        var hLabel = el('span', 'me-tree-label');
        hLabel.textContent = he.text || he.id || (he.type === 'logo' ? 'Logo' : 'Text');
        hHeader.appendChild(hIcon);
        hHeader.appendChild(hLabel);

        var hActions = el('span', 'me-tree-actions');
        var hDelBtn = el('button', 'me-tree-btn me-tree-btn--danger', { title: 'Delete' });
        hDelBtn.textContent = '\u2715';
        hDelBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          store.deleteAtPath(nodePath);
          refresh();
        });
        hActions.appendChild(hDelBtn);
        hHeader.appendChild(hActions);

        hHeader.addEventListener('click', function () {
          store.select(nodePath);
        });
        hNode.appendChild(hHeader);
        container.appendChild(hNode);
      });

      // Areas header
      var areasHeader = el('div', 'me-tree-node');
      areasHeader.style.paddingLeft = '0px';
      var areasH = el('div', 'me-tree-node__header me-tree-node__header--section');
      var areasLabel = el('span', 'me-tree-label me-tree-label--section');
      areasLabel.textContent = 'Areas';
      var addAreaBtn = el('button', 'me-tree-btn', { title: 'Add Area' });
      addAreaBtn.textContent = '+';
      addAreaBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        store.addEntity('areas', 'area');
        refresh();
      });
      areasH.appendChild(areasLabel);
      areasH.appendChild(addAreaBtn);
      areasHeader.appendChild(areasH);
      container.appendChild(areasHeader);

      // Area nodes
      (data.areas || []).forEach(function (area, i) {
        container.appendChild(buildNode('areas[' + i + ']', area, 'area', 1));
      });
    }

    store.on('change', refresh);
    store.on('select', refresh);
    refresh();
  }

  // ── Inspector Panel ────────────────────────────────────────────────────

  function createInspectorPanel(container, store) {
    var GROUPS_KEY = 'me-editor:groups';
    var groupsState = {};
    try { groupsState = JSON.parse(localStorage.getItem(GROUPS_KEY) || '{}'); } catch (e) {}
    var collapsedGroups = new Set(groupsState.collapsed || []);
    var expandedGroups = new Set(groupsState.expanded || []);
    function saveGroups() {
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify({
          collapsed: Array.from(collapsedGroups),
          expanded: Array.from(expandedGroups)
        }));
      } catch (e) {}
    }

    function refresh() {
      container.innerHTML = '';
      var path = store.getSelectedPath();
      var data = store.getData();
      var value = getAtPath(data, path);

      // Tree sections (Header, Areas) and unselectable nodes get empty inspector
      if (value == null && path !== 'theme.layout' && path !== 'theme' && path !== '' && path !== 'vars') {
        // Empty inspector — no message
        return;
      }

      // Determine type
      var type;
      if (path === '') type = 'root';
      else if (path === 'theme.layout') type = 'layout';
      else if (path === 'theme') type = 'theme';
      else if (path === 'vars') type = 'vars';
      else if (path.indexOf('header.elements[') === 0) {
        type = (value && value.type === 'logo') ? 'header_logo' : 'header_text';
      }
      else if (path.indexOf('.variations[') !== -1) type = 'variation';
      else if (path.indexOf('.items[') !== -1) type = 'item';
      else type = 'area';

      var defs = FIELD_DEFS[type];
      if (!defs) return;

      // Header
      var header = el('div', 'me-inspector__header');
      header.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      if (value && (value.title || value.name || value.id)) {
        header.textContent += ': ' + (value.title || value.name || value.id);
      }
      container.appendChild(header);

      // Fields
      defs.forEach(function (def) {
        if (def.group) {
          var groupEl = el('div', 'me-inspector-group');
          var groupHeader = el('div', 'me-inspector-group__header');
          var groupArrow = el('span', 'me-inspector-group__arrow');
          // Default-collapsed groups remain collapsed unless explicitly expanded
          var groupKey = type + ':' + def.group;
          var isCollapsed;
          if (def.defaultCollapsed) {
            isCollapsed = !expandedGroups.has(groupKey);
          } else {
            isCollapsed = collapsedGroups.has(def.group);
          }
          groupArrow.textContent = isCollapsed ? '\u25B6' : '\u25BC';
          var groupLabel = el('span');
          groupLabel.textContent = def.group;
          groupHeader.appendChild(groupArrow);
          groupHeader.appendChild(groupLabel);
          if (def.inheritable) {
            var hasOv = def.fields.some(function (f) {
              return getAtPath(store.getData(), path + '.' + f.key) != null;
            });
            if (hasOv) {
              var clearBtn = el('button', 'me-inspector-group__clear', { title: 'Revert to inherited' });
              clearBtn.textContent = '\u2715';
              clearBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                def.fields.forEach(function (f) {
                  store.deleteAtPath(path + '.' + f.key);
                });
                refresh();
              });
              groupHeader.appendChild(clearBtn);
            }
          }
          groupHeader.addEventListener('click', function () {
            if (def.defaultCollapsed) {
              if (expandedGroups.has(groupKey)) {
                expandedGroups.delete(groupKey);
              } else {
                expandedGroups.add(groupKey);
              }
            } else {
              if (collapsedGroups.has(def.group)) {
                collapsedGroups.delete(def.group);
              } else {
                collapsedGroups.add(def.group);
              }
            }
            saveGroups();
            refresh();
          });
          groupEl.appendChild(groupHeader);

          if (!isCollapsed) {
            var groupBody = el('div', 'me-inspector-group__body');

            // Inheritable groups show an "Inherited" cover
            if (def.inheritable) {
              var hasOverrides = def.fields.some(function (f) {
                return getAtPath(store.getData(), path + '.' + f.key) != null;
              });

              if (!hasOverrides) {
                var cover = el('div', 'me-inherited-cover');
                cover.textContent = 'Inherited — click to override';
                cover.addEventListener('click', function () {
                  cover.style.display = 'none';
                  groupBody.querySelectorAll('.me-field').forEach(function (f) {
                    f.style.display = '';
                  });
                });
                groupBody.appendChild(cover);
              }

              def.fields.forEach(function (fieldDef) {
                renderField(groupBody, path, fieldDef, store);
              });

              // Hide fields if no overrides
              if (!hasOverrides) {
                groupBody.querySelectorAll('.me-field').forEach(function (f) {
                  f.style.display = 'none';
                });
              }
            } else if (def.type === 'fonts_editor') {
              var fontsPath = path ? path + '.' + def.key : def.key;
              var fontsObj = getAtPath(store.getData(), fontsPath) || {};
              var fontKeys = Object.keys(fontsObj);
              DEFAULT_FONT_ROLES.forEach(function (r) {
                if (fontKeys.indexOf(r) === -1) fontKeys.push(r);
              });
              fontKeys.forEach(function (roleName) {
                renderField(groupBody, fontsPath, { key: roleName, type: 'font', label: roleName, removable: DEFAULT_FONT_ROLES.indexOf(roleName) === -1 }, store);
              });
              var addRow = el('div', 'me-font-add');
              var addInput = el('input', 'me-field__input', { type: 'text', placeholder: 'new role name' });
              var addBtn = el('button', 'me-toolbar__btn');
              addBtn.textContent = '+ Add';
              addBtn.addEventListener('click', function () {
                var name = (addInput.value || '').trim().replace(/[^a-z0-9_]/gi, '_');
                if (!name) return;
                store.update(fontsPath + '.' + name, { family: '', weight: '400', color: '$text', size: 1 });
                refresh();
              });
              addRow.appendChild(addInput);
              addRow.appendChild(addBtn);
              groupBody.appendChild(addRow);
            } else {
              def.fields.forEach(function (fieldDef) {
                renderField(groupBody, path, fieldDef, store);
              });
            }

            groupEl.appendChild(groupBody);
          }

          container.appendChild(groupEl);
        } else {
          renderField(container, path, def, store);
        }
      });
    }

    // Only rebuild inspector on selection change (not on every data change,
    // which would destroy the focused input while the user is typing).
    // Undo/redo emit 'select' too, so restored values are picked up.
    store.on('select', refresh);
    refresh();
  }

  // ── Preview Panel ──────────────────────────────────────────────────────

  function createPreviewPanel(container, store, rendererAvailable, getGridActive) {
    var activeTab = rendererAvailable ? 'preview' : 'json';

    // Tabs
    var tabs = el('div', 'me-preview-tabs');
    if (rendererAvailable) {
      var previewTab = el('button', 'me-preview-tab me-preview-tab--active');
      previewTab.textContent = 'Preview';
      previewTab.addEventListener('click', function () {
        commitJsonEdit();
        activeTab = 'preview';
        refreshTabs();
        refreshContent();
      });
      tabs.appendChild(previewTab);
    }
    var jsonTab = el('button', 'me-preview-tab' + (!rendererAvailable ? ' me-preview-tab--active' : ''));
    jsonTab.textContent = 'JSON';
    jsonTab.addEventListener('click', function () {
      activeTab = 'json';
      refreshTabs();
      refreshContent();
    });
    tabs.appendChild(jsonTab);

    // Buttons
    var btnWrap = el('div', 'me-preview-btns');
    var copyBtn = el('button', 'me-preview-btn');
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(JSON.stringify(store.getData(), null, 2)).then(function () {
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });
    var dlBtn = el('button', 'me-preview-btn');
    dlBtn.textContent = 'Download';
    dlBtn.addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(store.getData(), null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', '', { href: url, download: 'menu.json' });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    btnWrap.appendChild(copyBtn);
    btnWrap.appendChild(dlBtn);
    tabs.appendChild(btnWrap);

    container.appendChild(tabs);

    // Zoom state
    var zoomLevel = 0; // 0 = fit, 1-5 = zoom levels
    window.addEventListener('resize', function () { if (iframe) applyZoom(); });
    var ZOOM_SCALES = [0, 0.25, 0.5, 0.75, 1.0, 1.5]; // 0 = auto-fit

    // Zoom controls in tabs bar
    var zoomWrap = el('div', 'me-preview-zoom');
    var zoomOutBtn = el('button', 'me-preview-btn', { title: 'Zoom out' });
    zoomOutBtn.textContent = '\u2212';
    var zoomLabel = el('span', 'me-preview-zoom__label');
    zoomLabel.textContent = 'Fit';
    var zoomInBtn = el('button', 'me-preview-btn', { title: 'Zoom in' });
    zoomInBtn.textContent = '+';
    var zoomFitBtn = el('button', 'me-preview-btn', { title: 'Fit to view' });
    zoomFitBtn.textContent = 'Fit';
    zoomOutBtn.addEventListener('click', function () {
      if (zoomLevel > 0) { zoomLevel--; applyZoom(); }
    });
    zoomInBtn.addEventListener('click', function () {
      if (zoomLevel < ZOOM_SCALES.length - 1) { zoomLevel++; applyZoom(); }
    });
    zoomFitBtn.addEventListener('click', function () {
      zoomLevel = 0; applyZoom();
    });
    zoomWrap.appendChild(zoomOutBtn);
    zoomWrap.appendChild(zoomLabel);
    zoomWrap.appendChild(zoomInBtn);
    zoomWrap.appendChild(zoomFitBtn);
    tabs.appendChild(zoomWrap);

    // Content area
    var contentArea = el('div', 'me-preview-content');
    container.appendChild(contentArea);

    // Preview wrapper — scrollable container for zoomed content
    var previewScroll = el('div', 'me-preview-scroll');
    contentArea.appendChild(previewScroll);

    // Iframe for preview
    var iframe;
    if (rendererAvailable) {
      iframe = el('iframe', 'me-preview-iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      previewScroll.appendChild(iframe);
    }

    // Minimap
    var minimapWrap = el('div', 'me-minimap');
    var minimapCanvas = el('canvas', 'me-minimap__canvas');
    minimapCanvas.width = 160;
    minimapCanvas.height = 90;
    var minimapRect = el('div', 'me-minimap__rect');
    minimapWrap.appendChild(minimapCanvas);
    minimapWrap.appendChild(minimapRect);
    contentArea.appendChild(minimapWrap);

    var currentVpW = 3840, currentVpH = 2160;

    function applyZoom() {
      if (!iframe) return;
      var containerW = previewScroll.clientWidth;
      var containerH = previewScroll.clientHeight;
      var scale;
      if (zoomLevel === 0) {
        // Fit mode
        scale = Math.min(containerW / currentVpW, containerH / currentVpH);
        zoomLabel.textContent = 'Fit';
        previewScroll.style.overflow = 'hidden';
      } else {
        scale = ZOOM_SCALES[zoomLevel];
        zoomLabel.textContent = Math.round(scale * 100) + '%';
        previewScroll.style.overflow = 'auto';
      }
      iframe.style.width = currentVpW + 'px';
      iframe.style.height = currentVpH + 'px';
      iframe.style.transform = 'scale(' + scale + ')';
      iframe.style.transformOrigin = 'top left';
      // Set the scroll container's inner size to match scaled content
      if (zoomLevel > 0) {
        previewScroll.style.setProperty('--scaled-w', (currentVpW * scale) + 'px');
        previewScroll.style.setProperty('--scaled-h', (currentVpH * scale) + 'px');
      }
      updateMinimap();
    }

    function updateMinimap() {
      if (zoomLevel === 0) {
        minimapWrap.style.display = 'none';
        return;
      }
      minimapWrap.style.display = '';

      // Update minimap aspect ratio to match viewport
      var mmMaxW = 160, mmMaxH = 160;
      var aspect = currentVpW / currentVpH;
      var mmW, mmH;
      if (aspect >= 1) {
        mmW = mmMaxW;
        mmH = Math.round(mmMaxW / aspect);
      } else {
        mmH = mmMaxH;
        mmW = Math.round(mmMaxH * aspect);
      }
      minimapCanvas.width = mmW;
      minimapCanvas.height = mmH;
      minimapWrap.style.width = mmW + 'px';
      minimapWrap.style.height = mmH + 'px';
      var containerW = previewScroll.clientWidth;
      var containerH = previewScroll.clientHeight;
      var scale = ZOOM_SCALES[zoomLevel];
      var scaledW = currentVpW * scale;
      var scaledH = currentVpH * scale;

      // Draw minimap background
      var ctx = minimapCanvas.getContext('2d');
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, mmW, mmH);
      ctx.strokeStyle = '#555';
      ctx.strokeRect(0, 0, mmW, mmH);

      // Viewport rect
      var visibleW = Math.min(containerW, scaledW);
      var visibleH = Math.min(containerH, scaledH);
      var scrollX = previewScroll.scrollLeft;
      var scrollY = previewScroll.scrollTop;

      var rectX = (scrollX / scaledW) * mmW;
      var rectY = (scrollY / scaledH) * mmH;
      var rectW = (visibleW / scaledW) * mmW;
      var rectH = (visibleH / scaledH) * mmH;

      minimapRect.style.left = rectX + 'px';
      minimapRect.style.top = rectY + 'px';
      minimapRect.style.width = rectW + 'px';
      minimapRect.style.height = rectH + 'px';
    }

    if (previewScroll) {
      previewScroll.addEventListener('scroll', updateMinimap);
    }

    // JSON output
    var jsonPre = el('pre', 'me-json-output');
    var jsonCode = el('code', 'me-json-code');
    jsonPre.appendChild(jsonCode);
    contentArea.appendChild(jsonPre);

    function refreshTabs() {
      var allTabs = tabs.querySelectorAll('.me-preview-tab');
      allTabs.forEach(function (t) { t.classList.remove('me-preview-tab--active'); });
      if (activeTab === 'preview' && rendererAvailable) {
        allTabs[0].classList.add('me-preview-tab--active');
      } else {
        allTabs[rendererAvailable ? 1 : 0].classList.add('me-preview-tab--active');
      }
    }

    function syntaxHighlight(json) {
      return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
          var cls = 'me-json-number';
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              cls = 'me-json-key';
              match = match.replace(/:$/, '');
              return '<span class="' + cls + '">' + escapeHtml(match) + '</span>:';
            } else {
              cls = 'me-json-string';
            }
          } else if (/true|false/.test(match)) {
            cls = 'me-json-boolean';
          } else if (/null/.test(match)) {
            cls = 'me-json-null';
          }
          return '<span class="' + cls + '">' + escapeHtml(match) + '</span>';
        });
    }

    // Render JSON as line-wrapped HTML and build a path → line map.
    // Walks the data tree producing the same output as JSON.stringify(d, null, 2)
    // but with each line wrapped in <div data-line="N" data-path="..."> for tree-sync.
    var jsonPathToLine = {};

    function renderJsonWithPaths(data) {
      jsonPathToLine = {};
      var lines = [];
      function emit(path, content) {
        var lineIdx = lines.length;
        if (path && jsonPathToLine[path] == null) jsonPathToLine[path] = lineIdx;
        lines.push({ path: path, content: content });
      }
      function indent(n) { return new Array(n * 2 + 1).join(' '); }
      function walk(value, path, depth, trailingComma) {
        var pad = indent(depth);
        var tail = trailingComma ? ',' : '';
        if (value === null) { emit(path, pad + '<span class="me-json-null">null</span>' + tail); return; }
        if (Array.isArray(value)) {
          if (value.length === 0) { emit(path, pad + '[]' + tail); return; }
          emit(path, pad + '[');
          value.forEach(function (v, i) {
            walk(v, path + '[' + i + ']', depth + 1, i < value.length - 1);
          });
          emit(null, pad + ']' + tail);
          return;
        }
        if (typeof value === 'object') {
          var keys = Object.keys(value);
          if (keys.length === 0) { emit(path, pad + '{}' + tail); return; }
          emit(path, pad + '{');
          keys.forEach(function (k, i) {
            var childPath = path ? (path + '.' + k) : k;
            var childPad = indent(depth + 1);
            var keyHtml = '<span class="me-json-key">"' + escapeHtml(k) + '"</span>: ';
            var childVal = value[k];
            var childTail = i < keys.length - 1 ? ',' : '';
            if (childVal === null || typeof childVal !== 'object') {
              // Inline simple value
              var valHtml;
              if (childVal === null) valHtml = '<span class="me-json-null">null</span>';
              else if (typeof childVal === 'string') valHtml = '<span class="me-json-string">"' + escapeHtml(childVal) + '"</span>';
              else if (typeof childVal === 'number') valHtml = '<span class="me-json-number">' + childVal + '</span>';
              else if (typeof childVal === 'boolean') valHtml = '<span class="me-json-boolean">' + childVal + '</span>';
              else valHtml = escapeHtml(String(childVal));
              emit(childPath, childPad + keyHtml + valHtml + childTail);
            } else if (Array.isArray(childVal) && childVal.length === 0) {
              emit(childPath, childPad + keyHtml + '[]' + childTail);
            } else if (typeof childVal === 'object' && Object.keys(childVal).length === 0) {
              emit(childPath, childPad + keyHtml + '{}' + childTail);
            } else if (Array.isArray(childVal)) {
              emit(childPath, childPad + keyHtml + '[');
              childVal.forEach(function (av, ai) {
                walk(av, childPath + '[' + ai + ']', depth + 2, ai < childVal.length - 1);
              });
              emit(null, childPad + ']' + childTail);
            } else {
              emit(childPath, childPad + keyHtml + '{');
              var subKeys = Object.keys(childVal);
              subKeys.forEach(function (sk, si) {
                var grandPath = childPath + '.' + sk;
                var grandPad = indent(depth + 2);
                var sv = childVal[sk];
                var sTail = si < subKeys.length - 1 ? ',' : '';
                var skKeyHtml = '<span class="me-json-key">"' + escapeHtml(sk) + '"</span>: ';
                if (sv === null || typeof sv !== 'object') {
                  var sValHtml;
                  if (sv === null) sValHtml = '<span class="me-json-null">null</span>';
                  else if (typeof sv === 'string') sValHtml = '<span class="me-json-string">"' + escapeHtml(sv) + '"</span>';
                  else if (typeof sv === 'number') sValHtml = '<span class="me-json-number">' + sv + '</span>';
                  else if (typeof sv === 'boolean') sValHtml = '<span class="me-json-boolean">' + sv + '</span>';
                  else sValHtml = escapeHtml(String(sv));
                  emit(grandPath, grandPad + skKeyHtml + sValHtml + sTail);
                } else {
                  // Recurse for deeper nesting
                  var inner = JSON.stringify(sv, null, 2).split('\n');
                  emit(grandPath, grandPad + skKeyHtml + inner[0]);
                  for (var li = 1; li < inner.length; li++) {
                    var line = grandPad + inner[li];
                    if (li === inner.length - 1) line += sTail;
                    emit(null, syntaxHighlight(line));
                  }
                }
              });
              emit(null, childPad + '}' + childTail);
            }
          });
          emit(null, pad + '}' + tail);
          return;
        }
      }
      walk(data, '', 0, false);

      var html = lines.map(function (line, idx) {
        var attrs = ' data-line="' + idx + '"';
        if (line.path) attrs += ' data-path="' + escapeHtml(line.path) + '"';
        return '<div class="me-json-line"' + attrs + '>' + line.content + '</div>';
      }).join('');
      return html;
    }

    function refreshContent() {
      if (activeTab === 'preview' && iframe) {
        previewScroll.style.display = '';
        jsonPre.style.display = 'none';
        zoomWrap.style.display = '';
        updatePreview();
      } else {
        previewScroll.style.display = 'none';
        minimapWrap.style.display = 'none';
        jsonPre.style.display = '';
        zoomWrap.style.display = 'none';
        // Don't clobber the view if the user is currently editing it
        if (document.activeElement !== jsonCode) {
          jsonCode.innerHTML = renderJsonWithPaths(store.getData());
          scrollToSelectedJsonLine(store.getSelectedPath());
        }
      }
    }

    function scrollToSelectedJsonLine(path) {
      if (!path || activeTab !== 'json') return;
      // Clear existing highlights
      jsonCode.querySelectorAll('.me-json-line--selected').forEach(function (n) {
        n.classList.remove('me-json-line--selected');
      });
      // Find the deepest matching path (selection paths can be longer than what's emitted)
      var lineIdx = jsonPathToLine[path];
      if (lineIdx == null) {
        // Try parent paths progressively
        var parts = path.replace(/\[/g, '.[').split('.').filter(Boolean);
        for (var i = parts.length; i > 0; i--) {
          var p = parts.slice(0, i).join('.').replace(/\.\[/g, '[');
          if (jsonPathToLine[p] != null) { lineIdx = jsonPathToLine[p]; break; }
        }
      }
      if (lineIdx == null) return;
      var lineEl = jsonCode.querySelector('.me-json-line[data-line="' + lineIdx + '"]');
      if (lineEl) {
        lineEl.classList.add('me-json-line--selected');
        lineEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    // React to selection changes
    store.on('select', function () {
      if (activeTab === 'json') {
        scrollToSelectedJsonLine(store.getSelectedPath());
      }
    });

    // Make jsonCode editable
    jsonCode.setAttribute('contenteditable', 'plaintext-only');
    jsonCode.setAttribute('spellcheck', 'false');

    // Live edit: parse the textContent on input (debounced) and replace data
    var jsonEditTimer = null;
    var jsonDirty = false;

    function commitJsonEdit() {
      if (!jsonDirty) return false;
      clearTimeout(jsonEditTimer);
      jsonEditTimer = null;
      var text = jsonCode.textContent;
      try {
        var parsed = JSON.parse(text);
        jsonCode.classList.remove('me-json-code--error');
        store.replaceData(parsed, false);
        jsonDirty = false;
        return true;
      } catch (e) {
        jsonCode.classList.add('me-json-code--error');
        return false;
      }
    }

    jsonCode.addEventListener('input', function () {
      jsonDirty = true;
      clearTimeout(jsonEditTimer);
      jsonEditTimer = setTimeout(commitJsonEdit, 500);
    });

    // Flush any pending edit on blur (so tab switches don't lose changes)
    jsonCode.addEventListener('blur', commitJsonEdit);

    // Cmd+A / Ctrl+A inside the JSON view selects only the JSON content.
    // Arrow keys (up/down) when not editing move the highlighted line and select that path.
    jsonCode.addEventListener('keydown', function (e) {
      var isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key === 'a') {
        e.preventDefault();
        e.stopPropagation();
        var range = document.createRange();
        range.selectNodeContents(jsonCode);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      // Arrow navigation between lines that have a path
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (e.altKey || e.metaKey)) {
        e.preventDefault();
        var allLines = Array.prototype.slice.call(jsonCode.querySelectorAll('.me-json-line[data-path]'));
        if (!allLines.length) return;
        var current = jsonCode.querySelector('.me-json-line--selected');
        var idx = current ? allLines.indexOf(current) : -1;
        var nextIdx;
        if (e.key === 'ArrowDown') nextIdx = Math.min(allLines.length - 1, idx + 1);
        else nextIdx = Math.max(0, idx - 1);
        var nextLine = allLines[nextIdx];
        if (nextLine) {
          var p = nextLine.getAttribute('data-path');
          if (p) store.select(p);
        }
      }
    });

    var previewDebounce;
    var iframeReady = false;

    function sendDataToIframe(data) {
      if (!iframe || !iframe.contentWindow) return;
      // Resolve external `uses` references before sending to iframe.
      // If MenuRenderer.resolve isn't available or there's no uses, posts immediately.
      var p;
      if (data.uses && typeof MenuRenderer !== 'undefined' && MenuRenderer.resolve) {
        p = MenuRenderer.resolve(data, window.location.href).catch(function (err) {
          console.warn('[MenuEditor] Failed to resolve uses:', err.message);
          return data;
        });
      } else {
        p = Promise.resolve(data);
      }
      p.then(function (resolved) {
        iframe.contentWindow.postMessage({ type: 'render', data: resolved }, '*');
        setTimeout(function () {
          if (iframe.contentWindow && getGridActive) {
            iframe.contentWindow.postMessage({ type: 'grid', enabled: getGridActive() }, '*');
          }
          applyZoom();
        }, 50);
      });
    }

    function updatePreview() {
      clearTimeout(previewDebounce);
      previewDebounce = setTimeout(function () {
        if (!iframe) return;
        var data = store.getClone();
        data.theme = data.theme || {};
        data.theme.layout = data.theme.layout || {};
        data.theme.layout.mode = 'display';
        // Track viewport dimensions for zoom
        var resMap = { '1080': { w: 1920, h: 1080 }, '2k': { w: 2560, h: 1440 }, '4k': { w: 3840, h: 2160 } };
        var res = resMap[data.theme.layout.resolution] || resMap['4k'];
        var isPort = data.theme.layout.orientation === 'portrait';
        currentVpW = isPort ? res.h : res.w;
        currentVpH = isPort ? res.w : res.h;

        // If iframe is already loaded, just postMessage the new data
        // (avoids reloading the iframe, which would steal focus from inspector inputs)
        if (iframeReady) {
          sendDataToIframe(data);
          return;
        }

        var html = '<!DOCTYPE html><html><head>' +
          '<link rel="stylesheet" href="theme.css">' +
          '<style>' +
          'html,body{margin:0;padding:0;overflow:hidden;background:#000}' +
          '[data-ds-id]{cursor:pointer}' +
          '[data-ds-id]:hover{outline:2px solid rgba(66,165,245,0.4);outline-offset:1px}' +
          '.ds-selected{outline:2px solid rgba(66,165,245,0.8)!important;outline-offset:2px;background:rgba(66,165,245,0.06)!important}' +
          '.ds-pad-handle{position:absolute;background:rgba(66,165,245,0.3);z-index:1000;min-width:6px;min-height:6px}' +
          '.ds-pad-handle--top,.ds-pad-handle--bottom{cursor:ns-resize;left:0;right:0;height:8px}' +
          '.ds-pad-handle--top{top:0}' +
          '.ds-pad-handle--bottom{bottom:0}' +
          '.ds-pad-handle--left,.ds-pad-handle--right{cursor:ew-resize;top:0;bottom:0;width:8px}' +
          '.ds-pad-handle--left{left:0}' +
          '.ds-pad-handle--right{right:0}' +
          '.ds-pad-handle:hover{background:rgba(66,165,245,0.6)}' +
          '</style>' +
          '</head><body>' +
          '<div id="display" style="width:100%;height:100%"></div>' +
          '<script src="renderer.js"><\/script>' +
          '<script>' +
          'var gridOn=false,selectedId=null,rMode="element";' +

          'window.addEventListener("message",function(e){' +
          'var d=e.data;if(!d||!d.type)return;' +
          'if(d.type==="render"){MenuRenderer.render(d.data,document.getElementById("display"));' +
          'if(gridOn){var v=document.querySelector(".ds-viewport");if(v)v.classList.add("ds-debug-grid");}' +
          'bindClicks();if(rMode==="layout")showLayoutHandles();' +
          'else if(selectedId)markSelected(selectedId);}' +
          'if(d.type==="grid"){gridOn=d.enabled;var v=document.querySelector(".ds-viewport");' +
          'if(v){v.classList.toggle("ds-debug-grid",gridOn);}}' +
          'if(d.type==="highlight"){clearCls("ds-highlight");' +
          'if(d.id){var el=byId(d.id);if(el)el.classList.add("ds-highlight");}}' +
          'if(d.type==="select"){selectedId=d.id;if(rMode==="element")markSelected(d.id);}' +
          'if(d.type==="resize-mode"){rMode=d.mode;clearHandles();clearCls("ds-selected");' +
          'if(rMode==="layout")showLayoutHandles();else if(selectedId)markSelected(selectedId);}' +
          '});' +

          'function byId(id){return document.querySelector("[data-ds-id=\\""+id+"\\"]");}' +
          'function clearCls(c){document.querySelectorAll("."+c).forEach(function(x){x.classList.remove(c);});}' +
          'function clearHandles(){document.querySelectorAll(".ds-pad-handle").forEach(function(h){h.remove();});}' +

          // Click-to-select
          'function bindClicks(){' +
          'document.querySelectorAll("[data-ds-id]").forEach(function(el){' +
          'el.addEventListener("click",function(ev){ev.stopPropagation();' +
          'if(rMode!=="element")return;' +
          'var id=el.getAttribute("data-ds-id");selectedId=id;markSelected(id);' +
          'window.parent.postMessage({type:"preview-select",id:id},"*");});});}' +

          // Element mode: select + pad handles on element
          'function markSelected(id){clearCls("ds-selected");clearHandles();' +
          'if(id){var el=byId(id);if(el){el.classList.add("ds-selected");' +
          'el.style.position="relative";' +
          '["top","bottom","left","right"].forEach(function(s){makeDragHandle(el,"preview-pad-drag",id,s);});}}}' +

          // Layout mode: handles on viewport padding, area gaps, gutters
          'function showLayoutHandles(){clearHandles();' +
          'var vp=document.querySelector(".ds-viewport");if(!vp)return;' +
          'var areas=document.querySelector(".ds-areas");if(!areas)return;' +
          // Viewport padding handles
          'vp.style.position="relative";' +
          '["top","bottom","left","right"].forEach(function(s){' +
          'makeDragHandle(areas,"preview-layout-drag",null,s,"viewport_padding."+s);});' +
          // Area gap handles — between area rows
          'var areaEls=areas.children;' +
          'for(var i=1;i<areaEls.length;i++){' +
          'var prev=areaEls[i-1];prev.style.position="relative";' +
          'var h=document.createElement("div");h.className="ds-pad-handle ds-pad-handle--bottom ds-pad-handle--gap";' +
          'h.style.background="rgba(76,175,80,0.3)";' +
          'h.addEventListener("mousedown",makeGapDragger(prev,"row_gutter"));prev.appendChild(h);}' +
          '}' +

          // Drag handle factory for padding
          'function makeDragHandle(parent,msgType,id,side,prop){' +
          'var d=document.createElement("div");d.className="ds-pad-handle ds-pad-handle--"+side;' +
          'if(msgType==="preview-layout-drag")d.style.background="rgba(255,152,0,0.3)";' +
          'd.addEventListener("mousedown",function(ev){ev.stopPropagation();ev.preventDefault();' +
          'window.parent.postMessage({type:"preview-pad-start"},"*");' +
          'var startY=ev.clientY,startX=ev.clientX;' +
          'var cs=getComputedStyle(parent);var startVal=parseFloat(cs["padding-"+side])||0;' +
          'function onMove(mv){' +
          'var delta=(side==="top"||side==="bottom")?(mv.clientY-startY):(mv.clientX-startX);' +
          'if(side==="top"||side==="left")delta=-delta;' +
          'var nv=Math.max(0,startVal+delta);parent.style["padding-"+side]=nv+"px";' +
          'window.parent.postMessage({type:msgType,id:id,side:side,px:nv,prop:prop},"*");}' +
          'function onUp(){document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);}' +
          'document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);});' +
          'parent.appendChild(d);}' +

          // Gap drag handler
          'function makeGapDragger(el,prop){return function(ev){ev.stopPropagation();ev.preventDefault();' +
          'window.parent.postMessage({type:"preview-pad-start"},"*");' +
          'var startY=ev.clientY;var cs=getComputedStyle(el);var startVal=parseFloat(cs.marginBottom)||0;' +
          'function onMove(mv){var delta=mv.clientY-startY;var nv=Math.max(0,startVal+delta);' +
          'window.parent.postMessage({type:"preview-layout-drag",prop:prop,px:nv,side:"gap"},"*");}' +
          'function onUp(){document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);}' +
          'document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);};}' +

          '<\/script></body></html>';
        iframe.srcdoc = html;
        iframe.onload = function () {
          iframeReady = true;
          sendDataToIframe(data);
        };
      }, 200);
    }

    store.on('change', refreshContent);
    refreshContent();
  }

  // ── Import Modal ───────────────────────────────────────────────────────

  function showImportModal(store, refreshAll) {
    var overlay = el('div', 'me-modal-overlay');
    var modal = el('div', 'me-modal');

    var title = el('h3', 'me-modal__title');
    title.textContent = 'Import JSON';
    modal.appendChild(title);

    var textarea = el('textarea', 'me-modal__textarea', { placeholder: 'Paste JSON here...', rows: '12' });
    modal.appendChild(textarea);

    var fileLabel = el('label', 'me-modal__file-label');
    fileLabel.textContent = 'Or load from file: ';
    var fileInput = el('input', '', { type: 'file', accept: '.json' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { textarea.value = reader.result; };
      reader.readAsText(f);
    });
    fileLabel.appendChild(fileInput);
    modal.appendChild(fileLabel);

    var errMsg = el('div', 'me-modal__error');
    modal.appendChild(errMsg);

    var btnRow = el('div', 'me-modal__btns');
    var cancelBtn = el('button', 'me-modal__btn');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () { document.body.removeChild(overlay); });
    var importBtn = el('button', 'me-modal__btn me-modal__btn--primary');
    importBtn.textContent = 'Import';
    importBtn.addEventListener('click', function () {
      try {
        var data = JSON.parse(textarea.value);
        store.replaceData(data, true);
        document.body.removeChild(overlay);
      } catch (e) {
        errMsg.textContent = 'Invalid JSON: ' + e.message;
      }
    });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(importBtn);
    modal.appendChild(btnRow);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    textarea.focus();
  }

  // ── Main Create ────────────────────────────────────────────────────────

  function create(targetElement, options) {
    options = options || {};
    var rendererAvailable = options.rendererAvailable !== undefined
      ? options.rendererAvailable
      : (typeof MenuRenderer !== 'undefined' && typeof MenuRenderer.render === 'function');

    // Persist editor state to localStorage. Restore on load if no explicit data passed.
    var STORAGE_KEY = options.storageKey || 'menu-editor:last';
    var initialData = options.data;
    if (!initialData && options.persist !== false) {
      try {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) initialData = JSON.parse(saved);
      } catch (e) { /* ignore */ }
    }

    var userOnChange = options.onChange;
    var wrappedOnChange = function (data) {
      if (options.persist !== false) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      }
      if (userOnChange) userOnChange(data);
    };

    // Auto-assign IDs to all entities so click-to-select works
    if (initialData && typeof MenuRenderer !== 'undefined' && MenuRenderer.autoAssignIds) {
      MenuRenderer.autoAssignIds(initialData);
    }

    var store = createDataStore(initialData, wrappedOnChange);

    // Re-run autoAssignIds on every change so newly added entities get IDs
    if (typeof MenuRenderer !== 'undefined' && MenuRenderer.autoAssignIds) {
      store.on('change', function () {
        MenuRenderer.autoAssignIds(store.getData());
      });
    }

    // Persist & restore selected path
    var SEL_KEY = 'me-editor:selected';
    try {
      var savedSel = localStorage.getItem(SEL_KEY);
      if (savedSel) store.select(savedSel);
    } catch (e) {}
    store.on('select', function () {
      try { localStorage.setItem(SEL_KEY, store.getSelectedPath()); } catch (e) {}
    });

    // Root
    var root = el('div', 'me-editor-root');
    targetElement.innerHTML = '';
    targetElement.appendChild(root);

    // Toolbar
    var toolbar = el('div', 'me-toolbar');

    var newBtn = el('button', 'me-toolbar__btn', { title: 'New' });
    newBtn.textContent = 'New';
    newBtn.addEventListener('click', function () {
      store.replaceData(BLANK_TEMPLATE, true);
    });

    var importBtn = el('button', 'me-toolbar__btn', { title: 'Import' });
    importBtn.textContent = 'Import';
    importBtn.addEventListener('click', function () {
      showImportModal(store);
    });

    var exportBtn = el('button', 'me-toolbar__btn', { title: 'Export' });
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(store.getData(), null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', '', { href: url, download: 'menu.json' });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    var undoBtn = el('button', 'me-toolbar__btn', { title: 'Undo (Ctrl+Z)' });
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', function () { store.undo(); });

    var redoBtn = el('button', 'me-toolbar__btn', { title: 'Redo (Ctrl+Shift+Z)' });
    redoBtn.textContent = 'Redo';
    redoBtn.addEventListener('click', function () { store.redo(); });

    function updateUndoRedoBtns() {
      undoBtn.disabled = !store.canUndo();
      redoBtn.disabled = !store.canRedo();
    }
    store.on('change', updateUndoRedoBtns);
    updateUndoRedoBtns();

    var gridActive = false;
    var gridBtn = el('button', 'me-toolbar__btn', { title: 'Toggle Grid Overlay' });
    gridBtn.textContent = 'Grid';
    gridBtn.addEventListener('click', function () {
      gridActive = !gridActive;
      gridBtn.classList.toggle('me-toolbar__btn--active', gridActive);
      // Send grid toggle to preview iframe
      var iframeEl = root.querySelector('.me-preview-iframe');
      if (iframeEl && iframeEl.contentWindow) {
        iframeEl.contentWindow.postMessage({ type: 'grid', enabled: gridActive }, '*');
      }
    });

    toolbar.appendChild(newBtn);
    toolbar.appendChild(importBtn);
    toolbar.appendChild(exportBtn);
    var sep = el('span', 'me-toolbar__sep');
    toolbar.appendChild(sep);
    toolbar.appendChild(undoBtn);
    toolbar.appendChild(redoBtn);
    var pngBtn = el('button', 'me-toolbar__btn', { title: 'Export PNG at full resolution' });
    pngBtn.textContent = 'Export PNG';
    pngBtn.addEventListener('click', function () {
      if (typeof html2canvas === 'undefined') {
        console.error('[MenuEditor] html2canvas is required for PNG export. Include it via script tag.');
        return;
      }
      pngBtn.disabled = true;
      pngBtn.textContent = 'Rendering...';

      // Create offscreen container at full native resolution
      var offscreen = el('div', '', {
        style: 'position:fixed;left:-99999px;top:0;z-index:-1;'
      });
      document.body.appendChild(offscreen);

      // Render at full resolution with no preview scaling
      var data = store.getClone();
      data.theme = data.theme || {};
      data.theme.layout = data.theme.layout || {};
      data.theme.layout.mode = 'display';

      // Load renderer styles
      var style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = 'theme.css';
      offscreen.appendChild(style);

      var renderTarget = el('div');
      offscreen.appendChild(renderTarget);

      // Wait for styles to load then render and capture
      setTimeout(function () {
        MenuRenderer.render(data, renderTarget);

        var viewport = renderTarget.querySelector('.ds-viewport');
        if (!viewport) {
          cleanup();
          return;
        }

        html2canvas(viewport, {
          backgroundColor: null,
          scale: 1,
          width: viewport.offsetWidth,
          height: viewport.offsetHeight,
          logging: false
        }).then(function (canvas) {
          canvas.toBlob(function (blob) {
            var url = URL.createObjectURL(blob);
            var a = el('a', '', { href: url, download: 'menu.png' });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            cleanup();
          }, 'image/png');
        }).catch(function (err) {
          console.error('[MenuEditor] PNG export failed:', err);
          cleanup();
        });
      }, 200);

      function cleanup() {
        document.body.removeChild(offscreen);
        pngBtn.disabled = false;
        pngBtn.textContent = 'Export PNG';
      }
    });

    // Resize mode toggle
    var resizeMode = 'element'; // 'element' or 'layout'
    var resizeModeBtn = el('button', 'me-toolbar__btn', { title: 'Toggle resize mode' });
    resizeModeBtn.textContent = 'Resize: Element';
    resizeModeBtn.addEventListener('click', function () {
      resizeMode = resizeMode === 'element' ? 'layout' : 'element';
      resizeModeBtn.textContent = 'Resize: ' + resizeMode.charAt(0).toUpperCase() + resizeMode.slice(1);
      resizeModeBtn.classList.toggle('me-toolbar__btn--active', resizeMode === 'layout');
      var iframeEl = root.querySelector('.me-preview-iframe');
      if (iframeEl && iframeEl.contentWindow) {
        iframeEl.contentWindow.postMessage({ type: 'resize-mode', mode: resizeMode }, '*');
      }
    });

    var sep2 = el('span', 'me-toolbar__sep');
    toolbar.appendChild(sep2);
    toolbar.appendChild(gridBtn);
    toolbar.appendChild(pngBtn);
    toolbar.appendChild(resizeModeBtn);

    // Examples dropdown
    var sep3 = el('span', 'me-toolbar__sep');
    toolbar.appendChild(sep3);
    var exLabel = el('span', 'me-toolbar__label');
    exLabel.textContent = 'Examples';
    toolbar.appendChild(exLabel);
    var exSelect = el('select', 'me-toolbar__select');
    var exOpts = [
      { value: '', label: '— load —' },
      { value: 'examples/coffee.json', label: 'Coffee Shop' },
      { value: 'examples/cafe.json', label: 'Cafe' },
      { value: 'examples/bakery.json', label: 'Bakery' },
      { value: 'examples/indian.json', label: 'Indian (Rupees)' },
      { value: 'examples/pub.json', label: 'English Pub (Pounds)' },
      { value: 'examples/surf-shop.json', label: 'Surf Shop' },
      { value: 'examples/server-status.json', label: 'Server Status' },
      { value: 'examples/themed.json', label: 'Themed (uses + refs)' },
      { value: 'examples/minimal.json', label: 'Minimal' }
    ];
    exOpts.forEach(function (o) {
      var opt = el('option');
      opt.value = o.value;
      opt.textContent = o.label;
      exSelect.appendChild(opt);
    });
    exSelect.addEventListener('change', function () {
      var url = exSelect.value;
      if (!url) return;
      fetch(url).then(function (r) { return r.json(); }).then(function (data) {
        store.replaceData(data, true);
      });
      exSelect.value = '';
    });
    toolbar.appendChild(exSelect);

    root.appendChild(toolbar);

    // Panels
    var panels = el('div', 'me-panels');

    var treePanel = el('div', 'me-panel me-panel--tree');
    var treePanelHeader = el('div', 'me-panel__header');
    treePanelHeader.textContent = 'Structure';
    treePanel.appendChild(treePanelHeader);
    var treeContent = el('div', 'me-panel__content me-tree-content');
    treePanel.appendChild(treeContent);

    var inspectorPanel = el('div', 'me-panel me-panel--inspector');
    var inspPanelHeader = el('div', 'me-panel__header');
    inspPanelHeader.textContent = 'Properties';
    inspectorPanel.appendChild(inspPanelHeader);
    var inspContent = el('div', 'me-panel__content me-inspector-content');
    inspectorPanel.appendChild(inspContent);

    var previewPanel = el('div', 'me-panel me-panel--preview');
    var prevContent = el('div', 'me-panel__content me-preview-panel-content');
    previewPanel.appendChild(prevContent);

    // Restore saved panel widths
    var PANEL_KEY = 'me-editor:panels';
    var savedSizes = {};
    try { savedSizes = JSON.parse(localStorage.getItem(PANEL_KEY) || '{}'); } catch (e) {}
    if (savedSizes.tree) treePanel.style.width = savedSizes.tree + 'px';
    if (savedSizes.inspector) inspectorPanel.style.width = savedSizes.inspector + 'px';

    function makeResizer(targetPanel, key) {
      var r = el('div', 'me-resizer');
      r.addEventListener('mousedown', function (e) {
        e.preventDefault();
        var startX = e.clientX;
        var startW = targetPanel.getBoundingClientRect().width;
        // Overlay blocks iframe from capturing mouse events during drag
        var overlay = el('div', 'me-drag-overlay');
        document.body.appendChild(overlay);
        function move(ev) {
          var w = Math.max(140, startW + (ev.clientX - startX));
          targetPanel.style.width = w + 'px';
          window.dispatchEvent(new Event('resize'));
        }
        function up() {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          savedSizes[key] = parseInt(targetPanel.style.width, 10);
          try { localStorage.setItem(PANEL_KEY, JSON.stringify(savedSizes)); } catch (e) {}
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
      return r;
    }

    panels.appendChild(treePanel);
    panels.appendChild(makeResizer(treePanel, 'tree'));
    panels.appendChild(inspectorPanel);
    panels.appendChild(makeResizer(inspectorPanel, 'inspector'));
    panels.appendChild(previewPanel);
    root.appendChild(panels);

    // Initialize panels
    createTreePanel(treeContent, store);
    createInspectorPanel(inspContent, store);
    createPreviewPanel(prevContent, store, rendererAvailable, function () { return gridActive; });

    // Listen for messages from preview iframe
    function findPathById(id, obj, prefix) {
      if (!obj) return null;
      if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) {
          var p = findPathById(id, obj[i], prefix + '[' + i + ']');
          if (p) return p;
        }
        return null;
      }
      if (obj.id === id) return prefix;
      if (obj.areas) {
        var p = findPathById(id, obj.areas, prefix + '.areas');
        if (p) return p;
      }
      if (obj.items) {
        var p = findPathById(id, obj.items, prefix + '.items');
        if (p) return p;
      }
      if (obj.variations) {
        var p = findPathById(id, obj.variations, prefix + '.variations');
        if (p) return p;
      }
      return null;
    }

    function messageHandler(e) {
      if (!e.data || !e.data.type) return;

      if (e.data.type === 'preview-select') {
        // Click-to-select: find the path for this ID and select it
        var d = store.getData();
        var path = findPathById(e.data.id, d.areas, 'areas');
        if (!path && d.header && d.header.elements) {
          path = findPathById(e.data.id, d.header.elements, 'header.elements');
        }
        if (path) {
          // Ensure inspector panel is wide enough to be visible
          var insp = root.querySelector('.me-panel--inspector');
          if (insp && insp.getBoundingClientRect().width < 200) {
            insp.style.width = '300px';
            window.dispatchEvent(new Event('resize'));
          }
          store.select(path);
          // Scroll inspector to top so user sees the new selection
          var inspContent = root.querySelector('.me-inspector-content');
          if (inspContent) inspContent.scrollTop = 0;
        }
      }

      if (e.data.type === 'preview-pad-start') {
        store.snapshotNow();
      }

      if (e.data.type === 'preview-pad-drag') {
        // Padding drag: convert px to % and update
        var id = e.data.id;
        var side = e.data.side;
        var px = e.data.px;
        var path = findPathById(id, store.getData().areas, 'areas');
        if (!path) return;

        // Convert px to % based on side orientation
        var data = store.getData();
        var resMap = { '1080': { w: 1920, h: 1080 }, '2k': { w: 2560, h: 1440 }, '4k': { w: 3840, h: 2160 } };
        var lo = (data.theme && data.theme.layout) || {};
        var res = resMap[lo.resolution] || resMap['4k'];
        var isPort = lo.orientation === 'portrait';
        var vpW = isPort ? res.h : res.w;
        var vpH = isPort ? res.w : res.h;

        var pct;
        if (side === 'top' || side === 'bottom') {
          pct = Math.round((px / vpH) * 10000) / 100;
        } else {
          pct = Math.round((px / vpW) * 10000) / 100;
        }

        // Get current padding, update the side
        var currentPad = getAtPath(store.getData(), path + '.padding');
        var padObj;
        if (currentPad == null || typeof currentPad === 'number') {
          var uniform = currentPad || 0;
          padObj = { top: uniform, right: uniform, bottom: uniform, left: uniform };
        } else {
          padObj = { top: currentPad.top || 0, right: currentPad.right || 0, bottom: currentPad.bottom || 0, left: currentPad.left || 0 };
        }
        padObj[side] = pct;
        store.updateSilent(path + '.padding', padObj);
      }

      if (e.data.type === 'preview-layout-drag') {
        // Layout drag: convert px to % and update a layout property
        var prop = e.data.prop;
        var side = e.data.side;
        var px = e.data.px;

        var data = store.getData();
        var resMap = { '1080': { w: 1920, h: 1080 }, '2k': { w: 2560, h: 1440 }, '4k': { w: 3840, h: 2160 } };
        var lo = (data.theme && data.theme.layout) || {};
        var res = resMap[lo.resolution] || resMap['4k'];
        var isPort = lo.orientation === 'portrait';
        var vpW = isPort ? res.h : res.w;
        var vpH = isPort ? res.w : res.h;

        if (prop === 'row_gutter') {
          var pct = Math.round((px / vpH) * 10000) / 100;
          store.updateSilent('theme.layout.row_gutter', pct);
        } else if (prop && prop.indexOf('viewport_padding.') === 0) {
          var padSide = prop.split('.')[1];
          var pct;
          if (padSide === 'top' || padSide === 'bottom') {
            pct = Math.round((px / vpH) * 10000) / 100;
          } else {
            pct = Math.round((px / vpW) * 10000) / 100;
          }
          var currentPad = getAtPath(data, 'theme.layout.viewport_padding');
          var padObj;
          if (currentPad == null || typeof currentPad === 'number') {
            var u = currentPad || 0;
            padObj = { top: u, right: u, bottom: u, left: u };
          } else {
            padObj = { top: currentPad.top || 0, right: currentPad.right || 0, bottom: currentPad.bottom || 0, left: currentPad.left || 0 };
          }
          padObj[padSide] = pct;
          store.updateSilent('theme.layout.viewport_padding', padObj);
        }
      }
    }

    window.addEventListener('message', messageHandler);

    // Sync selection to iframe
    store.on('select', function () {
      var path = store.getSelectedPath();
      var obj = getAtPath(store.getData(), path);
      var id = obj && obj.id ? obj.id : null;
      var iframeEl = root.querySelector('.me-preview-iframe');
      if (iframeEl && iframeEl.contentWindow) {
        iframeEl.contentWindow.postMessage({ type: 'select', id: id }, '*');
      }
    });

    // Keyboard shortcuts — listen on document so they fire from anywhere on the page
    root.setAttribute('tabindex', '0');
    var keyHandler = function (e) {
      // Only handle if the editor root is in the DOM (it might not be if destroy() was called)
      if (!root.isConnected) return;
      var t = e.target;
      var inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      var isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        // Don't override native undo in text inputs
        if (inField) return;
        e.preventDefault();
        store.undo();
      } else if (isCtrl && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        store.redo();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Don't hijack arrows when typing in inputs/textareas/contenteditable
        if (inField) return;
        // Find all selectable nodes in the tree (anything with [data-path] in the tree, plus tree node headers)
        var selectables = Array.prototype.slice.call(treeContent.querySelectorAll('.me-tree-node__header'));
        // Filter out non-selectable section headers (Areas/Header labels)
        selectables = selectables.filter(function (el) {
          // section headers are non-selectable; their parent text is "AREAS" / "HEADER"
          return !el.classList.contains('me-tree-node__header--section') ||
                 el.classList.contains('me-tree-node__header--selected');
        });
        if (!selectables.length) return;
        var currentIdx = -1;
        for (var i = 0; i < selectables.length; i++) {
          if (selectables[i].classList.contains('me-tree-node__header--selected')) {
            currentIdx = i;
            break;
          }
        }
        var nextIdx;
        if (e.key === 'ArrowDown') nextIdx = Math.min(selectables.length - 1, currentIdx + 1);
        else nextIdx = Math.max(0, currentIdx - 1);
        if (nextIdx !== currentIdx && selectables[nextIdx]) {
          e.preventDefault();
          selectables[nextIdx].click();
          // Scroll the selected node into view in the tree
          selectables[nextIdx].scrollIntoView({ block: 'nearest' });
        }
      }
    };
    document.addEventListener('keydown', keyHandler);

    return {
      getData: function () { return store.getClone(); },
      setData: function (data) { store.replaceData(data, true); },
      destroy: function () {
        window.removeEventListener('message', messageHandler);
        document.removeEventListener('keydown', keyHandler);
        targetElement.innerHTML = '';
      },
      on: function (event, handler) { store.on(event, handler); }
    };
  }

  return { create: create };
})();
