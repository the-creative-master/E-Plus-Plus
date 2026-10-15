/*
 * E++ Lexer (tokenizer).
 *
 * Turns raw E++ source text into a token stream. E++ is deliberately
 * English-like:
 *   - double-quoted  "text"   -> STRING token (literal text)
 *   - single-quoted  'name'   -> VARIABLE token (a variable reference)
 *   - bare numbers   42, 3.5  -> NUMBER token
 *   - bare words     say, if  -> WORD token (keywords / operators / names)
 *   - a period '.' or a newline ends a statement (PERIOD / NEWLINE tokens)
 *
 * Every token keeps its exact source slice (`raw`) plus its offset, line
 * and column so the parser, error reporter and syntax highlighter can all
 * point back at the original text.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});
  var LexError = EPP.LexError;

  var TokenType = {
    STRING: 'STRING',
    VARIABLE: 'VARIABLE',
    NUMBER: 'NUMBER',
    WORD: 'WORD',
    PERIOD: 'PERIOD',
    NEWLINE: 'NEWLINE',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    COMMA: 'COMMA',
    COLON: 'COLON',
    SEMICOLON: 'SEMICOLON',
    COMMENT: 'COMMENT',
    EOF: 'EOF'
  };

  function Lexer(source) {
    this.source = source === undefined || source === null ? '' : String(source);
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  Lexer.prototype.tokenize = function () {
    var src = this.source;
    while (this.index < src.length) {
      var ch = src[this.index];

      // Newlines are significant: they terminate statements.
      if (ch === '\n') { this.push(TokenType.NEWLINE, '\n', '\n'); this.advance('\n'); continue; }
      if (ch === '\r') { this.advance(ch); continue; }
      if (ch === ' ' || ch === '\t') { this.advance(ch); continue; }

      // Comments: # ... and // ... run to the end of the line.
      if (ch === '#' || (ch === '/' && src[this.index + 1] === '/')) {
        var commentStart = this.index;
        while (this.index < src.length && src[this.index] !== '\n') this.advance(src[this.index]);
        this.tokens.push(this.make(TokenType.COMMENT, src.slice(commentStart, this.index), src.slice(commentStart, this.index)));
        continue;
      }

      // Python dash mode: in `python code "-..."` everything after the
      // dash up to the closing quote is raw Python (it may span lines and
      // contain characters E++ itself would reject), so it is read as one
      // raw string token with no E++ processing at all.
      if (ch === '"' && src[this.index + 1] === '-' && this.isPythonCodeStringStart()) {
        this.readPythonBlockString(); continue;
      }

      if (ch === '"') { this.readString(); continue; }
      if (ch === "'") { this.readVariable(); continue; }

      // Numbers (a '.' only belongs to the number when a digit follows it,
      // otherwise it is a statement-ending period).
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[this.index + 1] || ''))) {
        this.readNumber(); continue;
      }

      // A `note:` at the start of a statement is a free-text comment: the
      // rest of the line is ignored, even if it contains symbols like +.
      if (/[A-Za-z_]/.test(ch) && this.atStatementStart() && /^note\b/i.test(src.slice(this.index, this.index + 5))) {
        var noteStart = this.index;
        var noteLine = this.line, noteColumn = this.column;
        while (this.index < src.length && src[this.index] !== '\n') this.advance(src[this.index]);
        var noteRaw = src.slice(noteStart, this.index);
        this.tokens.push({
          type: TokenType.COMMENT, value: noteRaw, raw: noteRaw,
          line: noteLine, column: noteColumn, start: noteStart, end: this.index
        });
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) { this.readWord(); continue; }

      if (ch === '.') { this.push(TokenType.PERIOD, '.', '.'); this.advance(ch); continue; }
      if (ch === '(') { this.push(TokenType.LPAREN, '(', '('); this.advance(ch); continue; }
      if (ch === ')') { this.push(TokenType.RPAREN, ')', ')'); this.advance(ch); continue; }
      if (ch === ',') { this.push(TokenType.COMMA, ',', ','); this.advance(ch); continue; }
      if (ch === ':') { this.push(TokenType.COLON, ':', ':'); this.advance(ch); continue; }
      if (ch === ';') { this.push(TokenType.SEMICOLON, ';', ';'); this.advance(ch); continue; }

      throw new LexError(
        'Unexpected character "' + ch + '".',
        this.line, this.column,
        'E++ uses words for operators (plus, minus, times...). Remove or replace this character.'
      );
    }
    this.tokens.push({
      type: TokenType.EOF, value: '', raw: '',
      line: this.line, column: this.column, start: this.index, end: this.index
    });
    return this.tokens;
  };

  Lexer.prototype.atStatementStart = function () {
    if (!this.tokens.length) return true;
    var last = this.tokens[this.tokens.length - 1];
    return last.type === TokenType.NEWLINE || last.type === TokenType.PERIOD || last.type === TokenType.SEMICOLON;
  };

  Lexer.prototype.make = function (type, value, raw) {
    return {
      type: type, value: value, raw: raw,
      line: this.line, column: this.column,
      start: this.index, end: this.index + raw.length
    };
  };

  Lexer.prototype.push = function (type, value, raw) {
    this.tokens.push(this.make(type, value, raw));
  };

  Lexer.prototype.advance = function (text) {
    for (var i = 0; i < text.length; i++) {
      if (text[i] === '\n') { this.line += 1; this.column = 1; }
      else { this.column += 1; }
      this.index += 1;
    }
  };

  Lexer.prototype.readString = function () {
    var src = this.source;
    var startLine = this.line, startColumn = this.column, startIndex = this.index;
    var value = '';
    this.advance('"');
    var closed = false;
    while (this.index < src.length) {
      var ch = src[this.index];
      if (ch === '"') { closed = true; this.advance(ch); break; }
      if (ch === '\n') break;
      if (ch === '\\' && this.index + 1 < src.length) {
        var next = src[this.index + 1];
        if (next === 'n') value += '\n';
        else if (next === 't') value += '\t';
        else if (next === '"') value += '"';
        else if (next === '\\') value += '\\';
        else value += next;
        this.advance(ch); this.advance(next);
        continue;
      }
      value += ch;
      this.advance(ch);
    }
    if (!closed) {
      throw new LexError('This string never ends. A closing " is missing.', startLine, startColumn,
        'Close the string, for example: say "Hello".');
    }
    this.tokens.push({
      type: TokenType.STRING, value: value, raw: src.slice(startIndex, this.index),
      line: startLine, column: startColumn, start: startIndex, end: this.index
    });
  };

  /**
   * True when the quote at the current position opens the code string of a
   * `python code "..."` statement (the words `python code` immediately
   * precede it, at a place where a statement can start).
   */
  Lexer.prototype.isPythonCodeStringStart = function () {
    var n = this.tokens.length;
    if (n < 2) return false;
    var code = this.tokens[n - 1];
    var python = this.tokens[n - 2];
    if (code.type !== TokenType.WORD || code.value.toLowerCase() !== 'code') return false;
    if (python.type !== TokenType.WORD || python.value.toLowerCase() !== 'python') return false;
    if (n < 3) return true;
    var before = this.tokens[n - 3];
    if (before.type === TokenType.NEWLINE || before.type === TokenType.PERIOD || before.type === TokenType.SEMICOLON) return true;
    if (before.type === TokenType.WORD) {
      var w = before.value.toLowerCase();
      return w === 'then' || w === 'otherwise' || w === 'do' || w === 'times' || w === 'and';
    }
    return false;
  };

  /**
   * Reads `"-<raw python>"`: the dash is consumed, then every character
   * (including newlines) is preserved exactly until the closing quote.
   * The token value is the raw Python code without the leading dash.
   */
  Lexer.prototype.readPythonBlockString = function () {
    var src = this.source;
    var startLine = this.line, startColumn = this.column, startIndex = this.index;
    this.advance('"');
    this.advance('-');
    var value = '';
    var closed = false;
    while (this.index < src.length) {
      var ch = src[this.index];
      if (ch === '"') { closed = true; this.advance(ch); break; }
      value += ch;
      this.advance(ch);
    }
    if (!closed) {
      throw new LexError('The Python code block never ends. Its closing " is missing.',
        startLine, startColumn,
        'Close the Python code with a double quote, for example: python code "-print(1)" or a block ending with a " on its own line.');
    }
    this.tokens.push({
      type: TokenType.STRING, value: value, raw: src.slice(startIndex, this.index),
      line: startLine, column: startColumn, start: startIndex, end: this.index,
      pythonBlock: true
    });
  };

  Lexer.prototype.readVariable = function () {
    var src = this.source;
    var startLine = this.line, startColumn = this.column, startIndex = this.index;
    var value = '';
    this.advance("'");
    var closed = false;
    while (this.index < src.length) {
      var ch = src[this.index];
      if (ch === "'") { closed = true; this.advance(ch); break; }
      if (ch === '\n') break;
      value += ch;
      this.advance(ch);
    }
    if (!closed) {
      throw new LexError("This variable reference never ends. A closing ' is missing.", startLine, startColumn,
        "Close it, for example: say 'name'.");
    }
    if (!value.trim()) {
      throw new LexError('Empty variable reference \'\'.', startLine, startColumn,
        'Put a variable name between the single quotes.');
    }
    this.tokens.push({
      type: TokenType.VARIABLE, value: value.trim(), raw: src.slice(startIndex, this.index),
      line: startLine, column: startColumn, start: startIndex, end: this.index
    });
  };

  Lexer.prototype.readNumber = function () {
    var match = /^[0-9]*\.?[0-9]+/.exec(this.source.slice(this.index));
    var raw = match[0];
    this.push(TokenType.NUMBER, raw, raw);
    this.advance(raw);
  };

  Lexer.prototype.readWord = function () {
    var match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(this.source.slice(this.index));
    var raw = match[0];
    this.push(TokenType.WORD, raw, raw);
    this.advance(raw);
  };

  Lexer.tokenize = function (source) { return new Lexer(source).tokenize(); };
  Lexer.TokenType = TokenType;

  EPP.Lexer = Lexer;
  EPP.TokenType = TokenType;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Lexer: Lexer, TokenType: TokenType };
  }
})(typeof window !== 'undefined' ? window : globalThis);
