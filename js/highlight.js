/*
 * E++ syntax highlighter.
 * Reuses the real lexer, so the colours in the editor always match how the
 * interpreter actually reads the code. Returns HTML for the token stream,
 * preserving every character (including whitespace and comments).
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var KEYWORDS = {
    define: 1, say: 1, display: 1, show: 1, ask: 1, save: 1,
    answer: 1, wait: 1, library: 1, add: 1, load: 1, 'import': 1,
    'if': 1, then: 1, otherwise: 1, end: 1, repeat: 1, times: 1,
    'while': 1, 'do': 1, stop: 1, set: 1, change: 1, to: 1, note: 1,
    increase: 1, decrease: 1, python: 1, code: 1,
    loopback: 1, drawing: 1, sprite: 1, move: 1
  };
  var OPERATORS = {
    plus: 1, minus: 1, times: 1, divided: 1, by: 1, power: 1, percent: 1,
    square: 1, root: 1, of: 1, as: 1, is: 1, equal: 1, greater: 1, less: 1,
    lesser: 1, than: 1, and: 1, not: 1, different: 1, from: 1, between: 1, or: 1,
    fraction: 1, decimal: 1, uppercase: 1, lowercase: 1, length: 1, random: 1, number: 1, a: 1
  };

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tokenClass(token) {
    switch (token.type) {
      case 'STRING': return 'tok-string';
      case 'VARIABLE': return 'tok-variable';
      case 'NUMBER': return 'tok-number';
      case 'COMMENT': return 'tok-comment';
      case 'PERIOD': case 'SEMICOLON': return 'tok-punctuation';
      case 'WORD': {
        var w = token.value.toLowerCase();
        if (KEYWORDS[w]) return 'tok-keyword';
        if (OPERATORS[w]) return 'tok-operator';
        return 'tok-word';
      }
      default: return null;
    }
  }

  function highlight(source) {
    source = source === undefined || source === null ? '' : String(source);
    // Raw dash-mode Python blocks never reach the lexer (the parser
    // extracts them first), so highlight around them: E++ segments are
    // tokenized normally, each Python block is one string span.
    if (typeof EPP.extractPythonBlocks === 'function') {
      var extraction = EPP.extractPythonBlocks(source);
      if (extraction.blocks.length) {
        var composed = '';
        var cursor = 0;
        extraction.blocks.forEach(function (block) {
          composed += highlightSegment(source.slice(cursor, block.start));
          composed += '<span class="tok-string">' + escapeHtml(source.slice(block.start, block.end)) + '</span>';
          cursor = block.end;
        });
        composed += highlightSegment(source.slice(cursor));
        if (source.endsWith('\n')) composed += ' ';
        return composed;
      }
    }
    return highlightSegment(source);
  }

  function highlightSegment(source) {
    var tokens;
    try {
      tokens = EPP.Lexer.tokenize(source);
    } catch (e) {
      // Even broken code should render in the editor.
      return escapeHtml(source);
    }
    var html = '';
    var cursor = 0;
    tokens.forEach(function (token) {
      if (token.type === 'EOF') return;
      if (token.start > cursor) html += escapeHtml(source.slice(cursor, token.start));
      var cls = tokenClass(token);
      var raw = source.slice(token.start, token.end);
      html += cls ? '<span class="' + cls + '">' + escapeHtml(raw) + '</span>' : escapeHtml(raw);
      cursor = token.end;
    });
    if (cursor < source.length) html += escapeHtml(source.slice(cursor));
    // A trailing newline would collapse in the <pre>; keep line height stable.
    if (source.endsWith('\n')) html += ' ';
    return html;
  }

  EPP.highlight = highlight;
  EPP.escapeHtml = escapeHtml;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { highlight: highlight, escapeHtml: escapeHtml };
  }
})(typeof window !== 'undefined' ? window : globalThis);
