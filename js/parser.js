/*
 * E++ Parser.
 *
 * Consumes the lexer token stream and builds an AST (see ast.js).
 *
 * Grammar (statements end with a period '.' or a newline):
 *
 *   program        := statement*
 *   statement      := define | set | say | ask | wait | library
 *                   | if | repeat | while | stop | note
 *                   | increase | decrease | python
 *   define         := "Define" <name> "as" <expression>
 *   set            := ("Set"|"Change") <name> "to" <expression>
 *   say            := ("say"|"display"|"show") <expression>
 *   ask            := "ask" <expression> "and save answer as" <name>
 *   wait           := "wait" <expression>
 *   library        := "library" <STRING> ("add"|"load"|"import")
 *   increase       := "Increase" <name> "by" <expression>
 *   decrease       := "Decrease" <name> "by" <expression>
 *   python         := "python" "code" <STRING>                        [Python]
 *                     (a STRING starting with "-" is a raw multi-line
 *                      Python block, extracted by the parser before
 *                      lexing — the lexer is generic and never sees it)
 *   if             := "if" <condition> "then" <statement>
 *                     ["otherwise" <statement>]                        (inline)
 *                   | "if" <condition> "then" NEWLINE statement*
 *                     ["otherwise" statement*] "end if"                 (block)
 *                     — branches may chain without limit:
 *                       "otherwise if" <condition> "then" ... , and a
 *                       branch action may end with the word "and" to
 *                       continue the chain on the next line:
 *                         if <c> then <action> and
 *                         otherwise if <c> then <action> and
 *                         otherwise <action>
 *   repeat         := "repeat" <expression> "times" (statement | block "end repeat")
 *   while          := "while" <condition> "do" (statement | block "end while")
 *   condition      := <expression> [ ("is" ["not"] <comparison>) <expression> ]
 *                     comparisons include "equal to", "greater than",
 *                     "less than" / "lesser than", and the number tests
 *                     "is a number" / "is not a number". Inside an
 *                     otherwise-if chain, "not a number" on its own tests
 *                     the value the first condition in the chain tested.
 *   expression     := additive [ "as" ("fraction"|"decimal") ]
 *   additive       := multiplicative (("plus"|"minus") multiplicative)*
 *   multiplicative := power (("times"|"divided by"|"percent of") power)*
 *   power          := unary [ "power of" power ]
 *   unary          := ["minus"|"square root of"] unary | primary
 *   primary        := NUMBER | STRING | VARIABLE | bare words
 *                   | "(" expression ")"
 *                   | ("uppercase of"|"lowercase of"|"length of") unary   [Text]
 *                   | "random number between" power "and" power          [Random]
 *
 * Bare words that are not operators are read as a value: at runtime a bare
 * word resolves to the variable of that name if one exists, otherwise it is
 * literal text (so `Define name as WeeklyHow.` stores the text WeeklyHow).
 *
 * Library gating: operators owned by a library (see libraries.js) raise a
 * LibraryError at parse time when the library has not been added earlier in
 * the program. `divided by` and `power of` are also listed in the basic
 * maths section of the spec; E++ follows the Math-library section and treats
 * them (with the other Math features) as unlocked by `library "Math" add`.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});
  var ParseError = EPP.ParseError;
  var LibraryError = EPP.LibraryError;
  var LexError = EPP.LexError;

  // Words that can never be part of a bare-word value or expression.
  var RESERVED = {
    plus: 1, minus: 1, times: 1, divided: 1, by: 1, power: 1, percent: 1,
    square: 1, root: 1, of: 1, as: 1, is: 1, equal: 1, greater: 1, less: 1,
    than: 1, then: 1, otherwise: 1, 'if': 1, end: 1, repeat: 1, 'while': 1,
    'do': 1, and: 1, not: 1, different: 1, from: 1, between: 1, or: 1,
    contains: 1
  };

  /*
   * Dash-mode Python blocks (python code "-...") are taken out of the
   * source here, by the parser, before lexing. Everything between the
   * opening dash and the closing quote is raw Python: it may span lines
   * and contain characters E++ would reject, so it must never reach the
   * (fully generic, Python-agnostic) lexer. Each block is replaced in the
   * prepared source by a one-line placeholder string holding its index,
   * followed by the same number of newlines the block contained, so the
   * line numbers of all following E++ code stay correct. Strings, quoted
   * variables and comments are respected — the words `python code "-`
   * inside a string or a note do not start a block.
   *
   * Returns { source, blocks: [{ start, end, code, line, column, unterminated }] }
   * where start/end are offsets in the ORIGINAL source.
   */
  function extractPythonBlocks(source) {
    source = source === undefined || source === null ? '' : String(source);
    var blocks = [];
    var out = '';
    var i = 0;
    var line = 1, column = 1;
    var state = 'normal'; // normal | string | variable | comment
    var atStatementStart = true;

    function isWordChar(ch) { return !!ch && /[A-Za-z0-9_]/.test(ch); }
    function copyChar() {
      var ch = source[i];
      out += ch;
      if (ch === '\n') { line += 1; column = 1; } else { column += 1; }
      i += 1;
      return ch;
    }
    // If a `python code ",` or `python code "-` sequence starts at position p, returns the
    // index of its opening quote; otherwise returns -1.
    function rawPythonQuoteAt(p) {
      if (source.slice(p, p + 6).toLowerCase() !== 'python') return -1;
      if (isWordChar(source[p - 1]) || isWordChar(source[p + 6])) return -1;
      var j = p + 6;
      while (source[j] === ' ' || source[j] === '\t') j += 1;
      if (source.slice(j, j + 4).toLowerCase() !== 'code') return -1;
      if (isWordChar(source[j + 4])) return -1;
      j += 4;
      while (source[j] === ' ' || source[j] === '\t') j += 1;
      return (source[j] === '"' && (source[j + 1] === ',' || source[j + 1] === '-')) ? j : -1;
    }

    while (i < source.length) {
      var ch = source[i];

      if (state === 'comment') {
        if (ch === '\n') { state = 'normal'; atStatementStart = true; copyChar(); }
        else copyChar();
        continue;
      }
      if (state === 'string') {
        if (ch === '\\' && i + 1 < source.length) { copyChar(); copyChar(); continue; }
        if (ch === '"' || ch === '\n') state = 'normal';
        copyChar();
        continue;
      }
      if (state === 'variable') {
        if (ch === "'" || ch === '\n') state = 'normal';
        copyChar();
        continue;
      }

      // normal state
      if (ch === '\n' || ch === '.' || ch === ';') { atStatementStart = true; copyChar(); continue; }
      if (ch === '#') { state = 'comment'; copyChar(); continue; }
      if (ch === '/' && source[i + 1] === '/') { state = 'comment'; copyChar(); continue; }
      if (ch === '"') { state = 'string'; atStatementStart = false; copyChar(); continue; }
      if (ch === "'") { state = 'variable'; atStatementStart = false; copyChar(); continue; }
      if (atStatementStart && source.slice(i, i + 4).toLowerCase() === 'note' && !isWordChar(source[i + 4])) {
        state = 'comment'; copyChar(); continue;
      }

      var quoteIndex = rawPythonQuoteAt(i);
      if (quoteIndex !== -1) {
        // Copy `python code ` up to the quote, remembering its position.
        while (i < quoteIndex) copyChar();
        var quoteLine = line, quoteColumn = column;
        var modeChar = source[quoteIndex + 1]; // ',' (Humanizer) or '-' (legacy)
        var terminatorStr = modeChar + '"';    // ',"' or '-"'
        var delimEnd = source.indexOf(terminatorStr, quoteIndex + 2);
        var closeIndex = delimEnd === -1 ? source.indexOf('"', quoteIndex + 2) : delimEnd;
        var unterminated = closeIndex === -1;
        var codeEnd = unterminated ? source.length : closeIndex;
        var blockEnd = unterminated ? source.length : closeIndex + (delimEnd === -1 ? 1 : 2);
        var code = source.slice(quoteIndex + 2, codeEnd);
        var segment = source.slice(quoteIndex, blockEnd);
        var newlines = 0;
        for (var k = 0; k < segment.length; k++) if (segment[k] === '\n') newlines += 1;
        blocks.push({
          start: quoteIndex, end: blockEnd, code: code,
          line: quoteLine, column: quoteColumn, unterminated: unterminated,
          modeChar: modeChar
        });
        out += '"\u0001' + (blocks.length - 1) + '\u0001"';
        for (var n = 0; n < newlines; n++) out += '\n';
        // Advance position/line/column past the original block.
        for (var m = 0; m < segment.length; m++) {
          if (segment[m] === '\n') { line += 1; column = 1; } else { column += 1; }
        }
        i = blockEnd;
        atStatementStart = false;
        continue;
      }

      if (ch !== ' ' && ch !== '\t' && ch !== '\r') atStatementStart = false;
      copyChar();
    }
    return { source: out, blocks: blocks };
  }

  function Parser(source, options) {
    var Lexer = EPP.Lexer;
    var prepared = extractPythonBlocks(source);
    this.pythonBlocks = prepared.blocks;
    for (var b = 0; b < prepared.blocks.length; b++) {
      if (prepared.blocks[b].unterminated) {
        var term = prepared.blocks[b].modeChar === ',' ? ',"' : '"';
        throw new LexError('The Python code block never ends. Its closing ' + term + ' is missing.',
          prepared.blocks[b].line, prepared.blocks[b].column,
          'Close the Python code with ' + term + ' at the end of the block.');
      }
    }
    this.tokens = new Lexer(prepared.source).tokenize().filter(function (t) { return t.type !== 'COMMENT'; });
    this.pos = 0;
    this.loadedLibraries = {}; // canonical name -> true, in source order
    this.options = options || {};
  }

  // ---------- token helpers ----------
  Parser.prototype.current = function () { return this.tokens[this.pos]; };
  Parser.prototype.peek = function (offset) { return this.tokens[this.pos + (offset || 0)]; };
  Parser.prototype.atEnd = function () { return this.current().type === 'EOF'; };
  Parser.prototype.advance = function () { return this.tokens[this.pos++]; };
  Parser.prototype.isSeparator = function (token) {
    return token && (token.type === 'NEWLINE' || token.type === 'PERIOD' || token.type === 'SEMICOLON');
  };
  Parser.prototype.skipSeparators = function () {
    while (this.isSeparator(this.current())) this.advance();
  };
  Parser.prototype.isWord = function (word, token) {
    var t = token || this.current();
    return t && t.type === 'WORD' && t.value.toLowerCase() === word;
  };
  Parser.prototype.matchWord = function (word) {
    if (this.isWord(word)) { this.advance(); return true; }
    return false;
  };
  Parser.prototype.expectWord = function (word, context) {
    var t = this.current();
    if (!this.isWord(word)) {
      throw new ParseError(
        'Expected the word "' + word + '"' + (context ? ' ' + context : '') + ' but found ' + this.describe(t) + '.',
        t.line, t.column,
        'Check the sentence structure — E++ statements read like English sentences.'
      );
    }
    return this.advance();
  };
  Parser.prototype.expect = function (type, what) {
    var t = this.current();
    if (t.type !== type) {
      throw new ParseError('Expected ' + what + ' but found ' + this.describe(t) + '.', t.line, t.column, null);
    }
    return this.advance();
  };
  Parser.prototype.describe = function (token) {
    if (!token || token.type === 'EOF') return 'the end of the program';
    if (token.type === 'NEWLINE') return 'the end of the line';
    if (token.type === 'PERIOD') return '"."';
    return '"' + token.raw + '"';
  };

  Parser.prototype.requireLibrary = function (feature, token) {
    var owner = EPP.Libraries ? EPP.Libraries.ownerOf(feature) : null;
    if (owner && !this.loadedLibraries[owner]) {
      throw new LibraryError(
        '"' + feature + '" belongs to the ' + owner + ' library, which has not been added yet.',
        token.line, token.column,
        'Add this near the top of your program: add library "' + owner + '"'
      );
    }
  };

  // ---------- program & statements ----------
  Parser.prototype.parse = function () {
    var body = [];
    this.skipSeparators();
    while (!this.atEnd()) {
      if (this.isWord('end') || this.isWord('otherwise')) {
        var t = this.current();
        throw new ParseError('Unexpected "' + t.value + '" here — there is no matching opening statement.',
          t.line, t.column, 'Remove it, or add the "if"/"repeat"/"while" statement it belongs to.');
      }
      body.push(this.parseStatement());
      this.skipSeparators();
    }
    return EPP.AST.Program(body);
  };

  Parser.prototype.parseStatement = function () {
    var t = this.current();
    // A statement starting with a quoted name is a Draw movement:
    // 'hero' move up "10"
    if (t.type === 'VARIABLE') return this.parseMoveSprite();
    if (t.type !== 'WORD') {
      // A statement may also start with a value-less token error:
      throw new ParseError('Expected a statement but found ' + this.describe(t) + '.',
        t.line, t.column,
        'Statements start with a word such as Define, say, ask, if, wait, add library or python code.');
    }
    var word = t.value.toLowerCase();
    switch (word) {
      case 'add': return this.parseAdd();
      case 'define': return this.parseDefine();
      case 'set': case 'change': return this.parseSet();
      case 'say': case 'display': case 'show': return this.parseSay();
      case 'print':
        // print("...") is Python, not E++ — it must never quietly behave
        // like `say`. Python may only run inside python code "...", and
        // only after the Python library has been added.
        throw new ParseError('\"' + t.value + '\" is Python, not E++, so E++ will not run it on its own.',
          t.line, t.column,
          'To run Python, first add the Python library with: add library \"Python\" — then put the Python inside python code, like this: python code \"print(1)\". If you just want E++ to show something, use the word say.');
      case 'ask': return this.parseAsk();
      case 'wait': return this.parseWait();
      case 'library': return this.parseLibrary();
      case 'if': return this.parseIf();
      case 'repeat': return this.parseRepeat();
      case 'while': return this.parseWhile();
      case 'stop': case 'break': this.advance(); return EPP.AST.Stop(t);
      case 'note': return this.parseNote();
      case 'increase': return this.parseIncreaseDecrease(true);
      case 'decrease': return this.parseIncreaseDecrease(false);
      case 'python': return this.parsePython();
      case 'loopback': return this.parseLoopback();
      case 'check': return this.parseCheck();
      default:
        throw new ParseError('I do not understand the statement starting with "' + t.value + '".',
          t.line, t.column,
          'Statements start with Define, say, display, ask, if, Increase, Decrease, repeat, while, wait, python code or add library "..."');
    }
  };

  Parser.prototype.parseAdd = function () {
    var kw = this.advance(); // add
    if (this.isWord('library')) {
      this.advance(); // library
      var nameToken = this.current();
      if (nameToken.type !== 'STRING') {
        throw new ParseError('A library name must be written in double quotes, for example: add library "Math".',
          nameToken.line, nameToken.column, null);
      }
      this.advance();
      if (this.options && this.options.fileName) {
        var fname = this.options.fileName;
        if (/\.eppl$/i.test(fname) && !/\.eppla$/i.test(fname)) {
          throw new LibraryError(
            'Files ending in .eppl cannot use libraries. In E++, .eppl is strictly for files WITHOUT libraries, and .eppla is for files WITH libraries.',
            nameToken.line, nameToken.column,
            'Rename this file to "' + fname.replace(/\.eppl$/i, '.eppla') + '" to use libraries.');
        }
      }
      if (!EPP.Libraries || !EPP.Libraries.isKnown(nameToken.value)) {
        var available = EPP.Libraries ? EPP.Libraries.names().join(', ') : 'Math';
        throw new LibraryError('There is no library called "' + nameToken.value + '".',
          nameToken.line, nameToken.column, 'Available libraries: ' + available + '.');
      }
      var canonical = EPP.Libraries.canonical(nameToken.value);
      this.loadedLibraries[canonical] = true;
      return EPP.AST.Library(canonical, kw);
    }
    var t = this.current();
    throw new ParseError('Expected "library" after "add" but found ' + this.describe(t) + '.',
      kw.line, kw.column, 'To add a library, write: add library "Math".');
  };

  Parser.prototype.parseName = function (context) {
    var t = this.current();
    if (t.type !== 'WORD') {
      throw new ParseError('Expected a variable name ' + context + ' but found ' + this.describe(t) + '.',
        t.line, t.column, 'Variable names are single words, for example: name, score, answer2.');
    }
    this.advance();
    return t.value;
  };

  Parser.prototype.parseDefine = function () {
    var kw = this.advance(); // Define
    // Quoted variable name form: define '<name>' as <value>
    // Also: define '<name>' as drawing sprite  (Draw library)
    // Also: define '<name>' as image "<filename>"  (Image library)
    if (this.current().type === 'VARIABLE') {
      var quotedName = this.advance().value;
      this.expectWord('as', 'in a definition, for example: define \'' + quotedName + '\' as ...');
      // Check for "drawing sprite" (Draw library)
      if (this.isWord('drawing')) {
        this.advance(); // drawing
        if (!this.matchWord('sprite')) {
          var badSprite = this.current();
          throw new ParseError('Expected the word "sprite" after "drawing" but found ' + this.describe(badSprite) + '.',
            badSprite.line, badSprite.column,
            'Write it like this: define \'' + quotedName + '\' as drawing sprite.');
        }
        return EPP.AST.DefineSprite(quotedName, kw);
      }
      // Check for "image <source>" (Image library)
      if (this.isWord('image')) {
        this.requireLibrary('define image', kw);
        this.advance(); // image
        if (this.isSeparator(this.current()) || this.atEnd()) {
          var badImg = this.current();
          throw new ParseError('Expected a Base64 image string after "image" in the definition.',
            badImg.line, badImg.column,
            'Write it like this: define \'' + quotedName + '\' as image "<base64-string>".');
        }
        var source = this.parseExpression();
        return EPP.AST.DefineImage(quotedName, source, kw);
      }
      // Dev Build 5: regular variable definition with quoted name
      var value = this.parseExpression();
      return EPP.AST.Define(quotedName, value, kw);
    }
    var name = this.parseName('after "Define"');
    this.expectWord('as', 'in a Define statement, for example: Define ' + name + ' as 10.');
    var value = this.parseExpression();
    return EPP.AST.Define(name, value, kw);
  };

  /** loopback to if — re-evaluates the nearest previous if (Dev Build 4). */
  Parser.prototype.parseLoopback = function () {
    var kw = this.advance(); // loopback
    if (!this.matchWord('to')) {
      var bad = this.current();
      throw new ParseError('Expected "to" after "loopback" but found ' + this.describe(bad) + '.',
        bad.line, bad.column, 'Write it like this: loopback to if');
    }
    if (!this.matchWord('if')) {
      var bad2 = this.current();
      throw new ParseError('Expected "if" after "loopback to" but found ' + this.describe(bad2) + '.',
        bad2.line, bad2.column, 'loopback only goes back to an if, so write it like this: loopback to if');
    }
    return EPP.AST.Loopback(kw);
  };

  /**
   * Dev Build 5: check if '<variable>' exists — Image library.
   * Checks whether an image variable has been defined.
   */
  Parser.prototype.parseCheck = function () {
    var kw = this.advance(); // check
    this.requireLibrary('check if exists', kw);
    if (!this.matchWord('if')) {
      var badIf = this.current();
      throw new ParseError('Expected "if" after "check" but found ' + this.describe(badIf) + '.',
        badIf.line, badIf.column, 'Write it like this: check if \'cat\' exists.');
    }
    // Expect a variable reference (quoted name)
    var varToken = this.current();
    if (varToken.type !== 'VARIABLE') {
      throw new ParseError('Expected a variable name in single quotes after "if" but found ' + this.describe(varToken) + '.',
        varToken.line, varToken.column, 'Write it like this: check if \'cat\' exists.');
    }
    this.advance(); // consume the variable token
    if (!this.matchWord('exists')) {
      var badExists = this.current();
      throw new ParseError('Expected "exists" after the variable but found ' + this.describe(badExists) + '.',
        badExists.line, badExists.column, 'Write it like this: check if \'cat\' exists.');
    }
    return EPP.AST.CheckExists(varToken.value, kw);
  };

  /** 'name' move up/down/left/right "<pixels>" — Draw movement. */
  Parser.prototype.parseMoveSprite = function () {
    var nameToken = this.advance(); // 'name'
    var name = nameToken.value;
    if (!this.matchWord('move')) {
      var bad = this.current();
      throw new ParseError('Expected the word "move" after \'' + name + '\' but found ' + this.describe(bad) + '.',
        bad.line, bad.column,
        'Move a sprite like this: \'' + name + '\' move up "10" — the direction is up, down, left or right, and the pixels go in double quotes.');
    }
    var dirToken = this.current();
    var direction = dirToken.type === 'WORD' ? dirToken.value.toLowerCase() : '';
    if (['up', 'down', 'left', 'right'].indexOf(direction) === -1) {
      throw new ParseError('Expected a direction (up, down, left or right) after "move" but found ' + this.describe(dirToken) + '.',
        dirToken.line, dirToken.column,
        'Write it like this: \'' + name + '\' move up "10"');
    }
    this.advance(); // direction
    var pixelsToken = this.current();
    if (pixelsToken.type !== 'STRING') {
      throw new ParseError('The number of pixels must be written as text in double quotes, like "10", but found ' + this.describe(pixelsToken) + '.',
        pixelsToken.line, pixelsToken.column,
        'Write it like this: \'' + name + '\' move ' + direction + ' "10"');
    }
    this.advance(); // pixels
    return EPP.AST.MoveSprite(name, direction, pixelsToken.value, nameToken);
  };

  Parser.prototype.parseSet = function () {
    var kw = this.advance(); // Set / Change
    var name;
    // Dev Build 5: Set also accepts a quoted variable name: Set 'count' to 5.
    if (this.current().type === 'VARIABLE') {
      name = this.advance().value;
    } else {
      name = this.parseName('after "' + kw.value + '"');
    }
    this.expectWord('to', ', for example: Set ' + name + ' to 5.');
    var value = this.parseExpression();
    return EPP.AST.Set(name, value, kw);
  };

  Parser.prototype.parseSay = function () {
    var kw = this.advance(); // say / display / show
    if (this.isSeparator(this.current()) || this.atEnd()) {
      throw new ParseError('"' + kw.value + '" needs something after it.', kw.line, kw.column,
        'For example: ' + kw.value + ' "Hello". or ' + kw.value + ' 1 plus 1.');
    }
    // Dev Build 5: display image '<name>' — Image library
    if (this.isWord('image') && this.peek(1) && this.peek(1).type === 'VARIABLE') {
      this.requireLibrary('display image', kw);
      this.advance(); // image
      var imgName = this.advance().value; // 'name'
      return EPP.AST.DisplayImage(imgName, kw);
    }
    var value = this.parseExpression();
    return EPP.AST.Say(value, kw);
  };

  Parser.prototype.parseAsk = function () {
    var kw = this.advance(); // ask
    var prompt = this.parseExpression();
    // and save answer as <name>   (a few words may be omitted, kept forgiving)
    this.expectWord('and', 'in an ask statement, for example: ask "Your name?" and save answer as name.');
    this.matchWord('save');
    this.matchWord('answer');
    this.matchWord('the');
    this.expectWord('as', 'before the variable name.');
    // Dev Build 5: ask also accepts a quoted variable name: ask "..." and save answer as 'name'.
    var name;
    if (this.current().type === 'VARIABLE') {
      name = this.advance().value;
    } else {
      name = this.parseName('at the end of the ask statement');
    }
    return EPP.AST.Ask(prompt, name, kw);
  };

  Parser.prototype.parseWait = function () {
    var kw = this.advance(); // wait
    var duration = this.parseExpression();
    this.matchWord('seconds'); this.matchWord('second');
    return EPP.AST.Wait(duration, kw);
  };

  // Increase <variable> by <amount>  /  Decrease <variable> by <amount>
  // The variable may be written as a plain name (Increase score by 1) or
  // as a quoted reference (Increase 'score' by 1).
  Parser.prototype.parseIncreaseDecrease = function (isIncrease) {
    var kw = this.advance(); // Increase / Decrease
    var word = isIncrease ? 'Increase' : 'Decrease';
    var name;
    if (this.current().type === 'VARIABLE') {
      name = this.advance().value;
    } else {
      name = this.parseName('after "' + word + '", for example: ' + word + ' score by 1.');
    }
    if (!this.matchWord('by')) {
      var t = this.current();
      throw new ParseError(word + ' needs the word "by" before the amount, but found ' + this.describe(t) + '.',
        t.line, t.column, 'Write it like this: ' + word + ' ' + name + ' by 1.');
    }
    if (this.isSeparator(this.current()) || this.atEnd()) {
      var t2 = this.current();
      throw new ParseError(word + ' ' + name + ' by needs an amount after "by".',
        t2.line, t2.column, 'For example: ' + word + ' ' + name + ' by 1.');
    }
    var amount = this.parseExpression();
    return isIncrease ? EPP.AST.Increase(name, amount, kw) : EPP.AST.Decrease(name, amount, kw);
  }

  // python code "<python>"  /  python code ",<raw python block>,"  [Python]
  Parser.prototype.parsePython = function () {
    var kw = this.advance(); // python
    // Python code may only run when the Python library has been added.
    if (!this.loadedLibraries.Python) {
      throw new LibraryError(
        'You cannot run Python code yet, because the Python library has not been added.',
        kw.line, kw.column,
        'Add this line above your Python code: add library "Python" — then python code "..." will work.');
    }
    if (!this.matchWord('code')) {
      var t0 = this.current();
      throw new ParseError('Python statements start with the words "python code", but found ' + this.describe(t0) + ' after "python".',
        t0.line, t0.column, 'Write it like this: python code "print(\'Hello\')"');
    }
    var token = this.current();
    if (token.type !== 'STRING') {
      throw new ParseError('The Python code must be written inside double quotes, but found ' + this.describe(token) + '.',
        token.line, token.column,
        'For one line: python code "print(1 plus 2)" — for several lines, use commas: python code ",print(1)," and close the quote at the end.');
    }
    this.advance();
    var code = token.value;
    var block = false;
    // Comma-mode / Dash-mode blocks were extracted before lexing and arrive as a
    // placeholder string holding the block's index.
    var placeholder = /^\u0001(\d+)\u0001$/.exec(code);
    if (placeholder) {
      var stored = this.pythonBlocks[Number(placeholder[1])];
      code = stored ? stored.code : '';
      block = true;
    } else if (code.charAt(0) === ',' || code.charAt(0) === '-') {
      block = true;
      code = code.slice(1);
    }
    if (!code.trim()) {
      throw new ParseError(block
        ? 'This Python code block is empty — there is no Python code after the opening comma.'
        : 'The Python code is empty — there is nothing between the quotes.',
        token.line, token.column,
        'Write some Python between the quotes, for example: python code "print(\'Hello\')"');
    }
    return EPP.AST.PythonCode(code, kw, block);
  };

  Parser.prototype.parseLibrary = function () {
    var kw = this.advance(); // library
    var nameToken = this.current();
    if (nameToken.type !== 'STRING') {
      throw new ParseError('A library name must be written in double quotes, for example: add library "Math".',
        nameToken.line, nameToken.column, null);
    }
    this.advance();
    if (this.options && this.options.fileName) {
      var fname = this.options.fileName;
      if (/\.eppl$/i.test(fname) && !/\.eppla$/i.test(fname)) {
        throw new LibraryError(
          'Files ending in .eppl cannot use libraries. In E++, .eppl is strictly for files WITHOUT libraries, and .eppla is for files WITH libraries.',
          nameToken.line, nameToken.column,
          'Rename this file to "' + fname.replace(/\.eppl$/i, '.eppla') + '" to use libraries.');
      }
    }
    if (!(this.matchWord('add') || this.matchWord('load') || this.matchWord('import'))) {
      var t = this.current();
      throw new ParseError('Expected the word "add" after the library name, or use: add library "' + nameToken.value + '".',
        t.line, t.column, 'Write it like this: add library "' + nameToken.value + '".');
    }
    if (!EPP.Libraries || !EPP.Libraries.isKnown(nameToken.value)) {
      var available = EPP.Libraries ? EPP.Libraries.names().join(', ') : 'Math';
      throw new LibraryError('There is no library called "' + nameToken.value + '".',
        nameToken.line, nameToken.column, 'Available libraries: ' + available + '.');
    }
    var canonical = EPP.Libraries.canonical(nameToken.value);
    this.loadedLibraries[canonical] = true;
    return EPP.AST.Library(canonical, kw);
  };

  Parser.prototype.parseNote = function () {
    var kw = this.advance(); // note
    if (this.current().type === 'COLON') this.advance();
    // A note runs to the end of the statement; its words are ignored.
    while (!this.isSeparator(this.current()) && !this.atEnd()) this.advance();
    return EPP.AST.Note('', kw);
  };

  /**
   * Reads either an inline body (a single statement on the same line as
   * `markerToken`) or a block body (statements on following lines).
   * Returns { body: [...], block: boolean }.
   */
  Parser.prototype.parseBranch = function (markerToken) {
    var next = this.current();
    var block = this.isSeparator(next) || next.type === 'EOF' || next.line !== markerToken.line;
    if (!block) {
      return { body: [this.parseStatement()], block: false };
    }
    this.skipSeparators();
    return { body: this.parseBlock(), block: true };
  };

  Parser.prototype.parseBlock = function () {
    var body = [];
    this.skipSeparators();
    while (!this.atEnd() && !this.isWord('end') && !this.isWord('otherwise') && !this.isChainConnectorAhead()) {
      body.push(this.parseStatement());
      this.skipSeparators();
    }
    return body;
  };

  /** True when the tokens ahead are an `and` chain connector: `and` then `otherwise`. */
  Parser.prototype.isChainConnectorAhead = function () {
    if (!this.isWord('and')) return false;
    var i = this.pos + 1;
    while (this.tokens[i] && this.isSeparator(this.tokens[i])) i += 1;
    return this.isWord('otherwise', this.tokens[i]);
  };

  /**
   * Consumes an `and` chain connector (`... <action> and` NEWLINE
   * `otherwise ...`), leaving the parser on the `otherwise`. Returns false
   * when there is no connector.
   */
  Parser.prototype.consumeChainConnector = function () {
    if (!this.isChainConnectorAhead()) return false;
    this.advance(); // and
    this.skipSeparators();
    return this.isWord('otherwise');
  };

  Parser.prototype.expectEnd = function (kind, openToken) {
    this.skipSeparators();
    var t = this.current();
    if (!this.isWord('end')) {
      throw new ParseError('This "' + kind + '" statement (started on line ' + openToken.line + ') never ends.',
        t.line, t.column, 'Close it with: end ' + kind);
    }
    this.advance(); // end
    this.matchWord(kind);
    if (kind === 'if') this.matchWord('statement');
  };

  /**
   * Parses a condition for one branch of an if-chain. Inside a chain,
   * `not a number` with nothing in front of it tests the same value the
   * first condition in the chain tested (the natural way to check a typed
   * answer), e.g.:
   *   if 'age' is greater than 10 then ... otherwise if not a number then ...
   */
  Parser.prototype.parseBranchCondition = function (firstCondition) {
    var t = this.current();
    if (this.isWord('not') &&
        this.isWord('a', this.peek(1)) &&
        this.isWord('number', this.peek(2))) {
      this.advance(); this.advance(); this.advance();
      return EPP.AST.Condition('notNumber', firstCondition.left, null, t);
    }
    return this.parseCondition();
  };

  Parser.prototype.parseIf = function () {
    var kw = this.advance(); // if
    var firstCondition = this.parseCondition();
    var condition = firstCondition;
    var thenToken = this.expectWord('then', 'after the if condition.');

    // Parse the whole chain: if / (otherwise if)* / (otherwise)? — the
    // branches may be mixed inline and block forms, in any number.
    var branches = [];
    var firstPart = this.parseBranch(thenToken);
    var outerBlock = firstPart.block;
    branches.push({ condition: condition, body: firstPart.body });

    for (;;) {
      // A branch action may end with `and` to continue the chain below.
      var chained = this.consumeChainConnector();
      if (!chained) {
        var savedPos = this.pos;
        this.skipSeparators();
        if (!this.isWord('otherwise')) { this.pos = savedPos; break; }
      }
      var otherwiseToken = this.advance(); // otherwise

      if (this.isWord('if')) {
        this.advance(); // if
        condition = this.parseBranchCondition(firstCondition);
        thenToken = this.expectWord('then', 'after the otherwise-if condition.');
        var nextPart = this.parseBranch(thenToken);
        branches.push({ condition: condition, body: nextPart.body });
        continue;
      }

      // Final `otherwise` branch (no condition).
      var elsePart = this.parseBranch(otherwiseToken);
      branches.push({ condition: null, body: elsePart.body });
      break;
    }

    var thenBranch = branches[0].body;
    var last = branches[branches.length - 1];
    var elseBranch = last.condition === null && branches.length > 1 ? last.body : [];

    if (outerBlock) {
      // A block if must be closed with `end if` (also when one of its
      // branches was written inline, e.g. `otherwise say "x"`).
      this.expectEnd('if', kw);
    } else {
      this.consumeOptionalEndIf();
    }
    return EPP.AST.If(firstCondition, thenBranch, elseBranch, kw, branches);
  };

  /** Consumes a trailing `end if` when one is present; otherwise restores position. */
  Parser.prototype.consumeOptionalEndIf = function () {
    var savedPos = this.pos;
    this.skipSeparators();
    if (this.isWord('end')) {
      var after = this.peek(1);
      if (after && after.type === 'WORD' && after.value.toLowerCase() !== 'if' &&
          (after.value.toLowerCase() === 'repeat' || after.value.toLowerCase() === 'while')) {
        this.pos = savedPos; // belongs to an enclosing repeat/while
        return;
      }
      this.advance(); // end
      this.matchWord('if');
      return;
    }
    this.pos = savedPos;
  };

  Parser.prototype.parseRepeat = function () {
    var kw = this.advance(); // repeat
    // In "repeat 3 times", the word "times" ends the count — it is not the
    // multiplication operator. Suppress `times` as an operator while the
    // count is being read (use parentheses for a count containing `times`).
    this.timesSuppressed = (this.timesSuppressed || 0) + 1;
    var count;
    try { count = this.parseExpression(); }
    finally { this.timesSuppressed -= 1; }
    var marker = this.expectWord('times', 'in a repeat statement, for example: repeat 3 times.');
    var part = this.parseBranch(marker);
    if (part.block) this.expectEnd('repeat', kw);
    return EPP.AST.Repeat(count, part.body, kw);
  };

  Parser.prototype.parseWhile = function () {
    var kw = this.advance(); // while
    var condition = this.parseCondition();
    var marker = this.current();
    if (this.matchWord('do')) marker = this.tokens[this.pos - 1];
    var part = this.parseBranch(marker.type ? marker : kw);
    if (part.block) this.expectEnd('while', kw);
    return EPP.AST.While(condition, part.body, kw);
  };

  // ---------- conditions ----------
  Parser.prototype.parseCondition = function () {
    var t0 = this.current();
    // `not a number` on its own has nothing to check here — it only makes
    // sense inside an otherwise-if chain (handled by parseBranchCondition)
    // or written in full as: if 'age' is not a number then ...
    if (this.isWord('not') &&
        this.isWord('a', this.peek(1)) &&
        this.isWord('number', this.peek(2))) {
      throw new ParseError('"not a number" needs a value to check, but nothing was written in front of it.',
        t0.line, t0.column,
        'Write it in full, for example: if \'age\' is not a number then say "Numbers only, please." — or use it in a chain after an if about the same value: otherwise if not a number then ...');
    }
    var left = this.parseExpression();
    var t = this.current();

    // Dev Build 5: <value> contains <value> — core logic (no library needed)
    if (this.isWord('contains')) {
      this.advance(); // contains
      var contRight = this.parseExpression();
      return EPP.AST.Condition('contains', left, contRight, t);
    }

    if (this.isWord('equals')) {
      this.advance();
      var r1 = this.parseExpression();
      return EPP.AST.Condition('equal', left, r1, t);
    }
    if (!this.isWord('is')) {
      return EPP.AST.Condition('truthy', left, null, t);
    }
    this.advance(); // is
    var negated = this.matchWord('not');

    // Dev Build 5: is [not] a positive number / a negative number (Math library)
    if (this.isWord('a') && this.peek(1) && this.peek(1).type === 'WORD') {
      var nextWord = this.peek(1).value.toLowerCase();
      if (nextWord === 'positive') {
        this.advance(); // a
        this.advance(); // positive
        this.expectWord('number', 'in "is a positive number".');
        this.requireLibrary('is a positive number', t);
        return EPP.AST.Condition(negated ? 'notPositive' : 'positive', left, null, t);
      }
      if (nextWord === 'negative') {
        this.advance(); // a
        this.advance(); // negative
        this.expectWord('number', 'in "is a negative number".');
        this.requireLibrary('is a negative number', t);
        return EPP.AST.Condition(negated ? 'notNegative' : 'negative', left, null, t);
      }
    }

    // Dev Build 5: is [not] in the range of A to B (Math library)
    if (this.isWord('in') && this.peek(1) && this.peek(1).type === 'WORD' &&
        this.peek(1).value.toLowerCase() === 'the' &&
        this.peek(2) && this.peek(2).type === 'WORD' &&
        this.peek(2).value.toLowerCase() === 'range') {
      this.advance(); // in
      this.advance(); // the
      this.advance(); // range
      this.expectWord('of', 'in "is in the range of A to B".');
      this.requireLibrary('is in the range of', t);
      var low = this.parsePower();
      this.expectWord('to', 'in "is in the range of A to B" — write the upper bound after "to".');
      var high = this.parsePower();
      return EPP.AST.Condition(negated ? 'notInRange' : 'inRange', left, { low: low, high: high }, t);
    }

    // is a number / is not a number / is number / is not number
    if (this.isWord('a') || this.isWord('number')) {
      this.matchWord('a');
      if (!this.matchWord('number')) {
        var tnum = this.current();
        throw new ParseError('After "' + (negated ? 'is not a' : 'is a') + '" I expected the word "number", but found ' + this.describe(tnum) + '.',
          tnum.line, tnum.column, 'Write it like this: if \'age\' is not a number then say "Numbers only, please."');
      }
      return EPP.AST.Condition(negated ? 'notNumber' : 'number', left, null, t);
    }

    if (this.matchWord('exactly')) {
      this.expectWord('equal', 'in "is exactly equal to".');
      this.expectWord('to', 'in "is exactly equal to".');
      var exreq = this.parseExpression();
      return EPP.AST.Condition(negated ? 'notExactEqual' : 'exactEqual', left, exreq, t);
    }
    if (this.matchWord('equal')) {
      this.expectWord('to', 'in "is equal to".');
      var req = this.parseExpression();
      return EPP.AST.Condition(negated ? 'notEqual' : 'equal', left, req, t);
    }
    if (this.matchWord('different')) {
      this.expectWord('from', 'in "is different from".');
      var rd = this.parseExpression();
      return EPP.AST.Condition('notEqual', left, rd, t);
    }
    if (this.matchWord('greater')) {
      this.expectWord('than', 'in "is greater than".');
      if (this.matchWord('or')) {
        this.expectWord('equal', 'in "or equal to".');
        this.expectWord('to', 'in "or equal to".');
        var rge = this.parseExpression();
        return EPP.AST.Condition('greaterOrEqual', left, rge, t);
      }
      var rg = this.parseExpression();
      return EPP.AST.Condition('greater', left, rg, t);
    }
    if (this.matchWord('less') || this.matchWord('lesser')) {
      this.expectWord('than', 'in "is less than" (also written "is lesser than").');
      if (this.matchWord('or')) {
        this.expectWord('equal', 'in "or equal to".');
        this.expectWord('to', 'in "or equal to".');
        var rle = this.parseExpression();
        return EPP.AST.Condition('lessOrEqual', left, rle, t);
      }
      var rl = this.parseExpression();
      return EPP.AST.Condition('less', left, rl, t);
    }
    var bad = this.current();
    throw new ParseError('After "is" I expected a comparison such as "equal to", "greater than", "lesser than", "a positive number", "in the range of" or "not a number", but found ' +
      this.describe(bad) + '.', bad.line, bad.column,
      'For example: if \'score\' is equal to 10 then say "Perfect".');
  };

  // ---------- expressions ----------
  Parser.prototype.parseExpression = function () {
    var expr = this.parseAdditive();
    // Postfix conversion applies to the whole expression:
    //   1 divided by 2 as fraction
    while (this.isWord('as')) {
      var asToken = this.current();
      var lookahead = this.peek(1);
      var kind = lookahead && lookahead.type === 'WORD' ? lookahead.value.toLowerCase() : '';
      if (kind !== 'fraction' && kind !== 'decimal') break;
      this.requireLibrary('as ' + kind, asToken);
      this.advance(); this.advance();
      expr = EPP.AST.Conversion(kind, expr, asToken);
    }
    return expr;
  };

  Parser.prototype.parseAdditive = function () {
    var left = this.parseMultiplicative();
    while (this.isWord('plus') || this.isWord('minus')) {
      var op = this.advance();
      var right = this.parseMultiplicative();
      left = EPP.AST.Binary(op.value.toLowerCase(), left, right, op);
    }
    return left;
  };

  Parser.prototype.parseMultiplicative = function () {
    var left = this.parsePower();
    for (;;) {
      if (this.isWord('times') && !this.timesSuppressed) {
        var t1 = this.advance();
        left = EPP.AST.Binary('times', left, this.parsePower(), t1);
      } else if (this.isWord('divided')) {
        var t2 = this.current();
        this.requireLibrary('divided by', t2);
        this.advance();
        this.expectWord('by', 'in "divided by".');
        left = EPP.AST.Binary('dividedBy', left, this.parsePower(), t2);
      } else if (this.isWord('percent')) {
        var t3 = this.current();
        this.requireLibrary('percent of', t3);
        this.advance();
        this.expectWord('of', 'in "percent of", for example: 50 percent of 200.');
        left = EPP.AST.PercentOf(left, this.parsePower(), t3);
      } else break;
    }
    return left;
  };

  Parser.prototype.parsePower = function () {
    var left = this.parseUnary();
    if (this.isWord('power')) {
      var t = this.current();
      this.requireLibrary('power of', t);
      this.advance();
      this.expectWord('of', 'in "power of", for example: 2 power of 3.');
      var right = this.parsePower(); // right-associative
      return EPP.AST.Binary('powerOf', left, right, t);
    }
    return left;
  };

  Parser.prototype.parseUnary = function () {
    var t = this.current();
    if (this.isWord('minus')) {
      this.advance();
      return EPP.AST.Unary('minus', this.parseUnary(), t);
    }
    if (this.isWord('square')) {
      this.requireLibrary('square root of', t);
      this.advance();
      this.expectWord('root', 'in "square root of".');
      this.expectWord('of', 'in "square root of".');
      return EPP.AST.SquareRoot(this.parseUnary(), t);
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    var t = this.current();

    if (t.type === 'NUMBER') { this.advance(); return EPP.AST.Literal(parseFloat(t.value), t); }
    if (t.type === 'STRING') { this.advance(); return EPP.AST.Literal(t.value, t); }
    if (t.type === 'VARIABLE') { this.advance(); return EPP.AST.Variable(t.value, t); }

    if (t.type === 'LPAREN') {
      this.advance();
      var inner = this.parseExpression();
      this.expect('RPAREN', 'a closing ")"');
      return inner;
    }

    if (t.type === 'WORD') {
      var word = t.value.toLowerCase();

      if (word === 'true' || word === 'yes') { this.advance(); return EPP.AST.Literal(true, t); }
      if (word === 'false' || word === 'no') { this.advance(); return EPP.AST.Literal(false, t); }

      // Text library functions.
      if (word === 'uppercase' || word === 'lowercase' || word === 'length') {
        this.requireLibrary(word + ' of', t);
        this.advance();
        this.expectWord('of', 'in "' + word + ' of".');
        return EPP.AST.TextFunction(word, this.parseUnary(), t);
      }

      // Random library function.
      if (word === 'random') {
        this.requireLibrary('random number between ... and ...', t);
        this.advance();
        this.expectWord('number', 'in "random number between ... and ...".');
        this.expectWord('between', 'in "random number between ... and ...".');
        var low = this.parsePower();
        this.expectWord('and', 'between the two numbers.');
        var high = this.parsePower();
        return EPP.AST.RandomNumber(low, high, t);
      }

      if (RESERVED[word]) {
        throw new ParseError('Expected a value but found the word "' + t.value + '".',
          t.line, t.column,
          'Values can be "text in quotes", \'a variable\', a number, or maths such as 1 plus 1.');
      }

      // Bare words: one or more words that are not operators/keywords.
      var words = [];
      var first = t;
      while (this.current().type === 'WORD' && !RESERVED[this.current().value.toLowerCase()]) {
        words.push(this.advance().value);
      }
      return EPP.AST.BareWord(words.join(' '), first);
    }

    throw new ParseError('Expected a value but found ' + this.describe(t) + '.',
      t.line, t.column,
      'Values can be "text in quotes", \'a variable\', a number, or maths such as 1 plus 1.');
  };

  Parser.parse = function (source, options) { return new Parser(source, options).parse(); };

  EPP.Parser = Parser;
  EPP.extractPythonBlocks = extractPythonBlocks;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Parser: Parser };
  }
})(typeof window !== 'undefined' ? window : globalThis);
