/*
 * E++ Lexer (tokenizer) - Release 1.4b1.
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
 *
 * ERROR POLICY (1.4b1). The lexer owns the fifteen fatal codes F001-F015.
 * A fatal error means the lexer cannot produce a trustworthy token stream, so
 * nothing is handed to the parser: the program never starts. Everything the
 * lexer merely *notices* - a variable name that looks like text, a string that
 * is really an equation - is a warning (W001-W005): it is collected in
 * `lexer.warnings` and the program still runs.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});
  var Errors = EPP.Errors;

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

  // F002: the lexer refuses programs larger than this (4 MB of source).
  var MAX_SOURCE_LENGTH = 4 * 1024 * 1024;
  // F012: no E++ word is longer than this.
  var MAX_WORD_LENGTH = 256;
  // F010: a number is at most this many digits.
  var MAX_NUMBER_LENGTH = 40;

  var ESCAPES = { n: 1, t: 1, r: 1, '"': 1, '\\': 1 };

  function Lexer(source, options) {
    // F001: the lexer needs text. `null` and `undefined` are empty programs;
    // anything else that is not a string (a number, an object, a list) is a
    // caller mistake and cannot be tokenized meaningfully.
    var valid = source === undefined || source === null || typeof source === 'string';
    this.source = valid ? (source === undefined || source === null ? '' : String(source)) : '';
    this.sourceInvalid = !valid;
    this.index = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
    this.warnings = [];
    this.filename = (options && options.filename) || null;
    this.lines = this.source.split('\n');
  }

  Lexer.prototype.sourceLine = function (line) {
    return this.lines[line - 1] === undefined ? '' : this.lines[line - 1];
  };

  /** Record a W001-W005 warning and carry on lexing. */
  Lexer.prototype.warn = function (code, message, line, column, hint) {
    var record = Errors.warning(code, message, line, column, hint,
      this.filename, this.sourceLine(line)).warningRecord();
    this.warnings.push(record);
    return record;
  };

  /** Build a fatal F001-F015 error. The caller throws it. */
  Lexer.prototype.fatal = function (code, message, line, column, hint) {
    return Errors.fatal(code, message, line, column, hint, {
      filename: this.filename, sourceLine: this.sourceLine(line)
    });
  };

  Lexer.prototype.tokenize = function () {
    if (this.sourceInvalid) {
      throw this.fatal('F001', 'The lexer was given something that is not E++ program text.',
        1, 1, 'Pass the program as text (a string) to the lexer.');
    }
    if (this.source.length > MAX_SOURCE_LENGTH) {
      throw this.fatal('F002', 'This program is larger than the 4 MB the lexer will read.',
        1, 1, 'Split the program into smaller files.');
    }

    var src = this.source;
    while (this.index < src.length) {
      var ch = src[this.index];

      // F009: a NUL byte means this is not a text program.
      if (ch === '\u0000') {
        throw this.fatal('F009', 'This line contains a NUL character (code 0), which is not part of an E++ program.',
          this.line, this.column, 'Remove the invisible NUL character (it usually arrives from a binary file).');
      }

      // Newlines are significant: they terminate statements.
      if (ch === '\n') { this.push(TokenType.NEWLINE, '\n', '\n'); this.advance('\n'); continue; }
      if (ch === '\r') { this.advance(ch); continue; }
      if (ch === ' ' || ch === '\t') { this.advance(ch); continue; }

      // F011: E++ has no // or # comments. Notes are the only comment syntax,
      // so the lexer stops here rather than silently dropping the rest of
      // the line (which would hide code the author meant to run).
      if (ch === '#') {
        throw this.fatal('F011', 'E++ does not use # comments. Use note [text].',
          this.line, this.column, 'Replace it with: note [Your note]');
      }
      if (ch === '/' && src[this.index + 1] === '/') {
        throw this.fatal('F011', 'E++ does not use // comments. Use note [text].',
          this.line, this.column, 'Replace it with: note [Your note]');
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
      // Notes must use square brackets, so the two ways of getting them wrong
      // are fatal (F007, F008) rather than a silently dropped line.
      if (/[A-Za-z_]/.test(ch) && this.atStatementStart() && /^note\b/i.test(src.slice(this.index, this.index + 5))) {
        var noteStart = this.index;
        var noteLine = this.line, noteColumn = this.column;
        this.readNote(noteStart, noteLine, noteColumn);
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) { this.readWord(); continue; }

      if (ch === '.') { this.push(TokenType.PERIOD, '.', '.'); this.advance(ch); continue; }
      if (ch === '(') { this.push(TokenType.LPAREN, '(', '('); this.advance(ch); continue; }
      if (ch === ')') { this.push(TokenType.RPAREN, ')', ')'); this.advance(ch); continue; }
      if (ch === ',') { this.push(TokenType.COMMA, ',', ','); this.advance(ch); continue; }
      if (ch === ':') { this.push(TokenType.COLON, ':', ':'); this.advance(ch); continue; }
      if (ch === ';') { this.push(TokenType.SEMICOLON, ';', ';'); this.advance(ch); continue; }

      // F003: a character the lexer cannot make sense of. Passing it on as a
      // word would only move the confusion into the parser.
      throw this.fatal('F003', 'Unexpected character "' + ch + '" at column ' + this.column + '.',
        this.line, this.column,
        'E++ uses words for operators (plus, minus, times...). Remove or replace this character.');
    }

    this.tokens.push({
      type: TokenType.EOF, value: '', raw: '',
      line: this.line, column: this.column, start: this.index, end: this.index
    });
    return this.tokens;
  };

  Lexer.prototype.readNote = function (startIndex, line, column) {
    var src = this.source;
    this.advance('note');
    while (this.index < src.length && (src[this.index] === ' ' || src[this.index] === '\t')) this.advance(src[this.index]);
    if (src[this.index] !== '[') {
      throw this.fatal('F008', 'Notes must use square brackets: note [Your note]', line, column,
        'Write notes like this: note [Your note]');
    }
    this.advance('[');
    while (this.index < src.length && src[this.index] !== ']' && src[this.index] !== '\n') this.advance(src[this.index]);
    if (src[this.index] !== ']') {
      throw this.fatal('F007', 'This note never ends. Close it with ].', line, column,
        'Notes need square brackets: note [Your note]');
    }
    this.advance(']');
    var noteRaw = src.slice(startIndex, this.index);
    this.tokens.push({
      type: TokenType.COMMENT, value: noteRaw, raw: noteRaw,
      line: line, column: column, start: startIndex, end: this.index
    });
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
        // F014: only the five documented escapes exist. Anything else used to
        // be dropped silently, which hid typos inside file names and notes.
        if (!ESCAPES[next]) {
          throw this.fatal('F014', 'The escape sequence "\\' + next + '" inside a double-quoted string is not one E++ understands.',
            this.line, this.column,
            'E++ understands the escapes for a new line, a tab, a double quote and a backslash inside double quotes.');
        }
        if (next === 'n') value += '\n';
        else if (next === 't') value += '\t';
        else if (next === 'r') value += '\r';
        else value += next;
        this.advance(ch); this.advance(next);
        continue;
      }
      value += ch;
      this.advance(ch);
    }
    if (!closed) {
      // F004 must keep saying "never ends": the editor, the Studio and the
      // command line all recognise that phrase.
      throw this.fatal('F004', 'This string never ends. A closing " is missing.',
        startLine, startColumn, 'Close the string, for example: say "Hello".');
    }
    this.tokens.push({
      type: TokenType.STRING, value: value, raw: src.slice(startIndex, this.index),
      line: startLine, column: startColumn, start: startIndex, end: this.index
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
      throw this.fatal('F005', "This variable reference never ends. A closing ' is missing.",
        startLine, startColumn, "Close it, for example: say 'name'.");
    }
    if (!value.trim()) {
      throw this.fatal('F006', "Empty variable reference ''.",
        startLine, startColumn, 'Put a variable name between the single quotes.');
    }
    // W002: a name in double quotes is text, so single quotes here read as an
    // accidental quote swap. It still works as a variable, hence a warning.
    if (/\s/.test(value) && /^[A-Za-z][A-Za-z ]*$/.test(value)) {
      this.warn('W002', "The variable name '" + value.trim() + "' contains spaces; it works, but double quotes are reserved for text.",
        startLine, startColumn, 'Use double quotes for text and single quotes for variables.');
    }
    this.tokens.push({
      type: TokenType.VARIABLE, value: value.trim(), raw: src.slice(startIndex, this.index),
      line: startLine, column: startColumn, start: startIndex, end: this.index
    });
  };

  Lexer.prototype.readNumber = function () {
    var rest = this.source.slice(this.index);
    var match = /^[0-9]*\.?[0-9]+/.exec(rest);
    if (!match) {
      throw this.fatal('F010', 'This is not a number E++ can read.',
        this.line, this.column, 'Write numbers as digits, for example 42 or 3.5.');
    }
    var raw = match[0];
    // A second decimal point ("2.5.5") or an enormous run of digits cannot be
    // a number; both are fatal rather than a token the parser would misread.
    var after = rest.slice(raw.length);
    if (/^\.[0-9]/.test(after)) {
      throw this.fatal('F010', 'This number has more than one decimal point: "' + raw + '.',
        this.line, this.column, 'Write it as 2.5, not 2.5.5.');
    }
    if (raw.replace('.', '').length > MAX_NUMBER_LENGTH) {
      throw this.fatal('F010', 'This number has too many digits to be a number E++ can store.',
        this.line, this.column, 'Write numbers as digits, for example 42 or 3.5.');
    }
    this.push(TokenType.NUMBER, raw, raw);
    this.advance(raw);
  };

  Lexer.prototype.readWord = function () {
    var rest = this.source.slice(this.index);
    var match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(rest);
    if (!match) {
      throw this.fatal('F003', 'Unexpected character "' + rest.charAt(0) + '".',
        this.line, this.column,
        'E++ uses words for maths. Remove or replace this character.');
    }
    var raw = match[0];
    if (raw.length > MAX_WORD_LENGTH) {
      throw this.fatal('F012', 'This word is longer than the ' + MAX_WORD_LENGTH + ' characters a word may have.',
        this.line, this.column, 'Keep words to 256 characters or fewer.');
    }
    this.push(TokenType.WORD, raw, raw);
    this.advance(raw);
  };

  /** True when `thing` is one of the five fatal lexer codes. */
  Lexer.isFatalCode = function (code) {
    return Errors.isFatalCode(code);
  };

  /*
   * `Lexer.tokenize(source)` returns the token array, like it always has.
   * A fatal F001-F015 error is still thrown, and the warnings the lexer
   * noticed are attached to the returned array (`tokens.warnings`) so code
   * that only wants tokens needs no extra wiring.
   */
  Lexer.tokenize = function (source, options) {
    var lexer = new Lexer(source, options);
    var tokens = lexer.tokenize();
    tokens.warnings = lexer.warnings;
    return tokens;
  };

  /**
   * Tokenize and hand back both the tokens and the warnings the lexer noticed.
   * A fatal error still throws, so a caller that only wants to highlight code
   * can keep using tokenize() and its own try/catch.
   */
  Lexer.analyse = function (source, options) {
    var lexer = new Lexer(source, options);
    var tokens = lexer.tokenize();
    return { tokens: tokens, warnings: lexer.warnings };
  };

  Lexer.TokenType = TokenType;
  Lexer.MAX_SOURCE_LENGTH = MAX_SOURCE_LENGTH;

  EPP.Lexer = Lexer;
  EPP.TokenType = TokenType;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Lexer: Lexer, TokenType: TokenType };
  }
})(typeof window !== 'undefined' ? window : globalThis);
