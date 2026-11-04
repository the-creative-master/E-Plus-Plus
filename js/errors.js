/*
 * E++ Release 1.4b1 - the error system.
 *
 * EVERY failure E++ reports is one of one hundred catalogued codes:
 *
 *   E001-E075   general errors      (syntax, values, variables, libraries,
 *                                    projects and the other code they own)
 *   W001-W005   warnings            the program still runs; each warning says
 *                                   exactly what E++ did and how to silence it
 *   Z001-Z005   E++.zip only        features that live in the full E++ Studio
 *                                   download and are not in the standalone zip
 *   F001-F015   fatal lexer errors  the lexer physically cannot continue, so
 *                                   no syntax check, parser or program ever runs
 *
 * A code always means the same thing in every engine (Studio, epp.py, the
 * native C++ engine and the standalone runtime), and `EPP.Errors.catalog()`
 * is the single place those meanings are written down.
 *
 *   new EppError('E050', 'The variable ...')   -- the normal way to raise
 *   EppError.warn('W003', ...)                 -- a Code.Warning, never thrown
 *
 * The English defaults (name, help, family) are resolved from the catalogue,
 * so a call site only has to pass the code and the human-readable reason.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  // ------------------------------------------------------------------
  // The catalogue: code -> [name, help, extra]
  // ------------------------------------------------------------------
  // `extra` only appears on a few codes and carries a fixed field the code
  // needs (a warning's behaviour, the engine a build error names, ...).
  var CATALOG = {
    // ======================= GENERAL ERRORS: E001-E075 =======================
    // --- Values, text and quotes (E001-E014) ---
    E001: ['Unquoted Text', 'Put text in double quotes, or use single quotes for a variable.'],
    E002: ['Bare Variable Name', 'Write the variable name inside single quotes, for example: let \'score\' be 0'],
    E003: ['Missing Value', 'Give the statement a value to use, for example: say "Hello"'],
    E004: ['Unfinished Value', 'Finish the value, for example: say 2 plus 3'],
    E005: ['Unterminated Double Quote', 'Close the string with a second double quote (") on the same line.'],
    E006: ['Unterminated Single Quote', 'Close the variable name with a second single quote (\') on the same line.'],
    E007: ['Empty Variable Name', 'Put a name between the single quotes, for example: \'score\''],
    E008: ['Empty Value', 'Give the statement something between the quotes, or remove the quotes.'],
    E009: ['Invalid Character In A Variable Name', 'Use letters, digits, spaces, underscores or hyphens inside the quotes.'],
    E010: ['Value Out Of Range', 'Use a smaller value, for example: repeat 10 times'],
    E011: ['Value Is Not A Number', 'Use a number, or a variable that holds a number.'],
    E012: ['Unsupported Escape Sequence', 'E++ understands \\n, \\t, \\", \\\\ and \\r inside double quotes.'],
    E013: ['Equation Inside Quotes', 'Remove the quotes so E++ can work out the maths: say 1 plus 1', { warning: 'keep' }],
    E014: ['Empty String', 'Write something between the quotes: say "Hello"'],

    // --- Statements (E015-E027) ---
    E015: ['Unknown Statement', 'Statements start with a word such as say, let, if, repeat, while, note or add library.'],
    E016: ['Empty Statement', 'Remove the leftover punctuation or put a statement on that line.'],
    E017: ['Unexpected Block Ending', 'Remove the leftover ending, or open the block it belongs to.'],
    E018: ['Unclosed Block', 'Close the block with its own ending, for example: end repeat'],
    E019: ['Mismatched Block Ending', 'An if closes with end if, a repeat with end repeat and a while with end while.'],
    E020: ['Missing Then', 'Write the decision like this: if 1 is 1 then say "Yes"'],
    E021: ['Invalid Otherwise Placement', 'Move otherwise to the line straight after its if.'],
    E022: ['Standalone Otherwise', 'Put otherwise immediately after the if it belongs to.'],
    E023: ['Missing Repeat Count', 'Write the loop like this: repeat 3 times'],
    E024: ['Invalid Repeat Count', 'Repeat needs a whole number from 0 to 100000, for example: repeat 3 times'],
    E025: ['Missing While Condition', 'Write the loop like this: while \'count\' is less than 4 do'],
    E026: ['Invalid Comparison', 'Compare with "equal to", "greater than", "less than" or the number tests.'],
    E027: ['Invalid Condition', 'Write a condition such as: if \'score\' is greater than 10 then'],

    // --- Variables (E028-E041) ---
    E028: ['Undefined Variable', 'Define the variable first, for example: let \'score\' be 0'],
    E029: ['Variable Already Defined', 'Pick another name, or change the existing variable with Set.'],
    E030: ['Invalid Variable Name', 'Write the name in single quotes, for example: let \'score\' be 0'],
    E031: ['Missing Assignment Value', 'Give the variable a value, for example: let \'score\' be 0'],
    E032: ['Not A Number', 'Use a number, or a variable that holds a number, in the maths.'],
    E033: ['Division By Zero (fraction)', 'A fraction cannot have zero underneath. Change the number after "divided by".'],
    E034: ['Square Root Of A Negative Number', 'Square roots need a number that is zero or more.'],
    E035: ['Invalid Fraction', 'A fraction cannot have zero underneath.'],
    E036: ['Variables Are Not Quoted', 'Variables use single quotes and text uses double quotes.'],
    E037: ['Change Needs A Number', 'Only numbers can go up or down: define \'score\' as 0 first.'],
    E038: ['Amount Must Be A Number', 'Write a number after "by", for example: Increase \'score\' by 1'], 
    E039: ['Ask Needs A Variable', 'Save the answer like this: ask "Name?" and save the output as \'name\''],
    E040: ['Missing Ask Question', 'Give the ask a question, for example: ask "Your name?" and save the output as \'name\''],
    E041: ['Variable Name Is Too Long', 'Keep variable names to 64 characters or fewer.'],

    // --- Libraries (E042-E051) ---
    E042: ['Library Not Added', 'Add the library before using what it unlocks, for example: add library "Math"'],
    E043: ['Unknown Library', 'Check the spelling, or look at the Libraries panel for the full list.'],
    E044: ['Library Name Not Quoted', 'Write the library name in double quotes, for example: add library "Math"'],
    E045: ['Invalid Library Statement', 'Write it like this: add library "Math"'],
    E046: ['Libraries Need An .eppla File', 'Rename the file so it ends in .eppla: a file that uses libraries is an .eppla file.'],
    E047: ['Python Library Not Added', 'Add this line above the Python code: add library "Python"'],
    E048: ['Python Code Is Not E++', 'To run Python, add the Python library and use: python code "..."'],
    E049: ['Python Code Block Never Ends', 'Close the Python block with its own closing quote.'],
    E050: ['Empty Python Code', 'Put the Python code between the quotes: python code "print(1)"'],
    E051: ['Library Already Added', 'Remove the repeated line; the library is already loaded.'],

    // --- Files (E052-E055) ---
    E052: ['File Needs A Name', 'Give the file a name such as hello.eppl or game.eppla.'],
    E053: ['File Already Exists', 'Pick a different name, or open the existing file.'],
    E054: ['File Not Found', 'Create the file first, or pick another one in the explorer.'],
    E055: ['Wrong File Extension', 'Files that use libraries are .eppla files; files without libraries are .eppl files.'],

    // --- Saved projects (E056-E059) ---
    E056: ['Not An E++ Project', 'Open a project file that E++ saved, or start a new .eppl file.'],
    E057: ['Damaged Project File', 'Download the project again to get a complete file.'],
    E058: ['Project Saved By Another Release', 'Open the project with the release that saved it, then save it again.'],
    E059: ['Key Does Not Open This Project', 'Import the project in the browser that saved it, or add its key.'],

    // --- Wrong syntax (E060-E065) ---
    E060: ['E++ Does Not Use This Punctuation', 'E++ uses words for maths: plus, minus, times, divided by.'],
    E061: ['Symbols Are Not Values', 'Names start with a letter or an underscore.'],
    E062: ['Unexpected Word', 'Check the sentence structure: E++ statements read like English sentences.'],
    E063: ['Unexpected End Of Line', 'Finish the statement, or continue it on the next line.'],
    E064: ['Unexpected End Of Program', 'Finish the idea: a value, a condition or a block ending is missing.'],
    E065: ['Unclosed Parenthesis', 'Add the closing ) where the maths ends.'],

    // --- Running (E066-E070) ---
    E066: ['Division By Zero (numbers)', 'Change the number after "divided by" so it is not zero.'],
    E067: ['The Program Ran Too Long', 'Check for a loop that never ends.'],
    E068: ['Endless Loop', 'Make sure the loop can finish, or add conditions that eventually stop it.'],
    E069: ['Stop Used Outside A Repeat', 'stop ends a repeat loop, so put it inside repeat ... end repeat.'],
    E070: ['Execution Stopped', 'Press Run again when you are ready.'],

    // --- Pictures, drawn sprites and the Game library (E071-E075) ---
    E071: ['Picture Is Empty', 'Link a picture file to the actor: link the image "hero.png" to the actor \'hero\''],
    E072: ['Value Is Not A Picture', 'Use a picture file such as "hero.png", or pick one with the Image button.'],
    E073: ['Unknown Actor', 'Create the actor first: create the actor \'hero\' with the image "hero.png"'],
    E074: ['Unknown Image', 'Define the image first: define \'cat\' as image "<picture>"'],
    E075: ['Sprite Not Defined', 'Define the sprite first: define \'pencil\' as drawing sprite'],

    // =========================== WARNINGS: W001-W005 ===========================
    W001: ['Text Looks Like An Equation', 'Remove the quotes if you wanted the maths: say 1 plus 1', { warning: 'keep' }],
    W002: ['Variable Name Looks Like Text', 'Use double quotes for text and single quotes for variables.', { warning: 'keep' }],
    W003: ['Library Added But Unused', 'Remove the library line, or use one of its features.', { warning: 'keep' }],
    W004: ['Continued On The Next Line', 'One statement per line keeps the structure clear.', { warning: 'keep' }],
    W005: ['Number Written As Text', 'Write the number without double quotes, for example: wait 2 seconds', { warning: 'keep' }],

    // ====================== E++.zip ONLY ERRORS: Z001-Z005 ======================
    // These are absent from E++.zip itself: the full Studio reports a real E
    // error there, and the zip reports the Z code with the same explanation.
    Z001: ['Colors Live In The Studio', 'Download the full E++ Studio to print in color. In E++.zip use a plain say statement.'], 
    Z002: ['Draw Is Not In E++.zip', 'Download the full E++ Studio to draw with sprites.'], 
    Z003: ['Game Is Not In E++.zip', 'Download the full E++ Studio to create games and actors.'], 
    Z004: ['ImprovedWait Is Not In E++.zip', 'In E++.zip use ImprovedWaitLite: add library "ImprovedWaitLite"'],
    Z005: ['JavaScript Runtime Is Not In E++.zip', 'Use the native engine or epp.py in E++.zip, or download the full Studio for the JavaScript runtime.'],

    // ==================== FATAL LEXER ERRORS: F001-F015 ====================
    F001: ['Lexer Received Invalid Input', 'Pass the program as text (a string) to the lexer.'],
    F002: ['The Program Is Too Large To Lex', 'Split the program into smaller files.'],
    F003: ['Unrecognised Character', 'E++ uses words for maths. Remove or replace this character.'],
    F004: ['Unterminated String', 'Close the string, for example: say "Hello".'],
    F005: ['Unterminated Variable Name', 'Close it, for example: say \'name\'.'],
    F006: ['Empty Variable Reference', 'Put a variable name between the single quotes.'],
    F007: ['Unterminated Note', 'Notes need square brackets: note [Your note]'],
    F008: ['Note Without Brackets', 'Write notes like this: note [Your note]'],
    F009: ['Line Contains A Null Character', 'Remove the invisible NUL character (it usually arrives from a binary file).'],
    F010: ['Unrecognised Number', 'Write numbers as digits, for example 42 or 3.5.'],
    F011: ['Comment Characters Are Not E++', 'E++ notes do not use // or #. Use: note [Your note]'],
    F012: ['Word Is Too Long', 'Keep words to 256 characters or fewer.'],
    F013: ['Unexpected End Of Input Inside A Value', 'Finish the value before the line or the program ends.'],
    F014: ['Invalid Escape Sequence', 'E++ understands \\n, \\t, \\", \\\\ and \\r inside double quotes.'],
    F015: ['Lexer Could Not Build The Token Stream', 'This is a bug in E++: report it with the program that caused it.']
  };

  // The five families, in code order.
  var FAMILIES = [
    { key: 'general', section: 'E', codes: range('E', 1, 75),
      title: 'General errors',
      description: 'Problems with the program itself. E++ stops and shows the line.' },
    { key: 'warning', section: 'W', codes: range('W', 1, 5),
      title: 'Warnings',
      description: 'E++ noticed something odd but the program still runs.' },
    { key: 'distribution', section: 'Z', codes: range('Z', 1, 5),
      title: 'E++.zip only',
      description: 'Features that live in the full E++ Studio download, not in E++.zip.' },
    { key: 'fatal', section: 'F', codes: range('F', 1, 15),
      title: 'Fatal lexer errors',
      description: 'The lexer cannot continue, so the program never runs.' }
  ];

  function range(section, first, last) {
    var codes = [];
    for (var n = first; n <= last; n++) {
      codes.push(section + ('00' + n).slice(-3));
    }
    return codes;
  }

  function entry(code) {
    if (!Object.prototype.hasOwnProperty.call(CATALOG, code)) return null;
    return CATALOG[code];
  }

  function familyOf(code) {
    if (typeof code !== 'string' || !code) return null;
    for (var i = 0; i < FAMILIES.length; i++) {
      if (code.charAt(0) === FAMILIES[i].section) return FAMILIES[i].key;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Codes
  // ------------------------------------------------------------------
  function Code(code) {
    var known = entry(code);
    this.code = known ? code : 'E015';
    this.known = !!known;
    this.name = known ? known[0] : (CATALOG.E015[0] + ' (unknown code ' + code + ')');
    this.help = known ? known[1] : CATALOG.E015[1];
    this.family = familyOf(this.code);
    this.section = this.code.charAt(0);
    this.number = parseInt(this.code.slice(1), 10);
    this.warning = !!(known && known[2] && known[2].warning);
  }
  Code.prototype.isWarning = function () { return this.warning; };
  Code.prototype.isFatal = function () { return this.section === 'F'; };
  Code.prototype.isDistribution = function () { return this.section === 'Z'; };
  Code.prototype.describe = function () { return this.code + ' ' + this.name; };
  Code.prototype.toString = function () { return this.code; };

  Code.lookup = function (code) { return new Code(code); };
  Code.exists = function (code) { return !!entry(code); };
  Code.catalog = function () {
    return FAMILIES.map(function (family) {
      return {
        key: family.key, section: family.section, title: family.title,
        description: family.description,
        codes: family.codes.map(function (code) {
          var known = entry(code);
          return { code: code, name: known[0], help: known[1], warning: !!(known[2] && known[2].warning) };
        })
      };
    });
  };
  Code.families = function () {
    return FAMILIES.map(function (family) {
      return { key: family.key, section: family.section, title: family.title,
        description: family.description, count: family.codes.length };
    });
  };

  // ------------------------------------------------------------------
  // The error object every engine throws
  // ------------------------------------------------------------------
  function EppError(code, message, line, column, hint, extra) {
    if (!(this instanceof EppError)) return new EppError(code, message, line, column, hint, extra);
    var known = new Code(code);
    extra = extra || {};

    this.name = 'EppError';
    this.code = known.code;
    this.category = extra.category || known.name;
    this.title = known.name;
    this.family = known.family;
    this.section = known.section;
    this.isWarning = known.warning;
    this.message = message || known.name;
    this.line = typeof line === 'number' ? line : null;
    this.column = typeof column === 'number' ? column : (typeof extra.column === 'number' ? extra.column : null);
    this.col = this.column;
    this.hint = hint || known.help;
    this.help = this.hint;
    this.filename = extra.filename || null;
    this.reason = this.message;
    this.sourceLine = extra.sourceLine || '';
    if (extra.details && typeof extra.details === 'object') {
      for (var key in extra.details) {
        if (Object.prototype.hasOwnProperty.call(extra.details, key)) this[key] = extra.details[key];
      }
    }
    if (Error.captureStackTrace) Error.captureStackTrace(this, EppError);
  }
  EppError.prototype = Object.create(Error.prototype);
  EppError.prototype.constructor = EppError;

  EppError.prototype.location = function () {
    if (this.line === null) return this.filename || '';
    return (this.filename ? this.filename + ':' : '') + this.line +
      (this.column !== null ? ':' + this.column : '');
  };

  /** The long English description: what happened and how to fix it. */
  EppError.prototype.format = function () {
    var where = '';
    if (this.line !== null) {
      where = ' (line ' + this.line + (this.column !== null ? ', column ' + this.column : '') + ')';
    }
    var text = this.category + where + ': ' + this.message;
    if (this.hint) text += '\nHint: ' + this.hint;
    return text;
  };
  EppError.prototype.toString = function () { return this.format(); };

  /** One line, for the console and the command line. */
  EppError.prototype.headline = function () {
    return '[' + this.section + ' error ' + this.code + '] ' + this.category +
      (this.line !== null ? ' (line ' + this.line + (this.column !== null ? ', column ' + this.column : '') + ')' : '') +
      ': ' + this.message;
  };

  /** The warning shape the Studio renders: never thrown, always shown. */
  EppError.prototype.warningRecord = function () {
    return {
      code: this.code, name: this.category, family: 'warning',
      filename: this.filename || '<program>', line: this.line, col: this.column,
      sourceLine: this.sourceLine, reason: this.message, help: this.hint
    };
  };
  EppError.warningRecord = function (code, message, line, column, hint, filename, sourceLine) {
    return warning(code, message, line, column, hint, filename, sourceLine).warningRecord();
  };

  // ------------------------------------------------------------------
  // Raising: one helper per family, each fixing the category
  // ------------------------------------------------------------------
  function error(code, message, line, column, hint, extra) {
    extra = extra || {};
    var known = new Code(code);
    if (!extra.category) extra.category = known.name;
    var made = new EppError(code, message, line, column, hint, extra);
    made.name = known.name;
    if (!known.known) {
      // A code outside the catalogue is a bug in the engine, and saying so is
      // better than quietly reporting it under E015's name.
      made.message = (message || known.name) + ' (raised with ' + code + ', which is not a 1.4b1 code)';
      made.reason = made.message;
    }
    return made;
  }
  function warning(code, message, line, column, hint, filename, sourceLine) {
    var known = new Code(code);
    var made = new EppError(code, message, line, column, hint, {
      category: 'Warning: ' + known.name,
      filename: filename || null,
      sourceLine: sourceLine || ''
    });
    made.name = 'Warning';
    return made;
  }
  function fatal(code, message, line, column, hint, extra) {
    extra = extra || {};
    var known = new Code(code);
    if (!extra.category) extra.category = 'Fatal Lexer Error: ' + known.name;
    var made = new EppError(code, message, line, column, hint, extra);
    made.name = 'Fatal Lexer Error';
    return made;
  }
  function distribution(code, message, line, column, hint, extra) {
    extra = extra || {};
    var known = new Code(code);
    if (!extra.category) extra.category = known.name;
    var made = new EppError(code, message, line, column, hint, extra);
    made.name = known.name;
    return made;
  }

  /**
   * Accepts either the modern form error('E005', msg, line, col, hint) or the
   * legacy subclass form new ParseError(msg, line, col, hint, 'E005'). The
   * legacy subclasses below only exist so older code keeps working; every one
   * of them still has to name a catalogue code.
   */
  function fromSubclass(fallbackCode, args) {
    var message = args[0], line = args[1], column = args[2], hint = args[3];
    var code = typeof args[4] === 'string' ? args[4] : fallbackCode;
    return error(code, message, line, column, hint);
  }

  function makeSubclass(name, fallbackCode) {
    function Sub(message, line, column, hint, code) {
      var made = fromSubclass(fallbackCode, arguments);
      for (var key in made) {
        if (Object.prototype.hasOwnProperty.call(made, key)) this[key] = made[key];
      }
      this.name = name;
      if (Error.captureStackTrace) Error.captureStackTrace(this, Sub);
    }
    Sub.prototype = Object.create(EppError.prototype);
    Sub.prototype.constructor = Sub;
    return Sub;
  }

  var LexError = makeSubclass('Fatal Lexer Error', 'F003');
  var ParseError = makeSubclass('Syntax Error', 'E015');
  var RuntimeError = makeSubclass('Runtime Error', 'E011');
  var LibraryError = makeSubclass('Library Error', 'E042');
  var FileError = makeSubclass('File Error', 'E052');
  var VaultError = makeSubclass('Project Error', 'E056');
  var BuildError = makeSubclass('Not In This Build', 'Z001');

  // ------------------------------------------------------------------
  // Reporting
  // ------------------------------------------------------------------
  function isWarning(thing) {
    return !!(thing && (thing.isWarning === true || thing.family === 'warning'));
  }

  /** Warnings ride along with a run without stopping it. */
  function Reporter() {
    this.warnings = [];
  }
  Reporter.prototype.warn = function (code, message, line, column, hint, filename, sourceLine) {
    var made = warning(code, message, line, column, hint, filename, sourceLine);
    this.warnings.push(made);
    return made;
  };
  Reporter.prototype.record = function (record) {
    if (record) this.warnings.push(record);
    return record;
  };
  Reporter.prototype.take = function () {
    var collected = this.warnings;
    this.warnings = [];
    return collected;
  };
  Reporter.prototype.count = function () { return this.warnings.length; };

  /** `[E error E005] Unterminated Double Quote (line 3, column 7): ...` */
  function headline(thing) {
    if (!thing) return 'Unknown E++ error.';
    if (typeof thing.headline === 'function') return thing.headline();
    var code = thing.code || 'E015';
    var known = new Code(code);
    var line = typeof thing.line === 'number' ? thing.line : null;
    var col = typeof thing.col === 'number' ? thing.col : thing.column;
    var label = known.isWarning ? 'warning' : known.isFatal ? 'fatal' : known.isDistribution ? 'build' : 'error';
    return '[' + label + ' ' + known.code + '] ' + (thing.name || known.name) +
      (line !== null ? ' (line ' + line + (typeof col === 'number' ? ', column ' + col : '') + ')' : '') +
      ': ' + (thing.reason || thing.message || known.name);
  }

  EPP.EppError = EppError;
  EPP.Code = Code;
  EPP.LexError = LexError;
  EPP.ParseError = ParseError;
  EPP.RuntimeError = RuntimeError;
  EPP.LibraryError = LibraryError;
  EPP.FileError = FileError;
  EPP.VaultError = VaultError;
  EPP.BuildError = BuildError;
  EPP.Errors = {
    Code: Code,
    catalog: Code.catalog,
    families: Code.families,
    entry: function (code) {
      var known = entry(code);
      return known ? { code: code, name: known[0], help: known[1],
        warning: !!(known[2] && known[2].warning), family: familyOf(code) } : null;
    },
    exists: Code.exists,
    family: familyOf,
    name: function (code) { return new Code(code).name; },
    help: function (code) { return new Code(code).help; },
    isWarningCode: function (code) { return new Code(code).isWarning(); },
    isFatalCode: function (code) { return new Code(code).isFatal(); },
    isDistributionCode: function (code) { return new Code(code).isDistribution(); },
    error: error,
    warning: warning,
    fatal: fatal,
    distribution: distribution,
    reporter: function () { return new Reporter(); },
    isWarning: isWarning,
    headline: headline,
    total: Object.keys(CATALOG).length
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EppError: EppError, Code: Code, Errors: EPP.Errors, catalog: Code.catalog,
      LexError: LexError, ParseError: ParseError, RuntimeError: RuntimeError,
      LibraryError: LibraryError, FileError: FileError, VaultError: VaultError,
      BuildError: BuildError, error: error, warning: warning, fatal: fatal,
      distribution: distribution, headline: headline, isWarning: isWarning
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
