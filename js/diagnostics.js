/* Project No Wrongs: non-executing structural checks for Studio and E++.zip.
 * The evaluator still checks values and libraries when it runs them; these
 * checks catch malformed code even in an if branch which never executes.
 */
(function (global) {
  'use strict';
  var EPP = global.EPP || (global.EPP = {});
  function problem(code, name, reason, help, filename, line, col, sourceLine) {
    return { code: code, name: name, reason: reason, help: help,
      filename: filename || '<program>', line: line, col: col, sourceLine: sourceLine };
  }
  function validate(source, filename) {
    var lines = String(source || '').split('\n');
    var stack = [], inPython = false, previousInlineIf = false;
    var starters = /^(?:say|tell|let|set|define|ask|add|note|run|python|if|otherwise|else|end|repeat|while|check|wait|sleep|cancel|clear|read|write|append|create|put|show|hide|pause|resume|stop|play|link|lift|lower)\b/i;
    function fail(code, name, reason, help, n, col) {
      throw problem(code, name, reason, help, filename, n + 1, col || 1, lines[n]);
    }
    function checkValue(value, n, column) {
      // Mask literals and recognised English operator/library phrases. What
      // remains must not contain identifiers: text needs double quotes and a
      // variable needs single quotes, including in branches that never run.
      var masked = '', quote = null;
      for (var i = 0; i < value.length; i++) {
        var ch = value[i];
        if (quote) {
          masked += ' ';
          if (quote === '"' && ch === '\\' && i + 1 < value.length) { masked += ' '; i++; }
          else if (ch === quote) quote = null;
        } else if (ch === "'" && /[A-Za-z]/.test(value[i - 1] || '') && /[A-Za-z]/.test(value[i + 1] || '')) {
          masked += ch; // the apostrophe in "it's" is not a variable delimiter
        } else if (ch === '"' || ch === "'") {
          quote = ch; masked += ' ';
        } else masked += ch;
      }
      var phrases = [
        /\b(?:(?:and\s+)?concat\s+(?:it\s+)?with|with\s+(?:the\s+)?sep[ae]ration\s+(?:method\s+)?of)\b/gi,
        /\b(?:the\s+)?(?:length|uppercase|lowercase|reverse|trim|square\s+root|absolute\s+value|minimum|maximum|first\s+letter|last\s+letter|value)\s+of\b/gi,
        /\bthe\s+trimmed\b/gi,
        /\b(?:the\s+)?current\s+(?:time|date|year|timestamp)\b/gi,
        /\bthe\s+(?:system\s+platform|platform|operating\s+system|os|key\s+pressed)\b/gi,
        /\b(?:it['’]?s\s+)?(?:a\s+|the\s+)?(?:random\s+)?number\s+between\b/gi,
        /\broll\s+(?:a\s+)?dice(?:\s+with)?\b|\bsides\b|\bflip\s+(?:a\s+)?coin\b/gi,
        /\bhow\s+much\b|\bpercent\s+(?:is\s+)?of\b/gi
      ];
      phrases.forEach(function (pattern) { masked = masked.replace(pattern, function (s) { return ' '.repeat(s.length); }); });
      var words = /[A-Za-z_][\w-]*/g, match;
      while ((match = words.exec(masked))) {
        if (/^(?:plus|minus|times|multiplied|divided|by|mod|modulo|and|pi|e|true|false)$/i.test(match[0])) continue;
        fail('E402', 'Unquoted Text', "Unquoted text '" + match[0] + "' is not a value.",
          'Put text in double quotes, or use single quotes for a variable.', n, column + match.index);
      }
    }
    function checkStatement(statement, n, offset) {
      var trimmed = statement.trim();
      if (!trimmed) return;
      var column = offset + statement.indexOf(trimmed) + 1;
      if (!starters.test(trimmed) && !/^'[^']+'\s+move\b/i.test(trimmed)) {
        fail('E101', 'Unknown Statement', 'E++ does not recognize this statement.',
          'Start with a command such as say, let, or if.', n, column);
      }
      var say = trimmed.match(/^(?:say|tell)(?:\s+(.*))?$/i);
      if (say) {
        var value = (say[1] || '').trim();
        value = value.replace(/^(?:red|green|blue|yellow|cyan|magenta)\s+/i, '');
        if (!value) fail('E105', 'Missing Value', "'say' needs a value to print.", 'For example: say "Hello"', n, column);
        var found = lines[n].indexOf(value, column - 1);
        checkValue(value, n, found < 0 ? column : found + 1);
      }
      var variableCommand = /^(?:let|define)\b/i.test(trimmed) || (/^set\b/i.test(trimmed) && !/^set\s+the\b/i.test(trimmed));
      if (variableCommand) {
        var nameMatch = trimmed.match(/^(?:let|set|define)\s+'([^']+)'(?:\s+(?:be|to|as)\b)?/i);
        if (!nameMatch) fail('E202', 'Invalid Variable Name', 'Variable names must be in single quotes.',
          "For example: let 'name' be \"Ada\"", n, column);
        var assignment = trimmed.match(/^(?:let|set|define)\s+'([^']+)'\s+(?:be|to|as)\s+(.+)$/i);
        if (!assignment) {
          var missing = /\b(?:be|to|as)\s*$/i.test(trimmed);
          fail(missing ? 'E105' : 'E101', missing ? 'Missing Value' : 'Invalid Assignment',
            missing ? 'The variable needs a value.' : "Expected 'be', 'as', or 'to' after the variable.",
            "For example: let 'name' be \"Ada\"", n, column);
        }
        if (!/^drawing\s+sprite$/i.test(assignment[2].trim())) {
          var pos = lines[n].lastIndexOf(assignment[2]);
          checkValue(assignment[2], n, pos + 1);
        }
      }
      var ask = trimmed.match(/^ask\s+(.+?)\s+and\s+save\s+(?:the\s+|it\s+)?(?:output|answer|result)?\s*as\s+'([^']+)'$/i);
      if (/^ask\b/i.test(trimmed)) {
        if (!ask) fail('E101', 'Invalid Ask', 'An ask needs a question and a variable to save the answer.',
          "For example: ask \"Name?\" and save the output as 'name'", n, column);
        var askPos = lines[n].indexOf(ask[1], column - 1);
        checkValue(ask[1], n, askPos + 1);
      }
      if (/^repeat\b/i.test(trimmed)) {
        var repeat = trimmed.match(/^repeat\s+(.+?)\s+times?\s*:?$/i);
        if (!repeat) fail('E101', 'Invalid Repeat', "A repeat needs a count and 'times'.", 'For example: repeat 3 times', n, column);
        var repeatPos = lines[n].indexOf(repeat[1], column - 1);
        checkValue(repeat[1], n, repeatPos + 1);
      }
    }
    for (var n = 0; n < lines.length; n++) {
      var raw = lines[n], text = raw.trim();
      if (!text) continue;
      if (inPython) {
        if (/^\s/.test(raw) || !starters.test(text)) continue;
        inPython = false;
      }
      if (/^note\b/i.test(text)) {
        if (!/^note\s*\[[^\]]*\]\s*$/i.test(text)) {
          fail('E101', 'Invalid Note', 'Notes need square brackets.', 'For example: note [Your note]', n, raw.indexOf(text) + 1);
        }
        continue;
      }
      // Mask quoted content while checking quote termination and comments.
      var mask = '', quote = null, start = 0, value = '';
      for (var i = 0; i < raw.length; i++) {
        var ch = raw[i];
        if (quote) {
          if (ch === '\\' && quote === '"' && i + 1 < raw.length) { value += ch + raw[++i]; mask += '  '; continue; }
          if (ch === quote) {
            if (quote === "'" && !value.trim()) fail('E202', 'Empty Variable Name', 'A variable name cannot be empty.', "Put a name between single quotes, like 'name'.", n, start + 1);
            quote = null;
          } else value += ch;
          mask += ' ';
        } else if (ch === "'" && /[A-Za-z]/.test(raw[i - 1] || '') && /[A-Za-z]/.test(raw[i + 1] || '')) {
          mask += ch; // the apostrophe in "it's"
        } else if (ch === '"' || ch === "'") {
          quote = ch; start = i; value = ''; mask += ' ';
        } else { mask += ch; }
      }
      if (quote) fail('E102', 'Unterminated Quote', 'This ' + (quote === '"' ? 'string' : 'variable name') + ' is not closed.',
        'Add the closing ' + (quote === '"' ? 'double' : 'single') + ' quote on this line.', n, start + 1);
      var commentAt = mask.indexOf('//');
      if (commentAt < 0) commentAt = mask.indexOf('#');
      if (commentAt >= 0) fail('E101', 'Illegal Comment', 'E++ notes do not use // or #.', 'Use: note [Your note]', n, commentAt + 1);
      if (/^(?:run\s+)?(?:the\s+)?python\s+code\s*:\s*$/i.test(text)) { inPython = true; previousInlineIf = false; continue; }
      checkStatement(raw, n, 0);
      var end = text.match(/^end\s+(if|repeat|while|the\s+game)\s*$/i);
      if (/^end\b/i.test(text)) {
        var name = end && end[1].toLowerCase().replace(/\s+/g, ' ');
        if (!name || !stack.length || stack[stack.length - 1].kind !== name) {
          fail('E106', 'Unexpected Block End', 'This block ending has no matching opening statement.',
            'Use end if, end repeat, end while, or end the game to close its matching block.', n, raw.indexOf(text) + 1);
        }
        stack.pop(); previousInlineIf = false; continue;
      }
      if (/^(?:otherwise|else)\b/i.test(text)) {
        if (!(stack.length && stack[stack.length - 1].kind === 'if') && !previousInlineIf) {
          fail('E104', 'Standalone Otherwise', "'otherwise' needs a preceding if.", 'Put otherwise immediately after an if statement.', n, raw.indexOf(text) + 1);
        }
        var otherAction = text.replace(/^(?:otherwise|else)\s*:?[\s]*/i, '');
        if (otherAction) checkStatement(otherAction, n, raw.indexOf(otherAction));
        previousInlineIf = false; continue;
      }
      if (/^if\b/i.test(text)) {
        var ifMatch = text.match(/^if\s+.+?\s+then\s*:?[\s]*(.*)$/i);
        if (!ifMatch) fail('E101', 'Invalid If', "An if needs a condition and 'then'.", 'For example: if 1 is 1 then say "Yes"', n, raw.indexOf(text) + 1);
        var maskedOtherwise = /\botherwise\b/i.exec(mask);
        if (maskedOtherwise) fail('E103', 'Invalid Otherwise Placement', "'otherwise' belongs on the next line.", 'Move otherwise to the next line after the if.', n, maskedOtherwise.index + 1);
        if (ifMatch[1]) { checkStatement(ifMatch[1], n, raw.indexOf(ifMatch[1])); previousInlineIf = true; }
        else { stack.push({ kind: 'if', line: n }); previousInlineIf = false; }
        continue;
      }
      previousInlineIf = false;
      if (/^repeat\b/i.test(text)) stack.push({ kind: 'repeat', line: n });
      else if (/^while\b/i.test(text)) stack.push({ kind: 'while', line: n });
      else if (/^play\s+the\s+game\s*:?\s*$/i.test(text)) stack.push({ kind: 'the game', line: n });
    }
    if (stack.length) {
      var open = stack[stack.length - 1];
      fail('E106', 'Unclosed Block', 'This ' + open.kind + ' block has no matching ending.',
        'Close it with: end ' + open.kind, open.line, (lines[open.line].search(/\S/) + 1));
    }
    return true;
  }
  EPP.Diagnostics = { validate: validate };
  if (typeof module !== 'undefined' && module.exports) module.exports = EPP.Diagnostics;
})(typeof window !== 'undefined' ? window : globalThis);
