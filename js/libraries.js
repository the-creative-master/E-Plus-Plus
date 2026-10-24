/*
 * E++ library system.
 *
 * `add library "<Name>"` loads a library and extends the grammar: features
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
      description: 'Advanced maths: fractions, decimals, percentages, square roots and powers. Also unlocks number tests: is a positive/negative number, is in the range of A to B.',
      unlocks: [
        { feature: 'divided by', kind: 'operator' },
        { feature: 'power of', kind: 'operator' },
        { feature: 'as fraction', kind: 'conversion' },
        { feature: 'as decimal', kind: 'conversion' },
        { feature: 'percent of', kind: 'operator' },
        { feature: 'square root of', kind: 'operator' },
        { feature: 'is a positive number', kind: 'condition' },
        { feature: 'is a negative number', kind: 'condition' },
        { feature: 'is in the range of', kind: 'condition' }
      ],
      example: 'add library "Math"\ndisplay 1 divided by 2 as fraction.'
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
      example: 'add library "Text"\nsay uppercase of "hello".'
    },
    /*
     * The classic 1.1 libraries. They predate the registry, so their feature
     * lists here are documentation: the Studio checks that the library was
     * added, and the words themselves are handled by the interpreter.
     */
    Colors: {
      name: 'Colors',
      aliases: ['colors', 'colours', 'color', 'colour'],
      description: 'Coloured output in the console: say red "Stop!", say green "Go!".',
      unlocks: [
        { feature: 'colored say statement', kind: 'statement' }
      ],
      example: 'add the "Colors" library\nsay red "Stop!"'
    },
    Console: {
      name: 'Console',
      aliases: ['console', 'screen'],
      description: 'Console control: clear the console.',
      unlocks: [
        { feature: 'clear console', kind: 'statement' }
      ],
      example: 'add the "Console" library\nclear the console'
    },
    Time: {
      name: 'Time',
      aliases: ['time', 'clock'],
      description: 'Dates, times and plain pauses: the current date, the current time, wait 2 seconds.',
      unlocks: [
        { feature: 'the current date', kind: 'function' },
        { feature: 'the current time', kind: 'function' },
        { feature: 'the current year', kind: 'function' },
        { feature: 'the current timestamp', kind: 'function' },
        { feature: 'wait statement', kind: 'statement' }
      ],
      example: 'add the "Time" library\nsay the current date'
    },
    Files: {
      name: 'Files',
      aliases: ['files', 'file'],
      description: 'Read, write and append workspace files.',
      unlocks: [
        { feature: 'read file', kind: 'statement' },
        { feature: 'write file', kind: 'statement' },
        { feature: 'append file', kind: 'statement' }
      ],
      example: 'add the "Files" library\nwrite "hello" to file "log.txt"'
    },
    System: {
      name: 'System',
      aliases: ['system', 'os'],
      description: 'Where the program is running, and running a system command.',
      unlocks: [
        { feature: 'the platform', kind: 'function' },
        { feature: 'the os', kind: 'function' },
        { feature: 'run system command', kind: 'statement' }
      ],
      example: 'add the "System" library\nsay the platform'
    },

    Random: {
      name: 'Random',
      aliases: ['random', 'chance'],
      description: 'Random numbers: random number between <low> and <high>.',
      unlocks: [
        { feature: 'random number between ... and ...', kind: 'function' }
      ],
      example: 'add library "Random"\nsay random number between 1 and 6.'
    },
    Python: {
      name: 'Python',
      // No short aliases on purpose: only add library "Python" unlocks
      // Python code. (Letter case does not matter, as with all libraries.)
      aliases: [],
      description: 'Run real Python code from E++: python code "..." for one line, or python code ",...," for a multi-line block.',
      unlocks: [
        { feature: 'python code', kind: 'statement' }
      ],
      example: 'add library "Python"\npython code "print(\'Hello from Python\')"'
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
    },
    Image: {
      name: 'Image',
      aliases: ['image', 'images', 'picture', 'pictures', 'photo', 'photos'],
      description: 'Working with images: define an image from a Base64 string, check if an image exists, and display it.',
      unlocks: [
        { feature: 'define image', kind: 'statement' },
        { feature: 'display image', kind: 'statement' },
        { feature: 'check if exists', kind: 'statement' }
      ],
      example: 'add library "Image"\ndefine \'cat\' as image "<base64-string>"\ncheck if \'cat\' exists\ndisplay image \'cat\''
    },

    /*
     * Release 1.2 — the Game library. This is E++'s pygame zero: actors that
     * carry an image, a game window, per-frame movement and collisions.
     * It is intentionally NOT shipped inside E++.zip (porting a canvas to the
     * native CLI build is out of scope for 1.2), so a distribution that
     * leaves out js/game.js marks this library unavailable and the parser
     * says so in plain English instead of pretending.
     */
    Game: {
      name: 'Game',
      aliases: ['game', 'games', 'pygame'],
      description: 'The pygame zero of E++: a game window, actors that load an image, movement, collisions and a game loop.',
      unlocks: [
        { feature: 'set the game window', kind: 'statement' },
        { feature: 'set the game background', kind: 'statement' },
        { feature: 'create the actor', kind: 'statement' },
        { feature: 'put the actor', kind: 'statement' },
        { feature: 'show the actor', kind: 'statement' },
        { feature: 'hide the actor', kind: 'statement' },
        { feature: 'set the size of the actor', kind: 'statement' },
        { feature: 'is touching', kind: 'condition' },
        { feature: 'play the game', kind: 'statement' },
        { feature: 'stop the game', kind: 'statement' }
      ],
      example: 'add library "Game"\nset the game window to 640 by 480\ncreate the actor \'hero\' with the image "<image>"\nput the actor \'hero\' at 320 and 240\nplay the game\n  \'hero\' move right "2"\nend the game'
    },

    /*
     * Release 1.2 — Keyboard. `if the "Up arrow" key is pressed then ...`
     * Shipped inside E++.zip: it is tiny and needs no canvas.
     */
    Keyboard: {
      name: 'Keyboard',
      aliases: ['keyboard', 'keys', 'input'],
      description: 'Reads the arrow keys, space, enter and every letter: if the "Up arrow" key is pressed then ..., and wait for a key press.',
      unlocks: [
        { feature: 'key is pressed', kind: 'condition' },
        { feature: 'wait for a key press', kind: 'statement' },
        { feature: 'the key pressed', kind: 'expression' }
      ],
      example: 'add library "Keyboard"\nif the "Up arrow" key is pressed then say "Up!"\nwait for a key press'
    },

    /*
     * Release 1.2 — ImprovedWait. Everything ImprovedWaitLite has, plus the
     * game-side power: waiting for an actor, and stopping or pausing one
     * actor from somewhere else in the program. Not shipped in E++.zip.
     */
    ImprovedWait: {
      name: 'ImprovedWait',
      aliases: ['improvedwait', 'improved wait', 'wait'],
      description: 'Wait with names, conditions, deadlines and actors: wait 2 seconds as \'intro\', wait until ..., wait at most ..., stop the actor \'enemy\'.',
      unlocks: [
        { feature: 'wait for the actor', kind: 'statement' },
        { feature: 'pause the actor', kind: 'statement' },
        { feature: 'resume the actor', kind: 'statement' },
        { feature: 'stop the actor', kind: 'statement' },
        { feature: 'stop every actor', kind: 'statement' }
      ],
      example: 'add library "ImprovedWait"\nwait 2 seconds as \'intro\'\nwait until \'score\' is greater than 10\nwait at most 5 seconds for the actor \'enemy\' to finish'
    },

    /*
     * Release 1.2 — ImprovedWaitLite: every non-game feature of ImprovedWait,
     * small enough to ship inside E++.zip.
     */
    ImprovedWaitLite: {
      name: 'ImprovedWaitLite',
      aliases: ['improvedwaitlite', 'improved wait lite', 'wait lite'],
      description: 'The non-game half of ImprovedWait, shipped in E++.zip: named waits, wait until, wait at most, wait ... and then ...',
      unlocks: [
        { feature: 'wait and then', kind: 'statement' },
        { feature: 'named wait', kind: 'statement' },
        { feature: 'cancel the wait', kind: 'statement' },
        { feature: 'wait until', kind: 'statement' },
        { feature: 'wait at most', kind: 'statement' }
      ],
      example: 'add library "ImprovedWaitLite"\nwait 2 seconds and then say "Done!"\nwait 1 second as \'tick\'\nwait at most 5 seconds until \'ready\' is true'
    }
  };

  /*
   * Which libraries a build actually contains. The E++.zip build leaves the
   * Game and ImprovedWait runtimes out (see tools/build-zip.mjs), and marks
   * them here so `add library "Game"` explains itself instead of failing
   * with a confusing "no such library".
   */
  var UNAVAILABLE_REASONS = {
    Game: 'The Game library is not part of this build. It ships with the E++ Studio download, not inside E++.zip — open the Studio\'s index.html from the release page to build games.',
    ImprovedWait: 'The ImprovedWait library is not part of this build. ImprovedWaitLite ships inside E++.zip and has all of the non-game waiting features; add library "ImprovedWaitLite" instead.'
  };

  // Empty by default: a full build (Studio, test-suite) has every library.
  // The E++.zip build calls hideForDistribution() so the two big libraries
  // explain why they are missing instead of silently existing.
  var UNAVAILABLE = {};

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
    },

    /**
     * Every library that can unlock a grammar feature. ImprovedWait is a
     * superset of ImprovedWaitLite, so the shared waiting features are owned
     * by ImprovedWaitLite and usable when either library has been added.
     */
    ownersOf: function (feature) {
      var owners = [];
      var keys = Object.keys(REGISTRY);
      for (var i = 0; i < keys.length; i++) {
        var unlocks = REGISTRY[keys[i]].unlocks;
        for (var j = 0; j < unlocks.length; j++) {
          if (unlocks[j].feature === feature) owners.push(keys[i]);
        }
      }
      // ImprovedWait is a superset of ImprovedWaitLite, never the other way
      // round: adding ImprovedWait unlocks the lite features, but adding
      // ImprovedWaitLite must NOT unlock the actor features.
      if (owners.indexOf('ImprovedWaitLite') !== -1 && owners.indexOf('ImprovedWait') === -1) {
        owners.push('ImprovedWait');
      }
      return owners;
    },

    /** True when this build actually contains the library. */
    isAvailable: function (name) {
      var canonicalName = canonical(name);
      return !!canonicalName && !UNAVAILABLE[canonicalName];
    },

    /** The English explanation for a missing library, or null. */
    whyUnavailable: function (name) {
      var canonicalName = canonical(name);
      return canonicalName ? (UNAVAILABLE[canonicalName] || null) : null;
    },

    /** Used by the E++.zip build (and by tests) to hide a library. */
    setUnavailable: function (name, reason) {
      var canonicalName = canonical(name);
      if (!canonicalName) return;
      if (reason === null || reason === undefined) delete UNAVAILABLE[canonicalName];
      else UNAVAILABLE[canonicalName] = reason;
    },

    unavailable: function () { return Object.keys(UNAVAILABLE); },

    /** Hides the libraries that E++.zip does not ship, with their reasons. */
    hideForDistribution: function (names) {
      var chosen = names && names.length ? names : ['Game', 'ImprovedWait'];
      chosen.forEach(function (name) {
        var canonicalName = canonical(name);
        if (canonicalName) UNAVAILABLE[canonicalName] = UNAVAILABLE_REASONS[canonicalName] || 'This library is not part of this build.';
      });
    },

    /** Test/tooling helper: make every library available again. */
    showAll: function () { UNAVAILABLE = {}; }
  };

  EPP.Libraries = Libraries;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Libraries: Libraries };
  }
})(typeof window !== 'undefined' ? window : globalThis);
