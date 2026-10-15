/*
 * E++ error system.
 * Every failure produced by the lexer, parser, runtime, library system or
 * .eppl file system is an EppError with a stable category, a human readable
 * message, an optional source position and an optional "how to fix it" hint.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  function EppError(category, message, line, column, hint) {
    this.name = 'EppError';
    this.category = category || 'Error';
    this.message = message || 'Unknown E++ error.';
    this.line = typeof line === 'number' ? line : null;
    this.column = typeof column === 'number' ? column : null;
    this.hint = hint || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, EppError);
  }
  EppError.prototype = Object.create(Error.prototype);
  EppError.prototype.constructor = EppError;
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

  function makeSubclass(name) {
    function Sub(message, line, column, hint) {
      EppError.call(this, name, message, line, column, hint);
      this.name = name;
    }
    Sub.prototype = Object.create(EppError.prototype);
    Sub.prototype.constructor = Sub;
    return Sub;
  }

  var LexError = makeSubclass('LexError');
  var ParseError = makeSubclass('ParseError');
  var RuntimeError = makeSubclass('RuntimeError');
  var LibraryError = makeSubclass('LibraryError');
  var FileError = makeSubclass('FileError');

  EPP.EppError = EppError;
  EPP.LexError = LexError;
  EPP.ParseError = ParseError;
  EPP.RuntimeError = RuntimeError;
  EPP.LibraryError = LibraryError;
  EPP.FileError = FileError;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EppError: EppError, LexError: LexError, ParseError: ParseError,
      RuntimeError: RuntimeError, LibraryError: LibraryError, FileError: FileError
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
