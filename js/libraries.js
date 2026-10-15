/*
 * E++ library system.
 *
 * `library "<Name>" add` loads a library and extends the grammar: features
 * owned by a library cannot be used until that library has been added.
 * The parser consults this registry while parsing, and the interpreter
 * consults it again while running, so programs must add a library before
 * using anything it unlocks.
 *
 * To add a new library: add an entry to REGISTRY describing what it unlocks,
 * teach the parser the new syntax, and teach the interpreter to run it.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var REGISTRY = {
    Math: {
      name: 'Math',
      aliases: ['math', 'maths', 'mathematics'],
      description: 'Advanced maths: fractions, decimals, percentages, square roots and powers.',
      unlocks: [
        { feature: 'divided by', kind: 'operator' },
        { feature: 'power of', kind: 'operator' },
        { feature: 'as fraction', kind: 'conversion' },
        { feature: 'as decimal', kind: 'conversion' },
        { feature: 'percent of', kind: 'operator' },
        { feature: 'square root of', kind: 'operator' }
      ],
      example: 'library "Math" add\ndisplay 1 divided by 2 as fraction.'
    },
    Text: {
      name: 'Text',
      aliases: ['text', 'strings', 'string'],
      description: 'Working with words: uppercase of, lowercase of and length of a value.',
      unlocks: [
        { feature: 'uppercase of', kind: 'function' },
        { feature: 'lowercase of', kind: 'function' },
        { feature: 'length of', kind: 'function' }
      ],
      example: 'library "Text" add\nsay uppercase of "hello".'
    },
    Random: {
      name: 'Random',
      aliases: ['random', 'chance'],
      description: 'Random numbers: random number between <low> and <high>.',
      unlocks: [
        { feature: 'random number between ... and ...', kind: 'function' }
      ],
      example: 'library "Random" add\nsay random number between 1 and 6.'
    },
    Python: {
      name: 'Python',
      // No short aliases on purpose: only library "Python" add unlocks
      // Python code. (Letter case does not matter, as with all libraries.)
      aliases: [],
      description: 'Run real Python code from E++: python code "..." for one line, or python code "-..." for a multi-line block.',
      unlocks: [
        { feature: 'python code', kind: 'statement' }
      ],
      example: 'library "Python" add\npython code "print(\'Hello from Python\')"'
    },
    Draw: {
      name: 'Draw',
      aliases: ['draw', 'drawing', 'sprites'],
      description: 'Drawing sprites you can move around: define \'hero\' as drawing sprite, then \'hero\' move up "10".',
      unlocks: [
        { feature: 'drawing sprite', kind: 'statement' },
        { feature: 'move up/down/left/right', kind: 'statement' }
      ],
      example: 'define \'hero\' as drawing sprite\n\'hero\' move right "40"\n\'hero\' move down "20"'
    }
  };

  function canonical(name) {
    if (!name) return null;
    var wanted = String(name).trim().toLowerCase();
    var keys = Object.keys(REGISTRY);
    for (var i = 0; i < keys.length; i++) {
      var lib = REGISTRY[keys[i]];
      if (lib.name.toLowerCase() === wanted || lib.aliases.indexOf(wanted) !== -1) return lib.name;
    }
    return null;
  }

  var Libraries = {
    registry: REGISTRY,

    canonical: canonical,

    get: function (name) {
      var c = canonical(name);
      return c ? REGISTRY[c] : null;
    },

    isKnown: function (name) { return canonical(name) !== null; },

    list: function () {
      return Object.keys(REGISTRY).map(function (key) { return REGISTRY[key]; });
    },

    names: function () { return Object.keys(REGISTRY); },

    /** Which library (canonical name) owns a grammar feature, if any. */
    ownerOf: function (feature) {
      var keys = Object.keys(REGISTRY);
      for (var i = 0; i < keys.length; i++) {
        var unlocks = REGISTRY[keys[i]].unlocks;
        for (var j = 0; j < unlocks.length; j++) {
          if (unlocks[j].feature === feature) return keys[i];
        }
      }
      return null;
    }
  };

  EPP.Libraries = Libraries;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Libraries: Libraries };
  }
})(typeof window !== 'undefined' ? window : globalThis);
