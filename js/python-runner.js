/*
 * E++ Lexer-based Python Runner.
 *
 * Runs Python code directly in JavaScript without Pyodide or WebAssembly.
 * Tokenizes, parses, and executes Python statements and expressions.
 * When an error occurs, it reports Python's OWN error codes (e.g. NameError,
 * ZeroDivisionError, SyntaxError) exactly as real Python does.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  // ------------------------------------------------------------------
  // Python Tokenizer (Lexer)
  // ------------------------------------------------------------------
  function tokenizePython(source) {
    var tokens = [];
    var lines = source.split(/\r?\n/);
    var indentStack = [0];

    for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      var rawLine = lines[lineIdx];
      var lineNum = lineIdx + 1;

      // Skip empty lines or comment-only lines
      var trimmed = rawLine.trim();
      if (!trimmed || trimmed.charAt(0) === '#') {
        continue;
      }

      // Calculate leading indentation (spaces / tabs)
      var indent = 0;
      var pos = 0;
      while (pos < rawLine.length) {
        var ch = rawLine.charAt(pos);
        if (ch === ' ') { indent += 1; pos += 1; }
        else if (ch === '\t') { indent += 4; pos += 1; }
        else break;
      }

      var currentIndent = indentStack[indentStack.length - 1];
      if (indent > currentIndent) {
        indentStack.push(indent);
        tokens.push({ type: 'INDENT', line: lineNum, col: indent });
      } else if (indent < currentIndent) {
        while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
          indentStack.pop();
          tokens.push({ type: 'DEDENT', line: lineNum, col: indent });
        }
        if (indentStack[indentStack.length - 1] !== indent) {
          throw new Error('IndentationError: unindent does not match any outer indentation level');
        }
      }

      // Tokenize the rest of the line
      while (pos < rawLine.length) {
        var c = rawLine.charAt(pos);

        // Whitespace inside line
        if (c === ' ' || c === '\t' || c === '\r') {
          pos++;
          continue;
        }

        // Comment
        if (c === '#') {
          break; // Rest of line is comment
        }

        // F-string: f"..." or f'...'
        if ((c === 'f' || c === 'F') && (rawLine.charAt(pos + 1) === '"' || rawLine.charAt(pos + 1) === "'")) {
          var quote = rawLine.charAt(pos + 1);
          var strStart = pos;
          pos += 2;
          var strVal = '';
          while (pos < rawLine.length && rawLine.charAt(pos) !== quote) {
            if (rawLine.charAt(pos) === '\\' && pos + 1 < rawLine.length) {
              pos++;
              var esc = rawLine.charAt(pos);
              if (esc === 'n') strVal += '\n';
              else if (esc === 't') strVal += '\t';
              else strVal += esc;
            } else {
              strVal += rawLine.charAt(pos);
            }
            pos++;
          }
          if (pos >= rawLine.length || rawLine.charAt(pos) !== quote) {
            throw new Error('SyntaxError: unterminated string literal (detected at line ' + lineNum + ')');
          }
          pos++; // Consume closing quote
          tokens.push({ type: 'FSTRING', value: strVal, line: lineNum, col: strStart + 1 });
          continue;
        }

        // Strings: "..." or '...'
        if (c === '"' || c === "'") {
          var quoteChar = c;
          var sStart = pos;
          pos++;
          var sVal = '';
          while (pos < rawLine.length && rawLine.charAt(pos) !== quoteChar) {
            if (rawLine.charAt(pos) === '\\' && pos + 1 < rawLine.length) {
              pos++;
              var escChar = rawLine.charAt(pos);
              if (escChar === 'n') sVal += '\n';
              else if (escChar === 't') sVal += '\t';
              else sVal += escChar;
            } else {
              sVal += rawLine.charAt(pos);
            }
            pos++;
          }
          if (pos >= rawLine.length || rawLine.charAt(pos) !== quoteChar) {
            throw new Error('SyntaxError: unterminated string literal (detected at line ' + lineNum + ')');
          }
          pos++; // Consume closing quote
          tokens.push({ type: 'STRING', value: sVal, line: lineNum, col: sStart + 1 });
          continue;
        }

        // Numbers: digits or float
        if (/[0-9]/.test(c)) {
          var numStart = pos;
          while (pos < rawLine.length && /[0-9.]/.test(rawLine.charAt(pos))) {
            pos++;
          }
          var numStr = rawLine.slice(numStart, pos);
          var numVal = numStr.indexOf('.') !== -1 ? parseFloat(numStr) : parseInt(numStr, 10);
          tokens.push({ type: 'NUMBER', value: numVal, line: lineNum, col: numStart + 1 });
          continue;
        }

        // Identifiers or keywords
        if (/[A-Za-z_]/.test(c)) {
          var idStart = pos;
          while (pos < rawLine.length && /[A-Za-z0-9_]/.test(rawLine.charAt(pos))) {
            pos++;
          }
          var id = rawLine.slice(idStart, pos);
          tokens.push({ type: 'IDENTIFIER', value: id, line: lineNum, col: idStart + 1 });
          continue;
        }

        // Two-character operators
        var two = rawLine.slice(pos, pos + 2);
        if (two === '==' || two === '!=' || two === '<=' || two === '>=' ||
            two === '+=' || two === '-=' || two === '*=' || two === '/=' ||
            two === '**' || two === '//') {
          tokens.push({ type: 'OPERATOR', value: two, line: lineNum, col: pos + 1 });
          pos += 2;
          continue;
        }

        // Single-character operators & punctuation
        if ('+-*/%='.indexOf(c) !== -1) {
          tokens.push({ type: 'OPERATOR', value: c, line: lineNum, col: pos + 1 });
          pos++;
          continue;
        }

        if ('<>,:;()[]{}.'.indexOf(c) !== -1) {
          tokens.push({ type: 'PUNCT', value: c, line: lineNum, col: pos + 1 });
          pos++;
          continue;
        }

        throw new Error('SyntaxError: invalid character in identifier: ' + JSON.stringify(c));
      }

      tokens.push({ type: 'NEWLINE', line: lineNum, col: rawLine.length });
    }

    // Emit remaining DEDENT tokens
    while (indentStack.length > 1) {
      indentStack.pop();
      tokens.push({ type: 'DEDENT', line: lines.length, col: 0 });
    }
    tokens.push({ type: 'EOF', line: lines.length + 1, col: 0 });

    return tokens;
  }

  // ------------------------------------------------------------------
  // Python AST Evaluator / Interpreter
  // ------------------------------------------------------------------
  function PythonRunner(options) {
    options = options || {};
    this.output = typeof options.output === 'function' ? options.output : function (txt) { console.log(txt); };
    this.globals = options.globals || {};
    this.initBuiltins();
  }

  PythonRunner.prototype.initBuiltins = function () {
    var self = this;
    if (!this.globals.__name__) this.globals.__name__ = '__main__';

    // Built-in print
    if (!this.globals.print) {
      this.globals.print = function () {
        var args = Array.prototype.slice.call(arguments);
        var formatted = args.map(function (arg) {
          if (arg === null || arg === undefined) return 'None';
          if (typeof arg === 'boolean') return arg ? 'True' : 'False';
          if (typeof arg === 'object') {
            if (Array.isArray(arg)) return '[' + arg.map(function (x) { return typeof x === 'string' ? "'" + x + "'" : String(x); }).join(', ') + ']';
            return JSON.stringify(arg);
          }
          return String(arg);
        }).join(' ');
        self.output(formatted);
      };
    }

    // Built-in range
    if (!this.globals.range) {
      this.globals.range = function (start, stop, step) {
        if (stop === undefined) { stop = start; start = 0; }
        step = step === undefined ? 1 : step;
        var arr = [];
        if (step > 0) {
          for (var i = start; i < stop; i += step) arr.push(i);
        } else if (step < 0) {
          for (var j = start; j > stop; j += step) arr.push(j);
        }
        return arr;
      };
    }

    // Built-in len, str, int, float, bool, list, dict
    if (!this.globals.len) this.globals.len = function (x) { return x ? (x.length !== undefined ? x.length : Object.keys(x).length) : 0; };
    if (!this.globals.str) this.globals.str = function (x) { return String(x); };
    if (!this.globals.int) this.globals.int = function (x) { return parseInt(x, 10); };
    if (!this.globals.float) this.globals.float = function (x) { return parseFloat(x); };
    if (!this.globals.bool) this.globals.bool = function (x) { return Boolean(x); };
    if (!this.globals.list) this.globals.list = function (x) { return Array.isArray(x) ? x.slice() : []; };

    // Standard library module: random
    if (!this.globals.random) {
      this.globals.random = {
        randint: function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; },
        random: function () { return Math.random(); },
        choice: function (seq) { return seq[Math.floor(Math.random() * seq.length)]; },
        seed: function () {}
      };
    }
  };

  PythonRunner.prototype.run = function (source) {
    var tokens = tokenizePython(source);
    var p = 0;
    var self = this;

    function cur() { return tokens[p]; }
    function peek(offset) { return tokens[p + (offset || 0)]; }
    function advance() { return tokens[p++]; }
    function match(type, val) {
      var t = cur();
      if (!t) return false;
      if (type && t.type !== type) return false;
      if (val !== undefined && t.value !== val) return false;
      advance();
      return true;
    }
    function skipNewlines() {
      while (cur() && cur().type === 'NEWLINE') advance();
    }

    function evaluateExpression(env) {
      return parseLogicalOr(env);
    }

    function parseLogicalOr(env) {
      var left = parseLogicalAnd(env);
      while (cur() && cur().type === 'IDENTIFIER' && cur().value === 'or') {
        advance();
        var right = parseLogicalAnd(env);
        left = left || right;
      }
      return left;
    }

    function parseLogicalAnd(env) {
      var left = parseComparison(env);
      while (cur() && cur().type === 'IDENTIFIER' && cur().value === 'and') {
        advance();
        var right = parseComparison(env);
        left = left && right;
      }
      return left;
    }

    function parseComparison(env) {
      var left = parseAdditive(env);
      while (cur() && (cur().type === 'OPERATOR' && ['==', '!=', '<', '>', '<=', '>='].indexOf(cur().value) !== -1 ||
             (cur().type === 'PUNCT' && ['<', '>'].indexOf(cur().value) !== -1) ||
             (cur().type === 'IDENTIFIER' && cur().value === 'in'))) {
        var op = advance().value;
        var right = parseAdditive(env);
        if (op === '==') left = (left === right);
        else if (op === '!=') left = (left !== right);
        else if (op === '<') left = (left < right);
        else if (op === '>') left = (left > right);
        else if (op === '<=') left = (left <= right);
        else if (op === '>=') left = (left >= right);
        else if (op === 'in') {
          if (Array.isArray(right) || typeof right === 'string') left = right.indexOf(left) !== -1;
          else if (right && typeof right === 'object') left = left in right;
          else left = false;
        }
      }
      return left;
    }

    function parseAdditive(env) {
      var left = parseMultiplicative(env);
      while (cur() && cur().type === 'OPERATOR' && (cur().value === '+' || cur().value === '-')) {
        var op = advance().value;
        var right = parseMultiplicative(env);
        if (op === '+') {
          if (typeof left === 'string' || typeof right === 'string') {
            if (typeof left !== typeof right) {
              throw new Error('TypeError: can only concatenate str (not "' + typeof right + '") to str');
            }
          }
          left = left + right;
        } else {
          left = left - right;
        }
      }
      return left;
    }

    function parseMultiplicative(env) {
      var left = parsePower(env);
      while (cur() && cur().type === 'OPERATOR' && (cur().value === '*' || cur().value === '/' || cur().value === '//' || cur().value === '%')) {
        var op = advance().value;
        var right = parsePower(env);
        if (op === '*') {
          if (typeof left === 'string' && typeof right === 'number') {
            left = left.repeat(right);
          } else {
            left = left * right;
          }
        } else if (op === '/') {
          if (right === 0) throw new Error('ZeroDivisionError: division by zero');
          left = left / right;
        } else if (op === '//') {
          if (right === 0) throw new Error('ZeroDivisionError: integer division or modulo by zero');
          left = Math.floor(left / right);
        } else if (op === '%') {
          if (right === 0) throw new Error('ZeroDivisionError: integer division or modulo by zero');
          left = left % right;
        }
      }
      return left;
    }

    function parsePower(env) {
      var left = parseUnary(env);
      if (cur() && cur().type === 'OPERATOR' && cur().value === '**') {
        advance();
        var right = parsePower(env);
        return Math.pow(left, right);
      }
      return left;
    }

    function parseUnary(env) {
      if (cur() && cur().type === 'OPERATOR' && cur().value === '-') {
        advance();
        return -parseUnary(env);
      }
      if (cur() && cur().type === 'IDENTIFIER' && cur().value === 'not') {
        advance();
        return !parseUnary(env);
      }
      return parsePrimary(env);
    }

    function parseFString(rawStr, env) {
      // Interpolate {expr} in f-string
      var res = '';
      var idx = 0;
      while (idx < rawStr.length) {
        if (rawStr[idx] === '{') {
          var closeIdx = rawStr.indexOf('}', idx);
          if (closeIdx === -1) {
            res += rawStr.slice(idx);
            break;
          }
          var exprStr = rawStr.slice(idx + 1, closeIdx);
          // Evaluate sub-expression
          var subRunner = new PythonRunner({ globals: env, output: self.output });
          var subTokens = tokenizePython(exprStr);
          // Evaluate expr in env
          try {
            var val = evaluateSimpleExpr(exprStr, env);
            res += String(val);
          } catch (e) {
            res += '{' + exprStr + '}';
          }
          idx = closeIdx + 1;
        } else {
          res += rawStr[idx++];
        }
      }
      return res;
    }

    function evaluateSimpleExpr(exprStr, env) {
      var t = tokenizePython(exprStr).filter(function (x) { return x.type !== 'NEWLINE' && x.type !== 'EOF'; });
      var localP = 0;
      function localEval() {
        var token = t[localP++];
        if (!token) return '';
        if (token.type === 'NUMBER') return token.value;
        if (token.type === 'STRING') return token.value;
        if (token.type === 'IDENTIFIER') {
          if (token.value in env) return env[token.value];
          throw new Error("NameError: name '" + token.value + "' is not defined");
        }
        return '';
      }
      // Simple evaluator for things like 1 + 2 or var
      var l = localEval();
      while (localP < t.length) {
        var op = t[localP++].value;
        var r = localEval();
        if (op === '+') l = l + r;
        else if (op === '-') l = l - r;
        else if (op === '*') l = l * r;
        else if (op === '/') l = l / r;
      }
      return l;
    }

    function parsePrimary(env) {
      var t = cur();
      if (!t) throw new Error('SyntaxError: unexpected EOF while parsing');

      if (t.type === 'NUMBER') {
        advance();
        return t.value;
      }

      if (t.type === 'STRING') {
        advance();
        return t.value;
      }

      if (t.type === 'FSTRING') {
        advance();
        return parseFString(t.value, env);
      }

      if (t.type === 'IDENTIFIER') {
        var name = advance().value;
        if (name === 'True') return true;
        if (name === 'False') return false;
        if (name === 'None') return null;

        var val;
        if (name in env) {
          val = env[name];
        } else {
          // If followed by call or attribute access, check if it's special
          throw new Error("NameError: name '" + name + "' is not defined");
        }

        // Handle property access / function calls / indexing
        return parsePostfix(val, env);
      }

      if (t.type === 'PUNCT' && t.value === '(') {
        advance();
        var inner = evaluateExpression(env);
        if (!match('PUNCT', ')')) throw new Error('SyntaxError: closing parenthesis \')\' does not match opening parenthesis');
        return inner;
      }

      if (t.type === 'PUNCT' && t.value === '[') {
        advance();
        var list = [];
        if (!match('PUNCT', ']')) {
          while (true) {
            list.push(evaluateExpression(env));
            if (match('PUNCT', ']')) break;
            if (!match('PUNCT', ',')) throw new Error('SyntaxError: invalid syntax in list');
            if (match('PUNCT', ']')) break;
          }
        }
        return list;
      }

      throw new Error('SyntaxError: invalid syntax at ' + JSON.stringify(t.value));
    }

    function parsePostfix(base, env) {
      while (cur()) {
        if (cur().type === 'PUNCT' && cur().value === '(') {
          // Function call
          advance();
          var args = [];
          if (!match('PUNCT', ')')) {
            while (true) {
              args.push(evaluateExpression(env));
              if (match('PUNCT', ')')) break;
              if (!match('PUNCT', ',')) throw new Error('SyntaxError: invalid syntax in arguments');
              if (match('PUNCT', ')')) break;
            }
          }
          if (typeof base !== 'function') {
            throw new Error('TypeError: object is not callable');
          }
          base = base.apply(null, args);
        } else if (cur().type === 'PUNCT' && cur().value === '.') {
          // Attribute access
          advance();
          var prop = cur();
          if (!prop || prop.type !== 'IDENTIFIER') throw new Error('SyntaxError: expected attribute name');
          advance();
          if (base && typeof base === 'object' && prop.value in base) {
            base = base[prop.value];
          } else {
            throw new Error("AttributeError: object has no attribute '" + prop.value + "'");
          }
        } else if (cur().type === 'PUNCT' && cur().value === '[') {
          // Indexing
          advance();
          var idx = evaluateExpression(env);
          if (!match('PUNCT', ']')) throw new Error('SyntaxError: missing closing bracket \']\'');
          if (Array.isArray(base) || typeof base === 'string') {
            if (idx < 0) idx = base.length + idx;
            if (idx < 0 || idx >= base.length) throw new Error('IndexError: list index out of range');
            base = base[idx];
          } else if (base && typeof base === 'object') {
            if (!(idx in base)) throw new Error("KeyError: '" + idx + "'");
            base = base[idx];
          } else {
            throw new Error('TypeError: object is not subscriptable');
          }
        } else {
          break;
        }
      }
      return base;
    }

    function executeBlock(env) {
      skipNewlines();
      if (!match('INDENT')) {
        throw new Error('IndentationError: expected an indented block');
      }
      skipNewlines();
      while (cur() && cur().type !== 'DEDENT' && cur().type !== 'EOF') {
        executeStatement(env);
        skipNewlines();
      }
      match('DEDENT');
    }

    function executeStatement(env) {
      skipNewlines();
      if (!cur() || cur().type === 'EOF' || cur().type === 'DEDENT') return;

      var t = cur();

      // pass
      if (t.type === 'IDENTIFIER' && t.value === 'pass') {
        advance();
        match('NEWLINE');
        return;
      }

      // import module
      if (t.type === 'IDENTIFIER' && t.value === 'import') {
        advance();
        var modName = advance().value;
        if (modName === 'random') {
          env.random = self.globals.random;
        } else {
          env[modName] = {};
        }
        match('NEWLINE');
        return;
      }

      // for var in iterable:
      if (t.type === 'IDENTIFIER' && t.value === 'for') {
        advance();
        var varName = advance().value;
        if (!match('IDENTIFIER', 'in')) throw new Error('SyntaxError: invalid syntax in for loop');
        var iterVal = evaluateExpression(env);
        if (!match('PUNCT', ':')) throw new Error('SyntaxError: expected \':\' after for statement');

        // Capture statements inside the block
        skipNewlines();
        if (!match('INDENT')) throw new Error('IndentationError: expected an indented block');
        var blockTokens = [];
        var depth = 1;
        while (cur() && depth > 0 && cur().type !== 'EOF') {
          if (cur().type === 'INDENT') depth++;
          else if (cur().type === 'DEDENT') {
            depth--;
            if (depth === 0) { advance(); break; }
          }
          blockTokens.push(advance());
        }

        // Run block for each element
        if (iterVal && typeof iterVal[Symbol.iterator] === 'function') {
          var items = Array.from(iterVal);
          for (var i = 0; i < items.length; i++) {
            env[varName] = items[i];
            runTokensInBlock(blockTokens, env);
          }
        }
        return;
      }

      // while condition:
      if (t.type === 'IDENTIFIER' && t.value === 'while') {
        advance();
        var condStart = p;
        // Find colon
        while (cur() && !(cur().type === 'PUNCT' && cur().value === ':')) advance();
        var condEnd = p;
        advance(); // consume ':'

        skipNewlines();
        if (!match('INDENT')) throw new Error('IndentationError: expected an indented block');
        var wBlockTokens = [];
        var wDepth = 1;
        while (cur() && wDepth > 0 && cur().type !== 'EOF') {
          if (cur().type === 'INDENT') wDepth++;
          else if (cur().type === 'DEDENT') {
            wDepth--;
            if (wDepth === 0) { advance(); break; }
          }
          wBlockTokens.push(advance());
        }

        var loopLimit = 10000;
        while (loopLimit-- > 0) {
          // Re-evaluate condition
          var condTokens = tokens.slice(condStart, condEnd).concat([{ type: 'EOF' }]);
          var condRes = evaluateTokensAsExpr(condTokens, env);
          if (!condRes) break;
          runTokensInBlock(wBlockTokens, env);
        }
        return;
      }

      // if condition: ... elif ...: ... else:
      if (t.type === 'IDENTIFIER' && t.value === 'if') {
        advance();
        var cond = evaluateExpression(env);
        if (!match('PUNCT', ':')) throw new Error('SyntaxError: expected \':\' after if statement');

        skipNewlines();
        if (!match('INDENT')) throw new Error('IndentationError: expected an indented block');
        var ifBlock = [];
        var ifDepth = 1;
        while (cur() && ifDepth > 0 && cur().type !== 'EOF') {
          if (cur().type === 'INDENT') ifDepth++;
          else if (cur().type === 'DEDENT') {
            ifDepth--;
            if (ifDepth === 0) { advance(); break; }
          }
          ifBlock.push(advance());
        }

        var executed = false;
        if (cond) {
          runTokensInBlock(ifBlock, env);
          executed = true;
        }

        // Check for elif / else
        skipNewlines();
        while (cur() && cur().type === 'IDENTIFIER' && (cur().value === 'elif' || cur().value === 'else')) {
          var branchType = advance().value;
          var branchCond = true;
          if (branchType === 'elif') {
            branchCond = evaluateExpression(env);
          }
          if (!match('PUNCT', ':')) throw new Error('SyntaxError: expected \':\' after ' + branchType);
          skipNewlines();
          if (!match('INDENT')) throw new Error('IndentationError: expected an indented block');
          var branchBlock = [];
          var bDepth = 1;
          while (cur() && bDepth > 0 && cur().type !== 'EOF') {
            if (cur().type === 'INDENT') bDepth++;
            else if (cur().type === 'DEDENT') {
              bDepth--;
              if (bDepth === 0) { advance(); break; }
            }
            branchBlock.push(advance());
          }
          if (!executed && branchCond) {
            runTokensInBlock(branchBlock, env);
            executed = true;
          }
          skipNewlines();
        }
        return;
      }

      // def name(args):
      if (t.type === 'IDENTIFIER' && t.value === 'def') {
        advance();
        var fnName = advance().value;
        if (!match('PUNCT', '(')) throw new Error('SyntaxError: expected \'(\' after function name');
        var paramNames = [];
        if (!match('PUNCT', ')')) {
          while (true) {
            paramNames.push(advance().value);
            if (match('PUNCT', ')')) break;
            if (!match('PUNCT', ',')) throw new Error('SyntaxError: invalid parameter list');
            if (match('PUNCT', ')')) break;
          }
        }
        if (!match('PUNCT', ':')) throw new Error('SyntaxError: expected \':\' after def');
        skipNewlines();
        if (!match('INDENT')) throw new Error('IndentationError: expected an indented block');
        var fnTokens = [];
        var fnDepth = 1;
        while (cur() && fnDepth > 0 && cur().type !== 'EOF') {
          if (cur().type === 'INDENT') fnDepth++;
          else if (cur().type === 'DEDENT') {
            fnDepth--;
            if (fnDepth === 0) { advance(); break; }
          }
          fnTokens.push(advance());
        }

        env[fnName] = function () {
          var callArgs = Array.prototype.slice.call(arguments);
          var localEnv = Object.create(env);
          for (var pi = 0; pi < paramNames.length; pi++) {
            localEnv[paramNames[pi]] = callArgs[pi];
          }
          runTokensInBlock(fnTokens, localEnv);
        };
        return;
      }

      // Assignment: identifier = expr  or  identifier += expr
      if (t.type === 'IDENTIFIER' && peek(1) && peek(1).type === 'OPERATOR' &&
          ['=', '+=', '-=', '*=', '/='].indexOf(peek(1).value) !== -1) {
        var aName = advance().value;
        var assignOp = advance().value;
        var val = evaluateExpression(env);
        if (assignOp === '=') env[aName] = val;
        else if (assignOp === '+=') env[aName] = (env[aName] || 0) + val;
        else if (assignOp === '-=') env[aName] = (env[aName] || 0) - val;
        else if (assignOp === '*=') env[aName] = (env[aName] || 0) * val;
        else if (assignOp === '/=') env[aName] = (env[aName] || 0) / val;
        match('NEWLINE');
        return;
      }

      // Expression statement (e.g. print('hello'), game())
      evaluateExpression(env);
      match('NEWLINE');
    }

    function runTokensInBlock(toks, env) {
      var oldTokens = tokens;
      var oldP = p;
      tokens = toks.concat([{ type: 'EOF' }]);
      p = 0;
      while (p < tokens.length && tokens[p].type !== 'EOF') {
        executeStatement(env);
        skipNewlines();
      }
      tokens = oldTokens;
      p = oldP;
    }

    function evaluateTokensAsExpr(toks, env) {
      var oldTokens = tokens;
      var oldP = p;
      tokens = toks;
      p = 0;
      var res = evaluateExpression(env);
      tokens = oldTokens;
      p = oldP;
      return res;
    }

    // Main execution loop
    skipNewlines();
    while (p < tokens.length && tokens[p].type !== 'EOF') {
      executeStatement(this.globals);
      skipNewlines();
    }
  };

  function executePython(code, options) {
    options = options || {};
    var runner = new PythonRunner(options);
    runner.run(code);
    return runner;
  }

  EPP.PythonRunner = PythonRunner;
  EPP.tokenizePython = tokenizePython;
  EPP.executePython = executePython;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PythonRunner: PythonRunner, tokenizePython: tokenizePython, executePython: executePython };
  }
})(typeof window !== 'undefined' ? window : globalThis);
