/*
 * Browser adapter for src/lexer.cpp compiled to WebAssembly.
 * Studio still runs browser-only features in its JavaScript evaluator; the
 * tokens and lexical errors used by that evaluator come from the C++ lexer.
 */
(function (root) {
  'use strict';
  var build = root.EPP_NATIVE_LEXER_BUILD;
  if (!build && typeof module !== 'undefined' && module.exports) {
    build = require('./native-lexer-wasm.js');
  }
  var instance = null;
  var pending = null;
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();

  function runtimeError(reason) {
    return {
      code: 'E601', name: 'C++ Lexer Unavailable', filename: 'js/native-lexer-wasm.js',
      line: 1, col: 1, sourceLine: '', reason: reason,
      help: 'Keep js/native-lexer-wasm.js and js/native-lexer.js next to Studio, and use a browser with WebAssembly enabled.'
    };
  }

  function decodeBase64(text) {
    if (typeof atob === 'function') {
      var binary = atob(text);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
    throw new Error('This browser cannot decode the WebAssembly runtime.');
  }

  function ready() {
    if (instance) return Promise.resolve();
    if (pending) return pending;
    pending = (async function () {
      if (!build || !build.base64) throw runtimeError('The compiled C++ lexer is missing.');
      if (typeof WebAssembly === 'undefined') throw runtimeError('This browser does not support WebAssembly.');
      var memory = null;
      var wasi = {
        fd_close: function (fd) { return fd === 1 || fd === 2 ? 0 : 8; },
        fd_seek: function () { return 70; }, // ESPIPE: no seekable files are exposed.
        fd_write: function (fd, iovs, count, written) {
          if (!memory || (fd !== 1 && fd !== 2)) return 8;
          var view = new DataView(memory.buffer), total = 0;
          for (var i = 0; i < count; i++) total += view.getUint32(iovs + i * 8 + 4, true);
          view.setUint32(written, total, true);
          return 0;
        },
        random_get: function (address, length) {
          if (!memory || !root.crypto || !root.crypto.getRandomValues) return 29;
          var bytes = new Uint8Array(memory.buffer, address, length);
          for (var start = 0; start < length; start += 65536) {
            root.crypto.getRandomValues(bytes.subarray(start, Math.min(start + 65536, length)));
          }
          return 0;
        }
      };
      try {
        var loaded = await WebAssembly.instantiate(decodeBase64(build.base64), { wasi_snapshot_preview1: wasi });
        var exports = loaded.instance.exports;
        memory = exports.memory;
        exports._initialize();
        instance = exports;
      } catch (error) {
        if (error && error.code === 'E601') throw error;
        throw runtimeError('The compiled C++ lexer could not start: ' + (error && error.message || String(error)));
      }
    })().catch(function (error) { pending = null; throw error; });
    return pending;
  }

  function tokenize(source, filename) {
    if (!instance) throw runtimeError('The compiled C++ lexer has not finished loading.');
    source = String(source == null ? '' : source);
    var bytes = encoder.encode(source);
    var address = instance.epp_lexer_alloc(bytes.length + 1);
    if (!address) throw runtimeError('There is not enough memory to load this program into the C++ lexer.');
    var output;
    try {
      new Uint8Array(instance.memory.buffer, address, bytes.length).set(bytes);
      var resultAddress = instance.epp_lexer_tokenize(address, bytes.length);
      var heap = new Uint8Array(instance.memory.buffer);
      var end = heap.indexOf(0, resultAddress);
      if (!resultAddress || end < 0) throw new Error('The lexer returned an invalid result.');
      output = JSON.parse(decoder.decode(heap.subarray(resultAddress, end)));
    } catch (error) {
      throw runtimeError('The C++ lexer could not process this program: ' + (error && error.message || String(error)));
    } finally {
      instance.epp_lexer_free(address);
    }
    if (!output.ok) {
      var issue = output.error;
      var sourceLines = source.split('\n');
      throw {
        code: issue.code,
        name: issue.code === 'E202' ? 'Invalid Variable Name' : issue.code === 'E102' ? 'Quote Error' : 'Invalid Syntax',
        filename: filename || '<source>', line: issue.line, col: issue.column,
        sourceLine: sourceLines[issue.line - 1] || '', reason: issue.message,
        help: issue.code === 'E101' ? 'Use note [text] for notes and close every note.' :
          'Close quotes on the same line and give variables a name.'
      };
    }
    return output.tokens;
  }

  var api = { ready: ready, tokenize: tokenize, sourceSha256: build && build.sourceSha256 };
  root.EPP = root.EPP || {};
  root.EPP.NativeLexer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
