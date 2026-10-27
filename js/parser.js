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
 *   primary        := NUMBER | STRING | VARIABLE
 *                   | "(" expression ")"
 *                   | ("uppercase of"|"lowercase of"|"length of") unary   [Text]
 *                   | "random number between" power "and" power          [Random]
 *
 * Unquoted words are not values. Text must use double quotes and variable
 * references use single quotes, including in branches that never execute.
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
    if (!EPP.Libraries) return;
    // A feature may belong to more than one library (ImprovedWait contains
    // every ImprovedWaitLite feature, for example) — any added owner is enough.
    var owners = EPP.Libraries.ownersOf
      ? EPP.Libraries.ownersOf(feature)
      : (EPP.Libraries.ownerOf(feature) ? [EPP.Libraries.ownerOf(feature)] : []);
    if (!owners.length) return;
    for (var i = 0; i < owners.length; i++) {
      if (this.loadedLibraries[owners[i]]) return;
    }
    var owner = owners[0];
    var why = EPP.Libraries.whyUnavailable ? EPP.Libraries.whyUnavailable(owner) : null;
    throw new LibraryError(
      '"' + feature + '" belongs to the ' + owner + ' library, which has not been added yet.',
      token.line, token.column,
      why || ('Add this near the top of your program: add library "' + owner + '"')
    );
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
      // `let` and `define` are the same statement, and `be`, `to` and `as` are
      // the same connector: the Studio's examples say `let 'Grade' be 29`.
      case 'define': case 'let': return this.parseDefine();
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
      case 'create': return this.parseCreateActor();
      // link the image "hero.png" to the actor 'hero'
      case 'link': return this.parseActorImage();
      case 'put': return this.parsePlaceActor();
      case 'play': return this.parsePlayGame();
      case 'pause': return this.parseActorControl('pause');
      case 'resume': return this.parseActorControl('resume');
      case 'cancel': return this.parseCancelWait();
      case 'library': return this.parseLibrary();
      case 'if': return this.parseIf();
      case 'repeat': return this.parseRepeat();
      case 'while': return this.parseWhile();
      case 'stop': return this.parseStop(t);
      case 'break': this.advance(); return EPP.AST.Stop(t);
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
    // Release 1.2: `add the "Math" library` is the form the documentation
    // uses, so accept it alongside `add library "Math"`.
    if (this.isWord('the') && this.peek(1) && this.peek(1).type === 'STRING') {
      this.advance(); // the
      var libToken = this.advance(); // "Math"
      this.expectWord('library', 'after the library name, for example: add the "Math" library.');
      return this.finishAdd(libToken, kw);
    }
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
      return this.finishAdd(nameToken, kw);
    }
    var t = this.current();
    throw new ParseError('Expected "library" after "add" but found ' + this.describe(t) + '.',
      kw.line, kw.column, 'To add a library, write: add the "Math" library.');
  };

  /** Shared tail of every way of writing "add a library". */
  Parser.prototype.finishAdd = function (nameToken, kw) {
    if (!EPP.Libraries || !EPP.Libraries.isKnown(nameToken.value)) {
      var available = EPP.Libraries ? EPP.Libraries.names().join(', ') : 'Math';
      throw new LibraryError('There is no library called "' + nameToken.value + '".',
        nameToken.line, nameToken.column, 'Available libraries: ' + available + '.');
    }
    var canonical = EPP.Libraries.canonical(nameToken.value);
    if (EPP.Libraries.isAvailable && !EPP.Libraries.isAvailable(canonical)) {
      throw new LibraryError('The "' + canonical + '" library is not included in this build of E++.',
        nameToken.line, nameToken.column,
        EPP.Libraries.whyUnavailable(canonical));
    }
    if (this.options && this.options.fileName) {
      var fname2 = this.options.fileName;
      if (/\.eppl$/i.test(fname2) && !/\.eppla$/i.test(fname2)) {
        throw new LibraryError(
          'Files ending in .eppl cannot use libraries. In E++, .eppl is strictly for files WITHOUT libraries, and .eppla is for files WITH libraries.',
          nameToken.line, nameToken.column,
          'Rename this file to "' + fname2.replace(/\.eppl$/i, '.eppla') + '" to use libraries.');
      }
    }
    this.loadedLibraries[canonical] = true;
    return EPP.AST.Library(canonical, kw);
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
      var quotedConnector = 'in a definition, for example: define \'' + quotedName + '\' as ...';
      if (!this.matchWord('as') && !this.matchWord('be') && !this.matchWord('to')) {
        var connector = this.current();
        throw new ParseError('Expected the word "as" after ' + quotedName + ' but found ' + this.describe(connector) + '.',
          connector.line, connector.column, quotedConnector);
      }
      // Check for "drawing sprite" (Draw library)
      if (this.isWord('drawing')) {
        if (EPP.Libraries && !EPP.Libraries.isAvailable('Draw')) {
          throw new LibraryError('The "Draw" library is not included in this build of E++.',
            kw.line, kw.column, EPP.Libraries.whyUnavailable('Draw'));
        }
        if (!this.loadedLibraries.Draw) {
          throw new LibraryError('Drawing sprites require the Draw library.', kw.line, kw.column,
            'Add the library first: add the "Draw" library');
        }
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

    // set the image of the actor 'hero' to "<source>"
    if (this.isWord('the') && this.isWord('image', this.peek(1))) {
      return this.parseActorImage(kw);
    }

    // Release 1.2: settings that belong to the Game library.
    if (this.isWord('the') && this.isWord('game', this.peek(1))) {
      this.requireLibrary('set the game window', kw);
      this.advance(); // the
      this.advance(); // game
      if (this.matchWord('window')) {
        this.expectWord('to', 'in "set the game window to 640 by 480".');
        var width = this.parseExpression();
        this.expectWord('by', 'between the width and the height, for example: set the game window to 640 by 480.');
        var height = this.parseExpression();
        return EPP.AST.GameWindow(width, height, kw);
      }
      if (this.matchWord('background')) {
        this.expectWord('to', 'in "set the game background to \"night\"".');
        return EPP.AST.GameBackground(this.parseExpression(), kw);
      }
      var badGame = this.current();
      throw new ParseError('Expected "window" or "background" after "set the game" but found ' + this.describe(badGame) + '.',
        badGame.line, badGame.column,
        'Write it like this: set the game window to 640 by 480 — or: set the game background to "night".');
    }

    // set the size of the actor 'hero' to 2
    if (this.isWord('the') && this.isWord('size', this.peek(1))) {
      this.requireLibrary('set the size of the actor', kw);
      this.advance(); // the
      this.advance(); // size
      this.expectWord('of', 'in "set the size of the actor \'hero\' to 2".');
      this.matchWord('the');
      if (!this.matchWord('actor')) {
        var badSize = this.current();
        throw new ParseError('Expected the word "actor" after "the size of" but found ' + this.describe(badSize) + '.',
          badSize.line, badSize.column,
          'Write it like this: set the size of the actor \'hero\' to 2');
      }
      var sizeName = this.current();
      if (sizeName.type !== 'VARIABLE') {
        throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(sizeName) + '.',
          sizeName.line, sizeName.column,
          'Write it like this: set the size of the actor \'hero\' to 2');
      }
      this.advance();
      this.expectWord('to', 'before the size, for example: set the size of the actor \'hero\' to 2.');
      return EPP.AST.ActorSize(sizeName.value, this.parseExpression(), kw);
    }

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
    // Release 1.2: show the actor 'hero' / hide the actor 'hero' (Game library)
    if (this.isWord('the') && this.isWord('actor', this.peek(1)) && this.peek(2) &&
        this.peek(2).type === 'VARIABLE') {
      var action = kw.value.toLowerCase();
      if (action === 'show' || action === 'hide') {
        this.requireLibrary(action + ' the actor', kw);
        this.advance(); // the
        this.advance(); // actor
        var actorName = this.advance().value;
        return EPP.AST.ActorAction(actorName, action, kw);
      }
    }

    // Dev Build 5: display image '<name>' — Image library
    if (this.isWord('image') && this.peek(1) && this.peek(1).type === 'VARIABLE') {
      this.requireLibrary('display image', kw);
      this.advance(); // image
      var imgName = this.advance().value; // 'name'
      return EPP.AST.DisplayImage(imgName, kw);
    }
    var parts = [this.parseExpression()];
    while (this.current() && this.current().type === 'COMMA') {
      this.advance(); // ,
      parts.push(this.parseExpression());
    }
    return EPP.AST.Say(parts[0], kw, parts.length > 1 ? parts : null);
  };

  Parser.prototype.parseAsk = function () {
    var kw = this.advance(); // ask
    var prompt = this.parseExpression();
    // and save answer as <name>   (a few words may be omitted, kept forgiving)
    this.expectWord('and', 'in an ask statement, for example: ask "Your name?" and save answer as name.');
    this.matchWord('save');
    // `save the output as`, `save it as`, `save answer as` and `save as` all
    // mean the same thing; read past the filler words to the name.
    while (!this.isWord('as') &&
           (this.isWord('the') || this.isWord('output') || this.isWord('answer') ||
            this.isWord('result') || this.isWord('it'))) {
      this.advance();
    }
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

  /**
   * Release 1.2 — wait, grown up.
   *
   *   wait 2 seconds                          classic wait
   *   wait 2 seconds as 'intro'               named wait           [ImprovedWaitLite]
   *   wait 2 seconds and then say "Done!"     wait, then do this   [ImprovedWaitLite]
   *   wait until 'score' is greater than 10   wait for a condition [ImprovedWaitLite]
   *   wait at most 5 seconds until 'ready' is true                    [ImprovedWaitLite]
   *   wait for the actor 'hero' to finish     wait for an actor    [ImprovedWait]
   *   wait at most 5 seconds for the actor 'hero' to finish           [ImprovedWait]
   *   wait for a key press                    keyboard             [Keyboard]
   */
  Parser.prototype.parseWait = function () {
    var kw = this.advance(); // wait

    // wait for a key press  [Keyboard]
    if (this.isWord('for') && this.isWord('a', this.peek(1)) && this.isWord('key', this.peek(2))) {
      this.requireLibrary('wait for a key press', kw);
      this.advance(); // for
      this.advance(); // a
      this.advance(); // key
      this.expectWord('press', 'in "wait for a key press".');
      return EPP.AST.WaitForKey(kw);
    }

    // wait for the actor 'hero' to finish  [ImprovedWait]
    if (this.isWord('for') && this.isWord('the', this.peek(1)) && this.isWord('actor', this.peek(2))) {
      this.requireLibrary('wait for the actor', kw);
      this.advance(); // for
      this.advance(); // the
      this.advance(); // actor
      var actorToken = this.current();
      if (actorToken.type !== 'VARIABLE') {
        throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(actorToken) + '.',
          actorToken.line, actorToken.column,
          'Write it like this: wait for the actor \'hero\' to finish');
      }
      this.advance();
      this.expectWord('to', 'in "wait for the actor \'hero\' to finish".');
      this.expectWord('finish', 'in "wait for the actor \'hero\' to finish".');
      var limitForActor = null;
      if (this.matchWord('in') || this.matchWord('within')) {
        limitForActor = this.parseExpression();
        this.matchWord('seconds'); this.matchWord('second');
      }
      return EPP.AST.WaitForActor(actorToken.value, limitForActor, kw);
    }

    // wait until <condition>  /  wait at most N seconds until <condition>
    if (this.isWord('until')) {
      this.requireLibrary('wait until', kw);
      this.advance(); // until
      return EPP.AST.WaitUntil(this.parseCondition(), null, false, kw);
    }
    if (this.isWord('at') && this.isWord('most', this.peek(1))) {
      this.requireLibrary('wait at most', kw);
      this.advance(); // at
      this.advance(); // most
      var limit = this.parseExpression();
      this.matchWord('seconds'); this.matchWord('second');
      if (this.matchWord('until')) {
        return EPP.AST.WaitUntil(this.parseCondition(), limit, true, kw);
      }
      if (this.isWord('for') && this.isWord('the', this.peek(1)) && this.isWord('actor', this.peek(2))) {
        this.requireLibrary('wait for the actor', kw);
        this.advance(); this.advance(); this.advance(); // for the actor
        var atMostActor = this.current();
        if (atMostActor.type !== 'VARIABLE') {
          throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(atMostActor) + '.',
            atMostActor.line, atMostActor.column,
            'Write it like this: wait at most 5 seconds for the actor \'hero\' to finish');
        }
        this.advance();
        this.expectWord('to', 'in "wait at most 5 seconds for the actor \'hero\' to finish".');
        this.expectWord('finish', 'in "wait at most 5 seconds for the actor \'hero\' to finish".');
        return EPP.AST.WaitForActor(atMostActor.value, limit, kw);
      }
      // wait at most N seconds — a plain wait with a ceiling is just a wait.
      return EPP.AST.Wait(limit, kw);
    }

    var duration = this.parseExpression();
    this.matchWord('seconds'); this.matchWord('second');

    // wait 2 seconds as 'intro'  [ImprovedWaitLite]
    if (this.isWord('as') && this.peek(1) && this.peek(1).type === 'VARIABLE') {
      this.requireLibrary('named wait', kw);
      this.advance(); // as
      var timerName = this.advance().value;
      return EPP.AST.WaitNamed(duration, timerName, kw);
    }

    // wait 2 seconds and then say "Done!"  [ImprovedWaitLite]
    if (this.isWord('and') && this.isWord('then', this.peek(1))) {
      this.requireLibrary('wait and then', kw);
      this.advance(); // and
      this.advance(); // then
      if (this.isSeparator(this.current()) || this.atEnd()) {
        var badThen = this.current();
        throw new ParseError('"and then" needs an action after it, but the line ended.',
          badThen.line, badThen.column,
          'Write it like this: wait 2 seconds and then say "Done!"');
      }
      return EPP.AST.WaitThen(duration, this.parseStatement(), null, kw);
    }

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


  // ------------------------------------------------------------------
  // Release 1.2 — Game library statements
  // ------------------------------------------------------------------

  /** create the actor 'hero' with the image "<source>" */
  Parser.prototype.parseCreateActor = function () {
    var kw = this.advance(); // create
    this.requireLibrary('create the actor', kw);
    this.matchWord('the');
    if (!this.matchWord('actor')) {
      var bad = this.current();
      throw new ParseError('Expected the word "actor" after "create" but found ' + this.describe(bad) + '.',
        bad.line, bad.column,
        'Write it like this: create the actor \'hero\' with the image "hero.png" — the Image button in the toolbar writes this line for you.');
    }
    var nameToken = this.current();
    if (nameToken.type !== 'VARIABLE') {
      throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(nameToken) + '.',
        nameToken.line, nameToken.column,
        'Write it like this: create the actor \'hero\' with the image "hero.png"');
    }
    this.advance();
    // The picture can come from the project's picture book instead:
    //   link the image "hero.png" to the actor 'hero'
    //   create the actor 'hero'
    // so `create` on its own means "use the picture this name is linked to".
    if (!this.isWord('with')) {
      return EPP.AST.DefineActor(nameToken.value, null, kw);
    }
    this.advance(); // with
    this.matchWord('the');
    if (!this.matchWord('image')) {
      var badImage = this.current();
      throw new ParseError('Expected the word "image" after "with" but found ' + this.describe(badImage) + '.',
        badImage.line, badImage.column,
        'Write it like this: create the actor \'hero\' with the image "hero.png"');
    }
    var source = this.parseExpression();
    return EPP.AST.DefineActor(nameToken.value, source, kw);
  };

  /**
   * set the image of the actor 'hero' to "<source>"
   * link the image "<source>" to the actor 'hero'   (or: to the name 'hero')
   *
   * Both bind a picture to a name. `link` is the one to reach for: it makes
   * the name mean that picture from then on, so `create the actor 'hero'`
   * never needs to repeat the image.
   */
  Parser.prototype.parseActorImage = function (alreadyRead) {
    var kw = alreadyRead || this.advance(); // set / link

    if (kw.value.toLowerCase() === 'link') {
      this.requireLibrary('link the image', kw);
      this.matchWord('the');
      if (!this.matchWord('image')) {
        var badImage = this.current();
        throw new ParseError('Expected the word "image" after "link" but found ' + this.describe(badImage) + '.',
          badImage.line, badImage.column,
          'Write it like this: link the image "hero.png" to the actor \'hero\'');
      }
      var linkSource = this.parseExpression();
      this.expectWord('to', 'in "link the image \"hero.png\" to the actor \'hero\'".');
      this.matchWord('the');
      if (!this.matchWord('actor') && !this.matchWord('name')) {
        var badTarget = this.current();
        throw new ParseError('Expected "actor" or "name" after "to" but found ' + this.describe(badTarget) + '.',
          badTarget.line, badTarget.column,
          'Write it like this: link the image "hero.png" to the actor \'hero\'');
      }
      var linkName = this.current();
      if (linkName.type !== 'VARIABLE') {
        throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(linkName) + '.',
          linkName.line, linkName.column,
          'Write it like this: link the image "hero.png" to the actor \'hero\'');
      }
      this.advance();
      return EPP.AST.LinkImage(linkName.value, linkSource, kw);
    }

    // set the image of the actor 'hero' to "<source>"
    if (!this.matchWord('the')) {
      var badThe = this.current();
      throw new ParseError('Expected "the" after "set" but found ' + this.describe(badThe) + '.',
        badThe.line, badThe.column,
        'Write it like this: set the image of the actor \'hero\' to "hero.png"');
    }
    if (!this.matchWord('image')) {
      var badSetImage = this.current();
      throw new ParseError('Expected "image" after "set the" but found ' + this.describe(badSetImage) + '.',
        badSetImage.line, badSetImage.column,
        'Write it like this: set the image of the actor \'hero\' to "hero.png"');
    }
    this.expectWord('of', 'in "set the image of the actor \'hero\' to ...".');
    this.matchWord('the');
    if (!this.matchWord('actor') && !this.matchWord('name')) {
      var badActor = this.current();
      throw new ParseError('Expected "actor" after "the image of" but found ' + this.describe(badActor) + '.',
        badActor.line, badActor.column,
        'Write it like this: set the image of the actor \'hero\' to "hero.png"');
    }
    var actorToken = this.current();
    if (actorToken.type !== 'VARIABLE') {
      throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(actorToken) + '.',
        actorToken.line, actorToken.column,
        'Write it like this: set the image of the actor \'hero\' to "hero.png"');
    }
    this.advance();
    this.expectWord('to', 'before the picture, for example: set the image of the actor \'hero\' to "hero.png".');
    this.requireLibrary('set the image of the actor', kw);
    var newSource = this.parseExpression();
    return EPP.AST.SetActorImage(actorToken.value, newSource, kw);
  };

  /** put the actor 'hero' at 100 and 200 */
  Parser.prototype.parsePlaceActor = function () {
    var kw = this.advance(); // put
    this.requireLibrary('put the actor', kw);
    this.matchWord('the');
    if (!this.matchWord('actor')) {
      var bad = this.current();
      throw new ParseError('Expected the word "actor" after "put" but found ' + this.describe(bad) + '.',
        bad.line, bad.column,
        'Write it like this: put the actor \'hero\' at 100 and 200');
    }
    var nameToken = this.current();
    if (nameToken.type !== 'VARIABLE') {
      throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(nameToken) + '.',
        nameToken.line, nameToken.column, 'Write it like this: put the actor \'hero\' at 100 and 200');
    }
    this.advance();
    this.expectWord('at', 'after the actor name, for example: put the actor \'hero\' at 100 and 200.');
    var x = this.parseExpression();
    this.expectWord('and', 'between the two numbers of the position.');
    var y = this.parseExpression();
    return EPP.AST.PlaceActor(nameToken.value, x, y, kw);
  };

  /** play the game ... end the game */
  Parser.prototype.parsePlayGame = function () {
    var kw = this.advance(); // play
    this.requireLibrary('play the game', kw);
    this.matchWord('the');
    if (!this.matchWord('game')) {
      var bad = this.current();
      throw new ParseError('Expected the word "game" after "play" but found ' + this.describe(bad) + '.',
        bad.line, bad.column, 'Write it like this: play the game ... end the game');
    }
    var part = this.parseBranch(kw);
    if (part.block) {
      this.skipSeparators();
      if (!this.isWord('end')) {
        var t = this.current();
        throw new ParseError('This "play the game" block never ends.', t.line, t.column,
          'Close it with: end the game');
      }
      this.advance(); // end
      this.matchWord('the');
      this.matchWord('game');
    }
    return EPP.AST.GameLoop(part.body, kw);
  };

  /** stop  /  stop the game  /  stop the actor 'hero'  /  stop every actor */
  Parser.prototype.parseStop = function (t) {
    this.advance(); // stop
    if (this.isSeparator(this.current()) || this.atEnd()) return EPP.AST.Stop(t);

    if (this.isWord('the') && this.isWord('game', this.peek(1))) {
      this.requireLibrary('stop the game', t);
      this.advance(); this.advance();
      return EPP.AST.StopGame(t);
    }

    if (this.isWord('every') && this.isWord('actor', this.peek(1))) {
      this.requireLibrary('stop every actor', t);
      this.advance(); this.advance();
      return EPP.AST.ActorAction('*', 'stop', t);
    }

    if (this.isWord('actor') || this.isWord('the')) {
      this.requireLibrary('stop the actor', t);
      this.matchWord('the');
      if (!this.matchWord('actor')) {
        var badA = this.current();
        throw new ParseError('Expected the word "actor" after "stop the" but found ' + this.describe(badA) + '.',
          badA.line, badA.column,
          'Write it like this: stop the actor \'enemy\' — or just "stop" on its own to end a loop.');
      }
      var nameToken = this.current();
      if (nameToken.type !== 'VARIABLE') {
        throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(nameToken) + '.',
          nameToken.line, nameToken.column, 'Write it like this: stop the actor \'enemy\'');
      }
      this.advance();
      return EPP.AST.ActorAction(nameToken.value, 'stop', t);
    }

    // A plain "stop" followed by an unrelated word is still a loop break.
    return EPP.AST.Stop(t);
  };

  /** pause the actor 'hero'  /  resume the actor 'hero' */
  Parser.prototype.parseActorControl = function (action) {
    var kw = this.advance(); // pause / resume
    this.requireLibrary(action + ' the actor', kw);
    this.matchWord('the');
    this.matchWord('actor');
    var nameToken = this.current();
    if (nameToken.type !== 'VARIABLE') {
      throw new ParseError('An actor needs a name in single quotes, but found ' + this.describe(nameToken) + '.',
        nameToken.line, nameToken.column,
        'Write it like this: ' + action + ' the actor \'hero\'');
    }
    this.advance();
    return EPP.AST.ActorAction(nameToken.value, action, kw);
  };

  /** cancel the wait 'intro' */
  Parser.prototype.parseCancelWait = function () {
    var kw = this.advance(); // cancel
    this.requireLibrary('cancel the wait', kw);
    this.matchWord('the');
    if (!this.matchWord('wait')) {
      var bad = this.current();
      throw new ParseError('Expected the word "wait" after "cancel" but found ' + this.describe(bad) + '.',
        bad.line, bad.column, 'Write it like this: cancel the wait \'intro\'');
    }
    var nameToken = this.current();
    if (nameToken.type !== 'VARIABLE') {
      throw new ParseError('A named wait needs a name in single quotes, but found ' + this.describe(nameToken) + '.',
        nameToken.line, nameToken.column, 'Write it like this: cancel the wait \'intro\'');
    }
    this.advance();
    return EPP.AST.CancelWait(nameToken.value, kw);
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
    // A colon after the header (`repeat 3 times:` / `while ... do:` /
    // `if ... then:`) just opens the block; the block still ends with `end`.
    if (next && next.type === 'COLON') this.advance();
    next = this.current();
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
    // `if ... then:` is the block form people write in the Studio; the colon
    // is decorative and the block is still closed by `end if`.
    if (this.current() && this.current().type === 'COLON') this.advance();

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
        if (this.current() && this.current().type === 'COLON') this.advance();
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
      // `end` followed by another block word (repeat, while, game, ...)
      // belongs to an enclosing block — never swallow it as `end if`.
      if (after && after.type === 'WORD' && after.value.toLowerCase() !== 'if') {
        this.pos = savedPos;
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

    // Release 1.2 — Keyboard: the "Up arrow" key is pressed  [Keyboard]
    // The name can be written with quotes (`the "Up arrow" key is pressed`)
    // or without them (`the Up arrow key is pressed`), because both read like
    // the sentence people actually say out loud.
    if (this.isWord('the') && this.peek(1) && this.peek(1).type === 'STRING' &&
        this.isWord('key', this.peek(2))) {
      this.requireLibrary('key is pressed', t0);
      this.advance(); // the
      var keyToken = this.advance(); // "Up arrow"
      this.expectWord('key', 'in "the \\"Up arrow\\" key is pressed".');
      this.expectWord('is', 'in "the \\"Up arrow\\" key is pressed".');
      var keyNegated = this.matchWord('not');
      this.expectWord('pressed', 'in "the \\"Up arrow\\" key is pressed".');
      return EPP.AST.KeyPressed(keyToken.value, keyNegated, t0);
    }
    if (this.isWord('the') && this.peek(1) && this.peek(1).type === 'WORD') {
      var keyWords = [];
      var scan = 1;
      while (this.peek(scan) && this.peek(scan).type === 'WORD' && !this.isWord('key', this.peek(scan))) {
        keyWords.push(this.peek(scan).value);
        scan += 1;
      }
      if (keyWords.length &&
          this.isWord('key', this.peek(scan)) &&
          this.isWord('is', this.peek(scan + 1))) {
        var looseNegated = this.isWord('not', this.peek(scan + 2));
        var pressedAt = scan + (looseNegated ? 3 : 2);
        if (this.isWord('pressed', this.peek(pressedAt))) {
          this.requireLibrary('key is pressed', t0);
          for (var keyStep = 0; keyStep < pressedAt; keyStep += 1) this.advance();
          this.advance(); // pressed
          return EPP.AST.KeyPressed(keyWords.join(' '), looseNegated, t0);
        }
      }
    }
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

    // Release 1.2 — Game: if 'hero' is touching 'gem' then ...  [Game]
    if (this.isWord('touching') || this.isWord('touches')) {
      if (negated) {
        var badNeg = this.current();
        throw new ParseError('"is not touching" is written "is not touching" only in the other direction — E++ keeps it simple: use is touching and put the not in the branch.',
          badNeg.line, badNeg.column,
          'Write: if \'hero\' is touching \'gem\' then ... — and use otherwise for the other case.');
      }
      this.requireLibrary('is touching', t);
      this.advance(); // touching
      var other = this.parseExpression();
      return EPP.AST.Condition('touching', left, other, t);
    }

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
    // `the square root of 144` and `square root of 144` both read naturally.
    if (this.isWord('the') && this.isWord('square', this.peek(1)) && this.isWord('root', this.peek(2))) {
      this.advance();
      t = this.current();
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

      // Release 1.2 — Keyboard: the key pressed  [Keyboard]
      if (word === 'the' && this.isWord('key', this.peek(1)) && this.isWord('pressed', this.peek(2))) {
        this.requireLibrary('the key pressed', t);
        this.advance(); // the
        this.advance(); // key
        this.advance(); // pressed
        return EPP.AST.KeyPressed('*', false, t);
      }

      // `the length of "hello"` and `length of "hello"` are the same thing.
      if (word === 'the' && this.peek(1).type === 'WORD') {
        var articleWord = this.peek(1).value.toLowerCase();
        if (articleWord === 'uppercase' || articleWord === 'lowercase' || articleWord === 'length' ||
            articleWord === 'reverse' || articleWord === 'trim' || articleWord === 'trimmed' ||
            articleWord === 'first' || articleWord === 'last' ||
            articleWord === 'maximum' || articleWord === 'minimum' || articleWord === 'absolute' ||
            articleWord === 'value') {
          this.advance();
          t = this.current();
          word = t.value.toLowerCase();
        }
      }

      // `a random number between ...` reads as well as `random number between ...`.
      if ((word === 'a' || word === 'the') && this.isWord('random', this.peek(1))) {
        this.advance();
        t = this.current();
        word = t.value.toLowerCase();
      }

      if (word === 'true' || word === 'yes') { this.advance(); return EPP.AST.Literal(true, t); }
      if (word === 'false' || word === 'no') { this.advance(); return EPP.AST.Literal(false, t); }

      // Text library functions.
      if (word === 'uppercase' || word === 'lowercase' || word === 'length' ||
          word === 'reverse' || word === 'trim' || word === 'trimmed') {
        var textFunction = word === 'trimmed' ? 'trim' : word;
        this.requireLibrary(textFunction + ' of', t);
        this.advance();
        this.expectWord('of', 'in "' + word + ' of".');
        return EPP.AST.TextFunction(textFunction, this.parseUnary(), t);
      }

      // `first letter of` and `last letter of`.
      if (word === 'first' || word === 'last') {
        this.requireLibrary(word + ' letter of', t);
        this.advance();
        this.expectWord('letter', 'in "' + word + ' letter of".');
        this.expectWord('of', 'in "' + word + ' letter of".');
        return EPP.AST.TextFunction(word + ' letter', this.parseUnary(), t);
      }

      // Math library words: the maximum/minimum/absolute value of ...
      if (word === 'maximum' || word === 'minimum') {
        this.requireLibrary(word + ' of', t);
        this.advance();
        this.expectWord('of', 'in "the ' + word + ' of A and B".');
        var firstArg = this.parseAdditive();
        this.expectWord('and', 'between the two values, for example: the ' + word + ' of 3 and 9.');
        var secondArg = this.parseAdditive();
        return EPP.AST.MathFunction(word, [firstArg, secondArg], t);
      }

      if (word === 'absolute') {
        this.requireLibrary('absolute value of', t);
        this.advance();
        this.expectWord('value', 'in "the absolute value of a number".');
        this.expectWord('of', 'in "the absolute value of a number".');
        return EPP.AST.MathFunction('absolute value', [this.parseAdditive()], t);
      }

      // `the value of pi` and a bare `pi`.
      if (word === 'value') {
        this.requireLibrary('value of pi', t);
        this.advance();
        this.expectWord('of', 'in "the value of pi".');
        var constant = this.current();
        var constantName = constant && constant.type === 'WORD' ? constant.value.toLowerCase() : '';
        if (constantName !== 'pi' && constantName !== 'e') {
          throw new ParseError('Only pi and e have a fixed value here.', constant.line, constant.column,
            'Write: the value of pi');
        }
        this.advance();
        return EPP.AST.MathConstant(constantName, t);
      }

      if (word === 'pi') {
        this.requireLibrary('value of pi', t);
        this.advance();
        return EPP.AST.MathConstant('pi', t);
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

      // Reject unquoted values during parsing, including in inactive branches.
      var words = [];
      var first = t;
      while (this.current().type === 'WORD' && !RESERVED[this.current().value.toLowerCase()]) {
        words.push(this.advance().value);
      }
      var text = words.join(' '), plural = words.length > 1;
      throw new ParseError((plural ? 'The words "' + text + '" do' : 'The word "' + text + '" does') +
        ' not mean anything in E++ yet — text requires double quotes and variables must be written inside single quotes.',
        first.line, first.column,
        'Write "' + text + '" for text or use single quotes for a variable.');
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
