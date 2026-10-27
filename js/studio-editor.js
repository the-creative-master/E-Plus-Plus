/* Lightweight, offline syntax colouring for the Studio's native textarea.
 * The textarea remains the editable, accessible source of truth. The layer
 * below it never interprets markup from a program as HTML.
 */
(function (global) {
  'use strict';
  var EPP = global.EPP || (global.EPP = {});
  var keywords = /^(?:add|ask|be|check|define|do|else|end|if|let|otherwise|repeat|run|say|set|tell|then|while|wait|create|play|stop|put|move|lift|lower|clear|link|show|hide|write|read|append|save|library)$/i;
  var operators = /^(?:as|to|and|of|is|not|greater|less|than|equal|plus|minus|times|divided|by|percent|with|the|a|drawing|sprite|up|down|left|right)$/i;
  function escape(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function highlight(source) {
    var re = /note\s*\[[^\]\n]*\]|"(?:\\.|[^"\\\n])*"|'[^'\n]*'|\b\d+(?:\.\d+)?\b|[A-Za-z_][\w-]*|[^A-Za-z_'"\d]+|[\s\S]/gi;
    var out = '', match;
    while ((match = re.exec(String(source)))) {
      var token = match[0], cls = '';
      if (/^note\s*\[/i.test(token)) cls = 'syn-note';
      else if (token[0] === '"' && token.length > 1) cls = 'syn-string';
      else if (token[0] === "'" && token.length > 1) cls = 'syn-variable';
      else if (/^\d/.test(token)) cls = 'syn-number';
      else if (keywords.test(token)) cls = 'syn-keyword';
      else if (operators.test(token)) cls = 'syn-operator';
      var safe = escape(token);
      out += cls ? '<span class="' + cls + '">' + safe + '</span>' : safe;
    }
    return out + (String(source).endsWith('\n') ? ' ' : '');
  }
  function update(editor, layer) {
    if (!editor || !layer) return;
    layer.innerHTML = highlight(editor.value);
    layer.scrollTop = editor.scrollTop;
    layer.scrollLeft = editor.scrollLeft;
  }
  // Measure each logical line using the textarea's exact font and content
  // width. Cache unchanged lines, so typing in a long file does not measure
  // thousands of identical rows again on every keystroke.
  var lineHeightCaches = new WeakMap();
  var gutterStates = new WeakMap();
  function renderLineNumbers(editor, gutter, wrapped) {
    if (!editor || !gutter) return;
    var lines = String(editor.value).split('\n');
    var heights = null;
    var doc = editor.ownerDocument;
    var layer = doc.getElementById('editorHighlight');
    if (wrapped && editor.clientWidth) {
      var style = global.getComputedStyle(editor);
      var contentWidth = editor.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (contentWidth > 0) {
        var signature = [contentWidth, style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle,
          style.lineHeight, style.letterSpacing, style.wordSpacing, style.tabSize].join('|');
        var cached = lineHeightCaches.get(editor);
        if (!cached || cached.signature !== signature || cached.heights.size > Math.max(4096, lines.length * 3)) {
          cached = { signature: signature, heights: new Map() };
          lineHeightCaches.set(editor, cached);
        }
        var missing = [];
        var seen = new Set();
        lines.forEach(function (line) {
          if (!cached.heights.has(line) && !seen.has(line)) { missing.push(line); seen.add(line); }
        });
        if (missing.length) {
          var measure = doc.createElement('div');
          measure.setAttribute('aria-hidden', 'true');
          Object.assign(measure.style, {
            position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', pointerEvents: 'none',
            width: contentWidth + 'px', fontFamily: style.fontFamily, fontSize: style.fontSize,
            fontWeight: style.fontWeight, fontStyle: style.fontStyle, lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing, wordSpacing: style.wordSpacing, tabSize: style.tabSize,
            whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'normal'
          });
          var fragment = doc.createDocumentFragment();
          missing.forEach(function (line) {
            var row = doc.createElement('div');
            row.textContent = line || '\u200b';
            fragment.appendChild(row);
          });
          measure.appendChild(fragment);
          doc.body.appendChild(measure);
          Array.prototype.forEach.call(measure.children, function (row, index) {
            cached.heights.set(missing[index], row.getBoundingClientRect().height);
          });
          measure.remove();
        }
        heights = lines.map(function (line) { return cached.heights.get(line); });
      }
    }
    if (layer) layer.style.width = wrapped && editor.clientWidth ? editor.clientWidth + 'px' : '';
    // Keep existing number elements when the logical line count is unchanged,
    // and touch the DOM only for rows whose measured height actually changed.
    var prior = gutterStates.get(gutter);
    if (gutter.children.length !== lines.length) {
      gutter.innerHTML = lines.map(function (_, index) { return '<div>' + (index + 1) + '</div>'; }).join('');
      prior = null;
    }
    var rows = gutter.children;
    var applied = [];
    for (var i = 0; i < lines.length; i++) {
      var height = heights && heights[i] ? heights[i] + 'px' : '';
      if (!prior || prior[i] !== height) rows[i].style.height = height;
      applied.push(height);
    }
    gutterStates.set(gutter, applied);
    gutter.scrollTop = editor.scrollTop;
  }
  EPP.StudioEditor = { highlight: highlight, update: update, renderLineNumbers: renderLineNumbers };
  if (typeof module !== 'undefined' && module.exports) module.exports = EPP.StudioEditor;
})(typeof window !== 'undefined' ? window : globalThis);
