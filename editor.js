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

  var BLANK_TEMPLATE = {
    layout: {
      resolution: '4k',
      orientation: 'landscape',
      background_color: '#1a1a1a',
      container: { columns: 1 }
    },
    theme: {},
    areas: [
      { id: 'area-1', title: 'Menu', column_count: 1, items: [
        { id: 'item-1', name: 'Item 1', price: '0.00' }
      ]}
    ]
  };

  var MAX_UNDO = 50;

  // ── Utilities ──────────────────────────────────────────────────────────

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
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
    var selectedPath = 'layout';
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

      replaceData: function (newData, resetUndo) {
        if (resetUndo) {
          undoStack = [];
          redoStack = [];
        } else {
          snapshot();
        }
        data = deepClone(newData);
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
          selectedPath = parentPath(path) || 'layout';
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

  var FIELD_DEFS = {
    layout: [
      { key: 'resolution', type: 'select', options: ['1080', '2k', '4k'], label: 'Resolution' },
      { key: 'orientation', type: 'select', options: ['landscape', 'portrait'], label: 'Orientation' },
      { key: 'background_color', type: 'color', label: 'Background Color' },
      { key: 'viewport_padding', type: 'padding', label: 'Viewport Padding' },
      { key: 'area_gap', type: 'number', label: 'Area Gap (px)' },
      { group: 'Container', fields: [
        { key: 'container.columns', type: 'select', options: ['1', '2', '3'], label: 'Columns' },
        { key: 'container.gutter', type: 'number', label: 'Gutter (px)' }
      ]},
      { group: 'Title', fields: [
        { key: 'title.text', type: 'text', label: 'Text' },
        { key: 'title.font', type: 'font', label: 'Font' },
        { key: 'title.position.x_align', type: 'select', options: ['left', 'center', 'right'], label: 'Alignment' },
        { key: 'title.position.top_padding', type: 'number', label: 'Top Padding (px)' }
      ]},
      { group: 'Logo', fields: [
        { key: 'logo.src', type: 'text', label: 'Image URL' },
        { key: 'logo.x_align', type: 'select', options: ['left', 'right'], label: 'Alignment' },
        { key: 'logo.top_padding', type: 'number', label: 'Top Padding (px)' },
        { key: 'logo.max_height', type: 'number', label: 'Max Height (px)' }
      ]}
    ],
    theme: [
      { key: 'area_title_font', type: 'font', label: 'Area Title Font' },
      { key: 'item_name_font', type: 'font', label: 'Item Name Font' },
      { key: 'item_price_font', type: 'font', label: 'Item Price Font' },
      { key: 'variation_font', type: 'font', label: 'Variation Font' },
      { key: 'divider_color', type: 'color', label: 'Divider Color' },
      { key: 'area_background', type: 'color', label: 'Area Background' }
    ],
    area: [
      { key: 'id', type: 'text', label: 'ID' },
      { key: 'title', type: 'text', label: 'Title' },
      { key: 'align', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Title Align' },
      { key: 'valign', type: 'select', options: ['', 'top', 'center', 'bottom'], label: 'Vertical Align' },
      { key: 'column_count', type: 'number', label: 'Item Columns' },
      { key: 'columns', type: 'number', label: 'Sub-Area Columns' },
      { key: 'gutter', type: 'number', label: 'Gutter (px)' },
      { key: 'item_align', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Item Align' },
      { key: 'price_align', type: 'select', options: ['', 'left', 'right'], label: 'Price Align' },
      { key: 'padding', type: 'padding', label: 'Padding' }
    ],
    item: [
      { key: 'id', type: 'text', label: 'ID' },
      { key: 'name', type: 'text', label: 'Name' },
      { key: 'description', type: 'text', label: 'Description' },
      { key: 'price', type: 'text', label: 'Price' },
      { key: 'align', type: 'select', options: ['', 'left', 'center', 'right'], label: 'Align' },
      { key: 'hide_if_empty', type: 'checkbox', label: 'Hide If Empty' },
      { key: 'padding', type: 'padding', label: 'Padding' }
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
      var timer;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          store.update(fullPath, input.value || undefined);
        }, 300);
      });
      wrapper.appendChild(label);
      wrapper.appendChild(input);

    } else if (fieldDef.type === 'number') {
      var input = el('input', 'me-field__input', { type: 'number' });
      input.value = value != null ? value : '';
      input.addEventListener('input', function () {
        var v = input.value === '' ? undefined : parseFloat(input.value);
        store.update(fullPath, v);
      });
      wrapper.appendChild(label);
      wrapper.appendChild(input);

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
      cb.checked = !!value;
      cb.addEventListener('change', function () {
        store.update(fullPath, cb.checked || undefined);
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

    } else if (fieldDef.type === 'padding') {
      var padVal = value;
      var isUniform = padVal == null || typeof padVal === 'number';
      var padWrap = el('div', 'me-padding-editor');

      var modeBtn = el('button', 'me-padding-editor__toggle');
      modeBtn.textContent = isUniform ? 'Per-side' : 'Uniform';

      var uniformInput = el('input', 'me-field__input', { type: 'number', placeholder: '0' });
      uniformInput.value = isUniform ? (padVal || '') : '';

      var perSideWrap = el('div', 'me-padding-editor__sides');
      var sides = ['top', 'right', 'bottom', 'left'];
      var sideInputs = {};
      sides.forEach(function (s) {
        var sideGroup = el('div', 'me-padding-editor__side');
        var sLabel = el('span', 'me-padding-editor__side-label');
        sLabel.textContent = s.charAt(0).toUpperCase();
        var sInput = el('input', 'me-field__input me-field__input--tiny', { type: 'number', placeholder: '0' });
        sInput.value = (!isUniform && padVal && padVal[s]) ? padVal[s] : '';
        sInput.addEventListener('input', function () {
          var obj = {};
          sides.forEach(function (side) {
            var v = sideInputs[side].value;
            if (v !== '') obj[side] = parseFloat(v);
          });
          store.update(fullPath, Object.keys(obj).length ? obj : undefined);
        });
        sideInputs[s] = sInput;
        sideGroup.appendChild(sLabel);
        sideGroup.appendChild(sInput);
        perSideWrap.appendChild(sideGroup);
      });

      uniformInput.addEventListener('input', function () {
        var v = uniformInput.value === '' ? undefined : parseFloat(uniformInput.value);
        store.update(fullPath, v);
      });

      modeBtn.addEventListener('click', function () {
        isUniform = !isUniform;
        modeBtn.textContent = isUniform ? 'Per-side' : 'Uniform';
        uniformInput.style.display = isUniform ? '' : 'none';
        perSideWrap.style.display = isUniform ? 'none' : '';
        if (isUniform) {
          store.update(fullPath, uniformInput.value ? parseFloat(uniformInput.value) : undefined);
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
      szLabel.textContent = 'Size';
      var szInput = el('input', 'me-field__input', { type: 'text', placeholder: '22px' });
      szInput.value = fontVal.size || '';
      var szTimer;
      szInput.addEventListener('input', function () {
        clearTimeout(szTimer);
        szTimer = setTimeout(function () {
          store.update(fullPath + '.size', szInput.value || undefined);
        }, 300);
      });
      szWrap.appendChild(szLabel);
      szWrap.appendChild(szInput);
      fontGroup.appendChild(szWrap);

      wrapper.appendChild(label);
      wrapper.appendChild(fontGroup);
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
      if (path === 'layout') return 'layout';
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
      if (path === 'layout') return 'Layout';
      if (path === 'theme') return 'Theme';
      if (obj.title) return obj.title;
      if (obj.name) return obj.name;
      if (obj.id) return obj.id;
      return '(untitled)';
    }

    function getNodeIcon(type) {
      var icons = {
        layout: '\u2630', // trigram
        theme: '\u2726',  // star
        area: '\u25A1',   // square
        item: '\u2022',   // bullet
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

      // Action buttons on hover
      var actions = el('span', 'me-tree-actions');

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

      // Layout node
      container.appendChild(buildNode('layout', data.layout || {}, 'layout', 0));

      // Theme node
      container.appendChild(buildNode('theme', data.theme || {}, 'theme', 0));

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
    var collapsedGroups = new Set();

    function refresh() {
      container.innerHTML = '';
      var path = store.getSelectedPath();
      var data = store.getData();
      var value = getAtPath(data, path);

      if (value == null && path !== 'layout' && path !== 'theme') {
        var msg = el('div', 'me-inspector__empty');
        msg.textContent = 'Select a node in the tree';
        container.appendChild(msg);
        return;
      }

      // Determine type
      var type;
      if (path === 'layout') type = 'layout';
      else if (path === 'theme') type = 'theme';
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
          var isCollapsed = collapsedGroups.has(def.group);
          groupArrow.textContent = isCollapsed ? '\u25B6' : '\u25BC';
          var groupLabel = el('span');
          groupLabel.textContent = def.group;
          groupHeader.appendChild(groupArrow);
          groupHeader.appendChild(groupLabel);
          groupHeader.addEventListener('click', function () {
            if (collapsedGroups.has(def.group)) {
              collapsedGroups.delete(def.group);
            } else {
              collapsedGroups.add(def.group);
            }
            refresh();
          });
          groupEl.appendChild(groupHeader);

          if (!isCollapsed) {
            var groupBody = el('div', 'me-inspector-group__body');
            def.fields.forEach(function (fieldDef) {
              renderField(groupBody, path, fieldDef, store);
            });
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

    // Content area
    var contentArea = el('div', 'me-preview-content');
    container.appendChild(contentArea);

    // Iframe for preview
    var iframe;
    if (rendererAvailable) {
      iframe = el('iframe', 'me-preview-iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      contentArea.appendChild(iframe);
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

    function refreshContent() {
      if (activeTab === 'preview' && iframe) {
        iframe.style.display = '';
        jsonPre.style.display = 'none';
        updatePreview();
      } else {
        if (iframe) iframe.style.display = 'none';
        jsonPre.style.display = '';
        var jsonStr = JSON.stringify(store.getData(), null, 2);
        jsonCode.innerHTML = syntaxHighlight(escapeHtml(jsonStr));
      }
    }

    var previewDebounce;
    function updatePreview() {
      clearTimeout(previewDebounce);
      previewDebounce = setTimeout(function () {
        if (!iframe) return;
        var data = store.getClone();
        data.layout = data.layout || {};
        data.layout.mode = 'preview';
        var html = '<!DOCTYPE html><html><head>' +
          '<link rel="stylesheet" href="theme.css">' +
          '<style>html,body{margin:0;padding:0;overflow:hidden;background:#000;width:100%;height:100%}</style>' +
          '</head><body>' +
          '<div id="display" style="width:100%;height:100%"></div>' +
          '<script src="renderer.js"><\/script>' +
          '<script>' +
          'var gridOn=false;' +
          'window.addEventListener("message",function(e){' +
          'if(e.data&&e.data.type==="render"){' +
          'MenuRenderer.render(e.data.data,document.getElementById("display"));' +
          'if(gridOn){var v=document.querySelector(".ds-viewport");if(v)v.classList.add("ds-debug-grid");}}' +
          'if(e.data&&e.data.type==="grid"){' +
          'gridOn=e.data.enabled;var v=document.querySelector(".ds-viewport");' +
          'if(v){if(gridOn)v.classList.add("ds-debug-grid");else v.classList.remove("ds-debug-grid");}}});' +
          '<\/script></body></html>';
        iframe.srcdoc = html;
        iframe.onload = function () {
          iframe.contentWindow.postMessage({ type: 'render', data: data }, '*');
          // Re-apply grid state after render
          setTimeout(function () {
            if (iframe.contentWindow && getGridActive) {
              iframe.contentWindow.postMessage({ type: 'grid', enabled: getGridActive() }, '*');
            }
          }, 100);
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

    var store = createDataStore(options.data, options.onChange);

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
      data.layout = data.layout || {};
      data.layout.mode = 'display';

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

    var sep2 = el('span', 'me-toolbar__sep');
    toolbar.appendChild(sep2);
    toolbar.appendChild(gridBtn);
    toolbar.appendChild(pngBtn);

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
      { value: 'examples/surf-shop.json', label: 'Surf Shop' },
      { value: 'examples/server-status.json', label: 'Server Status' },
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

    panels.appendChild(treePanel);
    panels.appendChild(inspectorPanel);
    panels.appendChild(previewPanel);
    root.appendChild(panels);

    // Initialize panels
    createTreePanel(treeContent, store);
    createInspectorPanel(inspContent, store);
    createPreviewPanel(prevContent, store, rendererAvailable, function () { return gridActive; });

    // Keyboard shortcuts
    root.setAttribute('tabindex', '0');
    root.addEventListener('keydown', function (e) {
      var isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if (isCtrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        store.redo();
      } else if (isCtrl && e.key === 'Z') {
        e.preventDefault();
        store.redo();
      }
    });

    return {
      getData: function () { return store.getClone(); },
      setData: function (data) { store.replaceData(data, true); },
      destroy: function () { targetElement.innerHTML = ''; },
      on: function (event, handler) { store.on(event, handler); }
    };
  }

  return { create: create };
})();
