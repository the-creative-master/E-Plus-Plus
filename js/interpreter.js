/*
 * E++ Interpreter + Runtime.
 *
 * Executes an AST produced by the parser. It is fully asynchronous so that
 * `ask` (console input) and `wait` (real delays) work naturally in the IDE.
 *
 * I/O is injected, which keeps the runtime usable outside the browser:
 *   new EPP.Interpreter({
 *     output:    function (text) {},          // say / display
 *     input:     async function (prompt) {},  // ask -> returns typed text
 *     delay:     async function (seconds) {}, // wait (defaults to setTimeout)
 *   onLibrary: function (name) {},          // a library was loaded
 *     pythonExecutor: async function (code) {} // runs `python code` [Python]
 *   })
 *
 * Values: strings ("..."), numbers, booleans, and Fraction objects for
 * exact `as fraction` maths. Answers typed at an `ask` prompt are text, but
 * maths and comparisons automatically treat numeric text as a number, so
 * `if output is equal to 11` works with a typed answer.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});
  var RuntimeError = EPP.RuntimeError;
  var LibraryError = EPP.LibraryError;

  // ---------------- Fractions (exact rational numbers) ----------------
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var r = a % b; a = b; b = r; }
    return a || 1;
  }

  function Fraction(numerator, denominator) {
    denominator = denominator === undefined ? 1 : denominator;
    if (denominator === 0) throw new RuntimeError('A fraction cannot have zero underneath (division by zero).');
    if (denominator < 0) { numerator = -numerator; denominator = -denominator; }
    var d = gcd(numerator, denominator);
    this.numerator = numerator / d;
    this.denominator = denominator / d;
  }
  Fraction.prototype.toNumber = function () { return this.numerator / this.denominator; };
  Fraction.prototype.toString = function () {
    return this.denominator === 1 ? String(this.numerator) : this.numerator + '/' + this.denominator;
  };
  Fraction.prototype.add = function (o) {
    o = Fraction.from(o);
    return new Fraction(this.numerator * o.denominator + o.numerator * this.denominator, this.denominator * o.denominator);
  };
  Fraction.prototype.subtract = function (o) {
    o = Fraction.from(o);
    return new Fraction(this.numerator * o.denominator - o.numerator * this.denominator, this.denominator * o.denominator);
  };
  Fraction.prototype.multiply = function (o) {
    o = Fraction.from(o);
    return new Fraction(this.numerator * o.numerator, this.denominator * o.denominator);
  };
  Fraction.prototype.divide = function (o) {
    o = Fraction.from(o);
    if (o.numerator === 0) throw new RuntimeError('Division by zero is not possible.');
    return new Fraction(this.numerator * o.denominator, this.denominator * o.numerator);
  };
  Fraction.from = function (value) {
    if (value instanceof Fraction) return value;
    var n = typeof value === 'number' ? value : Number(value);
    if (!isFinite(n)) throw new RuntimeError('"' + value + '" is not a number.');
    if (Number.isInteger(n)) return new Fraction(n, 1);
    // Continued-fraction approximation (exact for values like 1/3 stored
    // as 0.3333333333333333 within floating point tolerance).
    var sign = n < 0 ? -1 : 1;
    var x = Math.abs(n);
    var bestNum = Math.round(x), bestDen = 1, bestErr = Math.abs(x - bestNum);
    var numPrev = 1, num = Math.floor(x), denPrev = 0, den = 1, rest = x;
    for (var i = 0; i < 64 && den <= 1000000; i++) {
      var err = Math.abs(x - num / den);
      if (err < bestErr) { bestNum = num; bestDen = den; bestErr = err; }
      if (err < 1e-12) break;
      rest = 1 / (rest - Math.floor(rest));
      var a = Math.floor(rest);
      var n2 = a * num + numPrev, d2 = a * den + denPrev;
      numPrev = num; num = n2; denPrev = den; den = d2;
    }
    return new Fraction(sign * bestNum, bestDen);
  };

  // ---------------- value helpers ----------------
  function isNumericLike(value) {
    if (value instanceof Fraction) return true;
    if (typeof value === 'number') return isFinite(value);
    if (typeof value === 'boolean') return false;
    if (typeof value === 'string') {
      var s = value.trim();
      return s !== '' && /^-?[0-9]*\.?[0-9]+$/.test(s);
    }
    return false;
  }

  function formatNumber(n) {
    if (!isFinite(n)) return String(n);
    if (Number.isInteger(n)) return String(n);
    return String(parseFloat(n.toPrecision(12)));
  }

  /**
   * Joins the comma-separated pieces of one `say` into a single line, using
   * the same spacing rule as the Studio engine: the pieces are joined as
   * written, and a space is added only where two words would otherwise run
   * together (or where a punctuation mark is followed by something).
   */
  function joinSayParts(pieces) {
    var out = '';
    for (var i = 0; i < pieces.length; i++) {
      var cur = String(pieces[i] === undefined || pieces[i] === null ? '' : pieces[i]);
      if (i > 0 && out.length > 0 && cur.length > 0) {
        var last = out.slice(-1), first = cur.slice(0, 1);
        if (/[a-zA-Z0-9]/.test(last) && /[a-zA-Z0-9]/.test(first)) out += ' ';
        else if (/[!?:,]/.test(last) && first !== ' ') out += ' ';
      }
      out += cur;
    }
    return out;
  }

  function stringify(value) {
    if (value instanceof Fraction) return value.toString();
    if (typeof value === 'number') return formatNumber(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function truthy(value) {
    if (value instanceof Fraction) return value.numerator !== 0;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      var s = value.trim().toLowerCase();
      return !(s === '' || s === 'false' || s === 'no' || s === '0');
    }
    return !!value;
  }

  // Internal control-flow signal for `stop` inside loops.
  function BreakSignal() { this.isBreakSignal = true; }

  /*
   * Turns a raw Python failure into ONE plain-English E++ message.
   * Python's own traceback text is never shown to the user: we work out
   * what kind of mistake it was and explain it in our own words, naming
   * the Python error type only as a helpful label. Returns
   * { type, friendly } — `type` is null when nothing Python-like was found
   * (for example, the runner itself failed to load, in which case the
   * caller keeps the host's own English message).
   */
  var PYTHON_ERROR_EXPLANATIONS = {
    NameError: 'Python tried to use a name that has not been created yet',
    UnboundLocalError: 'Python tried to use a name before anything was stored in it',
    SyntaxError: 'Python could not understand the code — something is spelled, ordered or punctuated in a way Python does not accept',
    IndentationError: 'Python is unhappy with the spaces at the start of a line — Python uses those spaces to group code together',
    TabError: 'Python found a mixture of tabs and spaces at the start of a line',
    TypeError: 'Python was given the wrong kind of thing — for example, trying to add words and numbers together',
    ValueError: 'Python was given a value it cannot use in that way',
    ZeroDivisionError: 'Python tried to divide by zero',
    IndexError: 'Python tried to pick an item from a list at a position that does not exist',
    KeyError: 'Python looked for a key that does not exist',
    AttributeError: 'Python tried to use something that the thing it was used on does not have',
    ModuleNotFoundError: 'Python could not find a library it was asked to import',
    ImportError: 'Python could not import something it was asked for',
    EOFError: 'Python asked for input, but no input was available',
    FileNotFoundError: 'Python looked for a file that does not exist',
    PermissionError: 'Python was not allowed to touch that file',
    RuntimeError: 'Python ran into a problem while the code was running',
    RecursionError: 'Python repeated something so many times that it gave up',
    MemoryError: 'Python ran out of memory',
    StopIteration: 'Python ran out of items to work through',
    KeyboardInterrupt: 'Python was interrupted'
  };

  function translatePythonError(error) {
    var raw = error && error.message ? String(error.message) : String(error || '');
    var type = null;
    var match;
    var pattern = /(^|\n)\s*([A-Za-z_][A-Za-z0-9_.]*?(?:Error|Exception|KeyboardInterrupt|StopIteration|GeneratorExit|SystemExit))\s*:/g;
    while ((match = pattern.exec(raw)) !== null) {
      var candidate = match[2].split('.').pop();
      type = candidate; // keep the last (deepest) Python error type
    }
    if (!type) return { type: null, friendly: null };
    var friendly = PYTHON_ERROR_EXPLANATIONS[type] ||
      'Python ran into a problem it could not fix by itself';
    return { type: type, friendly: friendly };
  }

  // ---------------- Release 1.2: keyboard, actors, waits ----------------

  /*
   * Every way of writing a key becomes one canonical name, so
   *   the "Up arrow" key, "up-arrow", "ARROW UP" and "UpArrow"
   * all mean the same physics key. The IDE maps these names to
   * KeyboardEvent.key values when it feeds the game loop.
   */
  var KEY_ALIASES = {
    'up arrow': 'ArrowUp', 'uparrow': 'ArrowUp', 'arrowup': 'ArrowUp', 'arrow up': 'ArrowUp', 'up': 'ArrowUp',
    'down arrow': 'ArrowDown', 'downarrow': 'ArrowDown', 'arrowdown': 'ArrowDown', 'arrow down': 'ArrowDown', 'down': 'ArrowDown',
    'left arrow': 'ArrowLeft', 'leftarrow': 'ArrowLeft', 'arrowleft': 'ArrowLeft', 'arrow left': 'ArrowLeft', 'left': 'ArrowLeft',
    'right arrow': 'ArrowRight', 'rightarrow': 'ArrowRight', 'arrowright': 'ArrowRight', 'arrow right': 'ArrowRight', 'right': 'ArrowRight',
    'space': ' ', 'space bar': ' ', 'spacebar': ' ', 'the space bar': ' ',
    'enter': 'Enter', 'return': 'Enter', 'the enter key': 'Enter',
    'escape': 'Escape', 'esc': 'Escape',
    'tab': 'Tab', 'shift': 'Shift', 'control': 'Control', 'ctrl': 'Control', 'alt': 'Alt',
    'backspace': 'Backspace', 'delete': 'Delete', 'any': '*', 'any key': '*'
  };

  function normalizeKeyName(name) {
    var raw = String(name === undefined || name === null ? '' : name).trim();
    var lower = raw.toLowerCase();
    if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
    if (raw.length === 1) return lower;
    // "a" / "A" typed as a letter, or a raw KeyboardEvent.key such as "F5".
    return raw;
  }

  function Actor(name, image) {
    this.name = name;
    this.image = image || '';
    this.x = 0;
    this.y = 0;
    this.width = 64;
    this.height = 64;
    this.scale = 1;
    this.visible = true;
    this.paused = false;
    this.stopped = false;
    this.direction = 0;
  }

  // ---------------- Interpreter ----------------
  function Interpreter(options) {
    options = options || {};
    this.output = typeof options.output === 'function' ? options.output : function () {};
    this.input = typeof options.input === 'function' ? options.input : function () { return Promise.resolve(''); };
    this.delay = typeof options.delay === 'function' ? options.delay : function (seconds) {
      return new Promise(function (resolve) { setTimeout(resolve, seconds * 1000); });
    };
    this.onLibrary = typeof options.onLibrary === 'function' ? options.onLibrary : function () {};
    // Runs Python code for `python code "..."` statements (Python library).
    // Injected because actually executing Python is the host's job — the
    // IDE supplies a real Python runner; without one, Python statements
    // fail with a clear English error instead of silently doing nothing.
    this.pythonExecutor = typeof options.pythonExecutor === 'function' ? options.pythonExecutor
      : (typeof options.executePython === 'function' ? options.executePython : null);
    this.onStatement = typeof options.onStatement === 'function' ? options.onStatement : null;
    // Draw library hook: called whenever a sprite is created or moved,
    // with { name, x, y, action: 'create' | 'move', direction }.
    this.onSprite = typeof options.onSprite === 'function' ? options.onSprite : function () {};
    // Dev Build 5: Image library hooks.
    // onImageDisplay: called when `display image '<name>'` runs.
    //   Receives { name, source } where source is the filename/data.
    this.onImageDisplay = typeof options.onImageDisplay === 'function' ? options.onImageDisplay : function (info) {
      // Default: no-op (the IDE provides a real implementation)
    };
    // onImageCheck: called when `check if "<file>" exists in device` runs.
    //   Receives the filename string, returns boolean or Promise<boolean>.
    this.onImageCheck = typeof options.onImageCheck === 'function' ? options.onImageCheck : function () {
      return false; // default: nothing exists in the pure interpreter
    };
    // Release 1.2 — Keyboard: which keys are down right now. The IDE writes
    // into this object from real keydown/keyup events; a headless run can
    // pass its own, or supply isKeyPressed.
    this.keys = options.keys || Object.create(null);
    this.isKeyPressed = typeof options.isKeyPressed === 'function' ? options.isKeyPressed : null;
    // Release 1.2 — Game: called on every visible change so a host can draw
    // the game without the interpreter knowing anything about canvases.
    this.onGame = typeof options.onGame === 'function' ? options.onGame : function () {};
    // Waits for the next animation frame in `play the game` blocks. Hosts
    // that want a slower or faster game can inject their own.
    this.frame = typeof options.frame === 'function' ? options.frame : function () {
      return new Promise(function (resolve) { setTimeout(resolve, 16); });
    };
    this.maxFrames = options.maxFrames || 100000;
    this.maxSteps = options.maxSteps || 100000;
    this.maxLoopIterations = options.maxLoopIterations || 10000;
    this.cancelled = false;
    this.reset();
  }

  Interpreter.prototype.reset = function () {
    this.variables = new Map();       // lowercased name -> value
    this.loadedLibraries = new Set(); // canonical library names
    this.sprites = new Map();         // lowercased name -> { name, x, y }
    this.actors = new Map();          // Release 1.2 — lowercased name -> Actor
    this.game = { width: 800, height: 600, background: null, running: false, frames: 0 };
    this.timers = new Map();          // Release 1.2 — named waits
    this.lastKey = '';                // Release 1.2 — most recent key pressed
    this.images = new Map();          // Dev Build 5: lowercased name -> { name, source }
    this.pictures = new Map();        // 1.2.1 LP1 — lowercased name -> linked picture
    this.lastIf = null;               // nearest previous if (for loopback)
    this.pythonGlobals = Object.create(null);
    this.pythonRunner = null;
    this.steps = 0;
    this.loopIterations = 0;
  };

  Interpreter.prototype.stop = function () { this.cancelled = true; };

  Interpreter.prototype.checkRunning = function (node) {
    if (this.cancelled) {
      throw new RuntimeError('Execution was stopped.', node && node.line, node && node.column, null);
    }
    this.steps += 1;
    if (this.steps > this.maxSteps) {
      throw new RuntimeError('The program ran for too long and was stopped (over ' + this.maxSteps + ' steps).',
        node && node.line, node && node.column, 'Check for a loop that never ends.');
    }
  };

  /** Runs a parsed Program node. For source text use EPP.run() below. */
  Interpreter.prototype.run = async function (program) {
    this.reset();
    this.cancelled = false;
    if (!program || program.type !== 'Program') {
      throw new RuntimeError('The interpreter needs a parsed E++ program.');
    }
    await this.executeBlock(program.body);
    return {
      variables: this.variables, loadedLibraries: this.loadedLibraries,
      sprites: this.sprites, images: this.images,
      actors: this.actors, game: this.game
    };
  };

  // ---------------- Release 1.2 helpers ----------------

  /**
   * The picture a name is linked to.
   *
   * A program can link pictures itself, and the page can hand the interpreter a
   * book as well (the Studio's project pictures), so both are consulted: the
   * program wins, the project answers next.
   */
  Interpreter.prototype.pictureFor = function (name) {
    var key = String(name).toLowerCase();
    var own = this.pictures.get(key);
    if (own) return own.source;
    var Pictures = EPP.Pictures;
    if (Pictures && typeof Pictures.resolve === 'function') {
      var fromProject = Pictures.resolve(name);
      if (fromProject) return fromProject;
    }
    return null;
  };

  /** Links a picture to a name, and refuses a source that is not a picture. */
  Interpreter.prototype.bindPicture = function (node, name, source) {
    var clean = String(name || '').trim();
    var data = String(source === undefined || source === null ? '' : source).trim();
    if (!data) {
      throw new RuntimeError('The picture for \'' + clean + '\' is empty.',
        node.line, node.column,
        'Give it a picture, for example: link the image "hero.png" to the actor \'' + clean + '\'.');
    }
    var Pictures = EPP.Pictures;
    if (Pictures && typeof Pictures.isImageSource === 'function' && !Pictures.isImageSource(data)) {
      throw new RuntimeError('"' + data + '" is not a picture.',
        node.line, node.column,
        'Use a picture file such as "hero.png", or pick one with the 🖼 Image button.');
    }
    var entry = { name: clean, source: data };
    this.pictures.set(clean.toLowerCase(), entry);
    this.images.set(clean.toLowerCase(), { name: clean, source: data });
    return entry;
  };

  Interpreter.prototype.requireActor = function (node, name) {
    var actorKey = String(name).toLowerCase();
    if (!this.actors.has(actorKey)) {
      throw new RuntimeError('There is no actor called \'' + name + '\'.',
        node.line, node.column,
        'Create it first: create the actor \'' + name + '\' — or link a picture to that name with: link the image "picture.png" to the actor \'' + name + '\'.');
    }
    return this.actors.get(actorKey);
  };

  /** Sends a game event to the host (the IDE draws it; tests just watch). */
  Interpreter.prototype.emitGame = function (action, actor) {
    this.onGame({
      action: action,
      actor: actor ? { name: actor.name, image: actor.image, x: actor.x, y: actor.y, scale: actor.scale, visible: actor.visible, paused: actor.paused, stopped: actor.stopped } : null,
      actors: this.actorsArray(),
      width: this.game.width,
      height: this.game.height,
      background: this.game.background,
      running: this.game.running,
      frames: this.game.frames
    });
  };

  Interpreter.prototype.actorsArray = function () {
    var list = [];
    this.actors.forEach(function (actor) {
      list.push({ name: actor.name, image: actor.image, x: actor.x, y: actor.y, width: actor.width, height: actor.height, scale: actor.scale, visible: actor.visible, paused: actor.paused, stopped: actor.stopped });
    });
    return list;
  };

  /** Collision test used by `if 'hero' is touching 'gem' then`. */
  Interpreter.prototype.actorsTouch = function (nameA, nameB) {
    var a = this.actors.get(String(nameA).toLowerCase());
    var b = this.actors.get(String(nameB).toLowerCase());
    if (!a || !b) return false;
    if (!a.visible || !b.visible || a.stopped || b.stopped) return false;
    var halfA = (a.width * a.scale) / 2;
    var halfB = (b.width * b.scale) / 2;
    var dx = Math.abs(a.x - b.x);
    var dy = Math.abs(a.y - b.y);
    return dx < halfA + halfB && dy < (a.height * a.scale) / 2 + (b.height * b.scale) / 2;
  };

  Interpreter.prototype.keyIsDown = function (keyName) {
    var key = normalizeKeyName(keyName);
    if (key === '*') return this.anyKeyDown();
    if (this.isKeyPressed) return !!this.isKeyPressed(key);
    return !!this.keys[key];
  };

  Interpreter.prototype.anyKeyDown = function () {
    if (this.isKeyPressed) return !!this.isKeyPressed('*');
    for (var key in this.keys) { if (this.keys[key]) return true; }
    return false;
  };

  Interpreter.prototype.startTimer = function (name, node) {
    var timer = { name: name || null, cancelled: false, startedAt: Date.now(), node: node };
    if (name) this.timers.set(String(name).toLowerCase(), timer);
    return timer;
  };

  /**
   * Sleeps in short slices so `cancel the wait 'x'` and the Stop button can
   * interrupt a wait in the middle instead of finishing it first.
   */
  Interpreter.prototype.sleepFor = async function (seconds, timer) {
    if (seconds < 0) {
      throw new RuntimeError('Cannot wait for a negative amount of time (' + seconds + ' seconds).',
        timer && timer.node ? timer.node.line : null, timer && timer.node ? timer.node.column : null,
        'Use a number of seconds that is 0 or more.');
    }
    var remaining = seconds * 1000;
    var slice = 25;
    while (remaining > 0) {
      if (this.cancelled) throw new RuntimeError('Execution was stopped.', null, null, null);
      if (timer && timer.cancelled) return;
      var step = Math.min(slice, remaining);
      await this.delay(step / 1000);
      remaining -= step;
    }
  };

  Interpreter.prototype.executeBlock = async function (statements) {
    for (var i = 0; i < statements.length; i++) {
      await this.executeStatement(statements[i]);
    }
  };

  Interpreter.prototype.executeStatement = async function (node) {
    this.checkRunning(node);
    if (this.onStatement) this.onStatement(node);
    var AST = EPP.AST.Type;

    switch (node.type) {
      // ---------------- Release 1.2 — Game library -------------------
      case AST.GAME_WINDOW: {
        var gw = Math.round(this.toNumber(await this.evaluate(node.width), node, 'the game window width'));
        var gh = Math.round(this.toNumber(await this.evaluate(node.height), node, 'the game window height'));
        if (gw < 1 || gh < 1) {
          throw new RuntimeError('A game window needs a width and a height bigger than zero.',
            node.line, node.column, 'For example: set the game window to 640 by 480');
        }
        this.game.width = gw;
        this.game.height = gh;
        this.emitGame('window');
        return;
      }
      case AST.GAME_BACKGROUND: {
        this.game.background = stringify(await this.evaluate(node.value));
        this.emitGame('background');
        return;
      }
      case AST.DEFINE_ACTOR: {
        // No image on the line means "the picture this name is linked to".
        var linkedPicture = this.pictureFor(node.name);
        var actorSource = node.image ? stringify(await this.evaluate(node.image)) : (linkedPicture || '');
        var newActor = new Actor(node.name, actorSource);
        if (actorSource) this.pictures.set(node.name.toLowerCase(), { name: node.name, source: actorSource });
        this.actors.set(node.name.toLowerCase(), newActor);
        // The actor's name works like any other variable from here on, which
        // is what "that name is treated like a variable which loads the
        // image" means: say 'hero' / display image 'hero' both work.
        this.variables.set(node.name.toLowerCase(), node.name);
        this.images.set(node.name.toLowerCase(), { name: node.name, source: actorSource });
        this.emitGame('create', newActor);
        return;
      }
      case AST.LINK_IMAGE: {
        var linkSource = stringify(await this.evaluate(node.image));
        var linked = this.bindPicture(node, node.name, linkSource);
        var existing = this.actors.get(node.name.toLowerCase());
        if (existing) {
          existing.image = linkSource;
          this.emitGame('image', existing);
        } else {
          this.emitGame('link', linked);
        }
        return;
      }
      case AST.SET_ACTOR_IMAGE: {
        var setActor = this.requireActor(node, node.name);
        var picture = stringify(await this.evaluate(node.image));
        this.bindPicture(node, node.name, picture);
        setActor.image = picture;
        this.emitGame('image', setActor);
        return;
      }
      case AST.PLACE_ACTOR: {
        var placeActor = this.requireActor(node, node.name);
        placeActor.x = this.toNumber(await this.evaluate(node.x), node, 'the actor x position');
        placeActor.y = this.toNumber(await this.evaluate(node.y), node, 'the actor y position');
        this.emitGame('place', placeActor);
        return;
      }
      case AST.ACTOR_SIZE: {
        var sizedActor = this.requireActor(node, node.name);
        var size = this.toNumber(await this.evaluate(node.size), node, 'the actor size');
        if (size <= 0) {
          throw new RuntimeError('An actor size has to be bigger than zero.', node.line, node.column,
            'For example: set the size of the actor \'hero\' to 2');
        }
        if (size > 10) {
          throw new RuntimeError('An actor size is a multiplier: 1 is its normal size, and ' + size + ' would be ' + size + ' times bigger.', node.line, node.column,
            'Try 2 for twice as big, or a number between 0.1 and 1 to shrink one.');
        }
        sizedActor.scale = size;
        this.emitGame('size', sizedActor);
        return;
      }
      case AST.ACTOR_ACTION: {
        if (node.name === '*') {
          var stoppedCount = 0;
          this.actors.forEach(function (a) { a.stopped = true; stoppedCount += 1; });
          this.emitGame('stop-all');
          return;
        }
        var targetActor = this.requireActor(node, node.name);
        if (node.action === 'show') targetActor.visible = true;
        else if (node.action === 'hide') targetActor.visible = false;
        else if (node.action === 'pause') targetActor.paused = true;
        else if (node.action === 'resume') { targetActor.paused = false; targetActor.stopped = false; }
        else if (node.action === 'stop') { targetActor.stopped = true; targetActor.paused = true; }
        this.emitGame(node.action, targetActor);
        return;
      }
      case AST.GAME_LOOP: {
        if (!this.game.running) this.game.running = true;
        this.emitGame('start');
        var frames = 0;
        while (this.game.running && !this.cancelled) {
          this.checkRunning(node);
          await this.executeBlock(node.body);
          frames += 1;
          this.game.frames += 1;
          if (frames >= this.maxFrames) {
            throw new RuntimeError('The game ran for ' + frames + ' frames and was stopped.',
              node.line, node.column,
              'Add "stop the game" somewhere in the loop, or raise the frame limit.');
          }
          await this.frame();
        }
        this.game.running = false;
        this.emitGame('finish');
        return;
      }
      case AST.STOP_GAME: {
        this.game.running = false;
        this.emitGame('stop');
        return;
      }

      // ---------------- Release 1.2 — Keyboard library ---------------
      case AST.WAIT_FOR_KEY: {
        var keyDeadline = Date.now() + 30000;
        var anyKey = this.anyKeyDown();
        while (!anyKey && Date.now() < keyDeadline && !this.cancelled) {
          await this.frame();
          anyKey = this.anyKeyDown();
        }
        return;
      }

      // ------- Release 1.2 — ImprovedWait / ImprovedWaitLite ----------
      case AST.WAIT_NAMED: {
        var namedTimer = this.startTimer(node.timerName, node);
        await this.sleepFor(this.toNumber(await this.evaluate(node.duration), node, 'wait'), namedTimer);
        return;
      }
      case AST.WAIT_THEN: {
        var thenTimer = this.startTimer(node.timerName, node);
        await this.sleepFor(this.toNumber(await this.evaluate(node.duration), node, 'wait'), thenTimer);
        if (node.statement) await this.executeStatement(node.statement);
        return;
      }
      case AST.CANCEL_WAIT: {
        var key = String(node.timerName).toLowerCase();
        if (this.timers.has(key)) this.timers.get(key).cancelled = true;
        return;
      }
      case AST.WAIT_UNTIL: {
        var untilLimit = node.limit === null ? null
          : this.toNumber(await this.evaluate(node.limit), node, 'wait at most');
        var deadline = untilLimit === null ? null : Date.now() + untilLimit * 1000;
        var timer = this.startTimer(null, node);
        while (!timer.cancelled && !this.cancelled) {
          if (await this.evaluateCondition(node.condition)) return;
          if (deadline !== null && Date.now() >= deadline) return;
          if (deadline === null && Date.now() - timer.startedAt > 60000) {
            throw new RuntimeError('This "wait until" has been waiting for a minute and the condition is still false.',
              node.line, node.column,
              'Give it a deadline: wait at most 10 seconds until ...');
          }
          await this.frame();
        }
        return;
      }
      case AST.WAIT_FOR_ACTOR: {
        var waitActor = this.requireActor(node, node.name);
        var limitSeconds = node.limit === null ? null
          : this.toNumber(await this.evaluate(node.limit), node, 'wait at most');
        var actorDeadline = limitSeconds === null ? null : Date.now() + limitSeconds * 1000;
        while (!this.cancelled) {
          if (waitActor.stopped || waitActor.paused || !waitActor.visible) return;
          if (actorDeadline !== null && Date.now() >= actorDeadline) return;
          await this.frame();
        }
        return;
      }

      case AST.DEFINE:
      case AST.SET: {
        // Bare words are not implicit strings, even in assignments.
        var value = await this.evaluate(node.value);
        this.variables.set(node.name.toLowerCase(), value);
        return;
      }
      case AST.SAY: {
        // say a, b, c prints one line, the way the Studio's examples read.
        if (node.parts && node.parts.length) {
          var pieces = [];
          for (var partIndex = 0; partIndex < node.parts.length; partIndex++) {
            pieces.push(stringify(await this.evaluate(node.parts[partIndex])));
          }
          this.output(joinSayParts(pieces));
          return;
        }
        var said = await this.evaluate(node.value);
        this.output(stringify(said));
        return;
      }
      case AST.ASK: {
        var prompt = stringify(await this.evaluate(node.prompt));
        var answer = await this.input(prompt);
        if (this.cancelled) throw new RuntimeError('Execution was stopped.', node.line, node.column, null);
        this.variables.set(node.name.toLowerCase(), answer === null || answer === undefined ? '' : String(answer));
        return;
      }
      case AST.WAIT: {
        var seconds = this.toNumber(await this.evaluate(node.duration), node, 'wait');
        if (seconds < 0) throw new RuntimeError('Cannot wait for a negative amount of time (' + seconds + ' seconds).', node.line, node.column, 'Use a number of seconds that is 0 or more.');
        await this.delay(seconds);
        if (this.cancelled) throw new RuntimeError('Execution was stopped.', node.line, node.column, null);
        return;
      }
      case AST.LIBRARY: {
        var canonical = EPP.Libraries.canonical(node.name);
        if (!canonical) {
          throw new LibraryError('There is no library called "' + node.name + '".', node.line, node.column,
            'Available libraries: ' + EPP.Libraries.names().join(', ') + '.');
        }
        this.loadedLibraries.add(canonical);
        this.onLibrary(canonical);
        return;
      }
      case AST.IF: {
        // Remember this if: it becomes the nearest previous if that a
        // later `loopback to if` re-evaluates (Dev Build 4).
        this.lastIf = node;
        // Chained form: try each branch in order; a branch with no
        // condition is the final `otherwise`.
        if (node.branches && node.branches.length) {
          for (var bi = 0; bi < node.branches.length; bi++) {
            var br = node.branches[bi];
            if (!br.condition || (await this.evaluateCondition(br.condition))) {
              await this.executeBlock(br.body);
              return;
            }
          }
          return;
        }
        var branch = (await this.evaluateCondition(node.condition)) ? node.thenBranch : node.elseBranch;
        await this.executeBlock(branch);
        return;
      }
      case AST.LOOPBACK: {
        // loopback to if: re-evaluate the nearest previous if. It only
        // triggers when that if's condition is true (checked again now);
        // when it is false the loopback is ignored and the program
        // simply carries on with the next statement.
        var target = this.lastIf;
        if (!target) {
          throw new RuntimeError('There is no if for this loopback to go back to.',
            node.line, node.column,
            'loopback to if goes back to the closest if above it, so an if has to come before this line.');
        }
        var firstCondition = target.branches && target.branches.length
          ? target.branches[0].condition : target.condition;
        if (firstCondition && (await this.evaluateCondition(firstCondition))) {
          await this.executeStatement(target);
        }
        return;
      }
      case AST.DEFINE_SPRITE: {
        var sprite = { name: node.name, x: 0, y: 0 };
        this.sprites.set(node.name.toLowerCase(), sprite);
        this.variables.set(node.name.toLowerCase(), node.name);
        this.onSprite({ name: sprite.name, x: sprite.x, y: sprite.y, action: 'create', direction: null });
        return;
      }
      case AST.MOVE_SPRITE: {
        var moveKey = node.name.toLowerCase();
        // Release 1.2 — actors move with exactly the same words as sprites.
        if (this.actors.has(moveKey)) {
          var actorToMove = this.actors.get(moveKey);
          if (actorToMove.paused || actorToMove.stopped) return;
          var actorPixels = parseFloat(String(node.pixels).trim());
          if (!/^-?\d+(\.\d+)?$/.test(String(node.pixels).trim())) {
            throw new RuntimeError('The actor can only move by a number of pixels, but "' + node.pixels + '" is not a number.',
              node.line, node.column,
              'Write the pixels as numbers inside double quotes, for example: \'' + node.name + '\' move ' + node.direction + ' "10"');
          }
          if (node.direction === 'up') actorToMove.y -= actorPixels;
          else if (node.direction === 'down') actorToMove.y += actorPixels;
          else if (node.direction === 'left') actorToMove.x -= actorPixels;
          else if (node.direction === 'right') actorToMove.x += actorPixels;
          this.emitGame('move', actorToMove);
          return;
        }
        if (!this.sprites.has(moveKey)) {
          throw new RuntimeError('There is no sprite called \'' + node.name + '\' to move.',
            node.line, node.column,
            'Create it first, for example: define \'' + node.name + '\' as drawing sprite. Then \'' + node.name + '\' move ' + node.direction + ' "10" will work.');
        }
        var moving = this.sprites.get(moveKey);
        var pixelText = String(node.pixels).trim();
        if (!/^-?\d+(\.\d+)?$/.test(pixelText)) {
          throw new RuntimeError('The sprite can only move by a number of pixels, but "' + node.pixels + '" is not a number.',
            node.line, node.column,
            'Write the pixels as numbers inside double quotes, for example: \'' + node.name + '\' move ' + node.direction + ' "10"');
        }
        var pixels = parseFloat(pixelText);
        if (node.direction === 'up') moving.y -= pixels;
        else if (node.direction === 'down') moving.y += pixels;
        else if (node.direction === 'left') moving.x -= pixels;
        else if (node.direction === 'right') moving.x += pixels;
        this.onSprite({ name: moving.name, x: moving.x, y: moving.y, action: 'move', direction: node.direction });
        return;
      }
      case AST.DEFINE_IMAGE: {
        // Dev Build 5: define '<name>' as image "<base64-string>"
        var imgSource = stringify(await this.evaluate(node.source));
        this.images.set(node.name.toLowerCase(), { name: node.name, source: imgSource });
        this.variables.set(node.name.toLowerCase(), node.name);
        return;
      }
      case AST.DISPLAY_IMAGE: {
        // Dev Build 5: display image '<name>'
        var dKey = node.name.toLowerCase();
        if (!this.images.has(dKey)) {
          throw new RuntimeError('There is no image called \'' + node.name + '\' to display.',
            node.line, node.column,
            'Create it first, for example: define \'' + node.name + '\' as image "<base64-string>". Then display image \'' + node.name + '\' will work.');
        }
        var img = this.images.get(dKey);
        this.onImageDisplay({ name: img.name, source: img.source });
        return;
      }
      case AST.CHECK_EXISTS: {
        // Dev Build 5: check if '<variable>' exists
        // The node.name is the raw variable name (from the parser).
        // We look it up directly in the images map.
        var lookupName = node.name;
        var exists = this.images.has(lookupName.toLowerCase());
        this.output(lookupName + (exists ? ' exists' : ' does not exist'));
        return;
      }
      case AST.INCREASE:
      case AST.DECREASE: {
        var isInc = node.type === AST.INCREASE;
        var word = isInc ? 'increase' : 'decrease';
        var key = node.name.toLowerCase();
        if (!this.variables.has(key)) {
          throw new RuntimeError('Cannot ' + word + ' \'' + node.name + '\', because it has not been defined yet.',
            node.line, node.column,
            'Define it first, for example: Define ' + node.name + ' as 0. Then ' + (isInc ? 'Increase' : 'Decrease') + ' ' + node.name + ' by 1 will work.');
        }
        var current = this.variables.get(key);
        if (!isNumericLike(current)) {
          throw new RuntimeError('Cannot ' + word + ' \'' + node.name + '\', because it holds "' + stringify(current) + '", which is not a number.',
            node.line, node.column,
            'Only numbers can go up or down. Give \'' + node.name + '\' a number first, for example: Define ' + node.name + ' as 0.');
        }
        var amount = await this.evaluate(node.amount);
        if (!isNumericLike(amount)) {
          throw new RuntimeError('Cannot ' + word + ' \'' + node.name + '\' by "' + stringify(amount) + '", because that amount is not a number.',
            node.line, node.column,
            'Write a number after "by", for example: ' + (isInc ? 'Increase' : 'Decrease') + ' ' + node.name + ' by 1.');
        }
        var result;
        if (current instanceof Fraction || amount instanceof Fraction) {
          var cf = Fraction.from(this.toNumber(current, node, '"' + word + '"'));
          var af = Fraction.from(this.toNumber(amount, node, '"' + word + '"'));
          result = isInc ? cf.add(af) : cf.subtract(af);
        } else {
          result = isInc
            ? this.toNumber(current, node, '"' + word + '"') + this.toNumber(amount, node, '"' + word + '"')
            : this.toNumber(current, node, '"' + word + '"') - this.toNumber(amount, node, '"' + word + '"');
        }
        this.variables.set(key, result);
        return;
      }
      case AST.PYTHON_CODE: {
        // Python code may only run when the Python library has been added.
        if (!this.loadedLibraries.has('Python')) {
          throw new LibraryError('You cannot run Python code yet, because the Python library has not been added.',
            node.line, node.column,
            'Add this line above your Python code: add library "Python" — then python code "..." will work.');
        }
        var self = this;
        var executor = this.pythonExecutor;
        if (!executor && EPP.PythonRunner) {
          executor = async function (code) {
            if (!self.pythonRunner) {
              self.pythonRunner = new EPP.PythonRunner({
                output: self.output,
                globals: self.pythonGlobals
              });
            }
            self.pythonRunner.run(code);
          };
        }
        if (typeof executor !== 'function') {
          throw new RuntimeError('Python code cannot run here, because no Python runner is connected to this E++ IDE.',
            node.line, node.column,
            'Open this file in the E++ IDE in a web browser, then press Run again.');
        }
        try {
          await executor(node.code, node);
        } catch (e) {
          if (e && e.format && e.category) throw e; // already an E++ error
          // Requirement 3: "BRO JUST USE THE PYTHONS OWN ERROR CODES"
          var rawMsg = e && e.message ? String(e.message).trim() : String(e || '');
          var match = /(?:^|\n)([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception|Interrupt|Iteration)[^\n]*)/.exec(rawMsg);
          var pyCode = match ? match[1] : rawMsg;
          throw new RuntimeError(pyCode, node.line, node.column,
            'Check your Python code — it follows Python\u2019s own syntax and rules.');
        }
        if (this.cancelled) throw new RuntimeError('Execution was stopped.', node.line, node.column, null);
        return;
      }
      case AST.REPEAT: {
        var count = Math.floor(this.toNumber(await this.evaluate(node.count), node, 'repeat'));
        if (count < 0) throw new RuntimeError('Cannot repeat a negative number of times (' + count + ').', node.line, node.column, null);
        for (var i = 0; i < count; i++) {
          this.guardLoop(node);
          try { await this.executeBlock(node.body); }
          catch (e) { if (e && e.isBreakSignal) break; throw e; }
        }
        return;
      }
      case AST.WHILE: {
        while (await this.evaluateCondition(node.condition)) {
          this.guardLoop(node);
          try { await this.executeBlock(node.body); }
          catch (e) { if (e && e.isBreakSignal) break; throw e; }
        }
        return;
      }
      case AST.STOP: throw new BreakSignal();
      case AST.NOTE: return;
      default:
        throw new RuntimeError('The interpreter does not know how to run a "' + node.type + '" statement.', node.line, node.column, null);
    }
  };

  Interpreter.prototype.guardLoop = function (node) {
    this.checkRunning(node);
    this.loopIterations += 1;
    if (this.loopIterations > this.maxLoopIterations) {
      throw new RuntimeError('A loop ran more than ' + this.maxLoopIterations + ' times and was stopped.',
        node.line, node.column, 'Make sure the loop can finish, or add conditions that eventually stop it.');
    }
  };

  Interpreter.prototype.requireRuntimeLibrary = function (library, feature, node) {
    if (!this.loadedLibraries.has(library)) {
      throw new LibraryError('"' + feature + '" needs the ' + library + ' library.',
        node.line, node.column, 'Add this near the top of your program: library "' + library + '" add');
    }
  };

  Interpreter.prototype.evaluateCondition = async function (node) {
    if (!node) return false;
    // Release 1.2 — Keyboard: the "Up arrow" key is pressed
    if (node.type === 'KeyPressed') {
      var pressed = this.keyIsDown(node.key);
      return node.negated ? !pressed : pressed;
    }
    var left = await this.evaluate(node.left);
    // Release 1.2 — Game: is touching
    if (node.operator === 'touching') {
      // Take the actor name straight from the syntax when possible, so a
      // typo is simply "not touching" instead of an undefined-variable error.
      var otherName;
      if (node.right && node.right.type === 'Variable') otherName = node.right.name;
      else if (node.right && node.right.type === 'BareWord') otherName = node.right.text;
      else otherName = stringify(await this.evaluate(node.right));
      return this.actorsTouch(stringify(left), otherName);
    }
    if (node.operator === 'truthy') return truthy(left);
    // Number tests: typed answers count as numbers when they look like
    // one ("11" is a number, "eleven" and "" are not).
    if (node.operator === 'notNumber') return !isNumericLike(left);
    if (node.operator === 'number') return isNumericLike(left);
    // Dev Build 5: positive / negative number tests (Math library)
    if (node.operator === 'positive') {
      return isNumericLike(left) && this.toNumber(left, node, 'positive check') > 0;
    }
    if (node.operator === 'notPositive') {
      return !isNumericLike(left) || this.toNumber(left, node, 'positive check') <= 0;
    }
    if (node.operator === 'negative') {
      return isNumericLike(left) && this.toNumber(left, node, 'negative check') < 0;
    }
    if (node.operator === 'notNegative') {
      return !isNumericLike(left) || this.toNumber(left, node, 'negative check') >= 0;
    }
    // Dev Build 5: contains — core logic (no library needed)
    if (node.operator === 'contains') {
      var leftStr = stringify(left);
      var rightStr = stringify(await this.evaluate(node.right));
      return leftStr.indexOf(rightStr) !== -1;
    }
    // Dev Build 6: exactEqual — case-sensitive, strict comparison
    if (node.operator === 'exactEqual' || node.operator === 'notExactEqual') {
      var right = await this.evaluate(node.right);
      var exactCmp = stringify(left) === stringify(right);
      return node.operator === 'exactEqual' ? exactCmp : !exactCmp;
    }
    // Dev Build 5: in the range of A to B (Math library)
    if (node.operator === 'inRange' || node.operator === 'notInRange') {
      var val = this.toNumber(left, node, 'range check');
      var low = this.toNumber(await this.evaluate(node.right.low), node, 'range check');
      var high = this.toNumber(await this.evaluate(node.right.high), node, 'range check');
      var minVal = Math.min(low, high);
      var maxVal = Math.max(low, high);
      var inRange = val >= minVal && val <= maxVal;
      return node.operator === 'inRange' ? inRange : !inRange;
    }
    var right = await this.evaluate(node.right);
    var cmp;
    if (isNumericLike(left) && isNumericLike(right)) {
      var a = this.toNumber(left, node, 'comparison');
      var b = this.toNumber(right, node, 'comparison');
      cmp = a < b ? -1 : a > b ? 1 : 0;
    } else {
      var sa = stringify(left), sb = stringify(right);
      cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    switch (node.operator) {
      // Dev Build 6: 'equal' and 'notEqual' are now case-insensitive for strings
      case 'equal':
        if (typeof left === 'string' && typeof right === 'string') {
          return left.toLowerCase() === right.toLowerCase();
        }
        return cmp === 0;
      case 'notEqual':
        if (typeof left === 'string' && typeof right === 'string') {
          return left.toLowerCase() !== right.toLowerCase();
        }
        return cmp !== 0;
      case 'greater': return cmp > 0;
      case 'greaterOrEqual': return cmp >= 0;
      case 'less': return cmp < 0;
      case 'lessOrEqual': return cmp <= 0;
      default: return truthy(left);
    }
  };

  Interpreter.prototype.toNumber = function (value, node, context) {
    if (value instanceof Fraction) return value.toNumber();
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string' && isNumericLike(value)) return parseFloat(value.trim());
    throw new RuntimeError('Expected a number for ' + (context || 'maths') + ' but got "' + stringify(value) + '".',
      node && node.line, node && node.column,
      'Use a number, or a variable that holds a number.');
  };

  Interpreter.prototype.evaluate = async function (node) {
    var AST = EPP.AST.Type;
    // Release 1.2 — Keyboard: the key pressed
    if (node.type === AST.KEY_PRESSED) return this.lastKey || '';
    switch (node.type) {
      case AST.LITERAL: return node.value;

      case AST.VARIABLE: {
        var key = node.name.toLowerCase();
        if (!this.variables.has(key)) {
          throw new RuntimeError('The variable \'' + node.name + '\' has not been defined yet.',
            node.line, node.column,
            'Define it first, for example: Define ' + node.name + ' as 0.');
        }
        return this.variables.get(key);
      }

      case AST.BARE_WORD: {
        // Older ASTs can still contain a BareWord; reject them as well.
        var bareKey = node.text.toLowerCase();
        if (this.variables.has(bareKey)) {
          // Dev Build 4: variables MUST be written inside single quotes,
          // so a bare word is never a variable reference.
          throw new RuntimeError(
            '"' + node.text + '" is a variable, but it is not written as one \u2014 variables must be written inside single quotes.',
            node.line, node.column,
            "Write it with single quotes, like this: '" + node.text + "'.");
        }
        var plural = node.text.indexOf(' ') !== -1;
        throw new RuntimeError(
          (plural ? 'The words "' + node.text + '" do' : 'The word "' + node.text + '" does') +
          ' not mean anything in E++ yet — ' + (plural ? 'they are' : 'it is') +
          ' not a variable, a number, or an E++ keyword.',
          node.line, node.column,
          'If you want these exact words, put them in double quotes, like this: say "' + node.text + '". ' +
          'If you meant a variable, define it first (Define ' + node.text.split(' ')[0] + ' as ...) and write it with single quotes.');
      }

      case AST.UNARY: {
        var v = this.toNumber(await this.evaluate(node.operand), node, '"minus"');
        return -v;
      }

      case AST.BINARY: return this.evaluateBinary(node);

      case AST.PERCENT_OF: {
        this.requireRuntimeLibrary('Math', 'percent of', node);
        var percent = this.toNumber(await this.evaluate(node.percent), node, '"percent of"');
        var base = this.toNumber(await this.evaluate(node.base), node, '"percent of"');
        return (percent / 100) * base;
      }

      case AST.SQUARE_ROOT: {
        this.requireRuntimeLibrary('Math', 'square root of', node);
        var operand = this.toNumber(await this.evaluate(node.operand), node, '"square root of"');
        if (operand < 0) {
          throw new RuntimeError('Cannot take the square root of a negative number (' + operand + ').', node.line, node.column, null);
        }
        return Math.sqrt(operand);
      }

      case AST.CONVERSION: {
        this.requireRuntimeLibrary('Math', 'as ' + node.kind, node);
        var raw = await this.evaluate(node.operand);
        if (node.kind === 'fraction') {
          if (raw instanceof Fraction) return raw;
          return Fraction.from(this.toNumber(raw, node, '"as fraction"'));
        }
        // as decimal
        if (raw instanceof Fraction) return raw.toNumber();
        return this.toNumber(raw, node, '"as decimal"');
      }

      case AST.TEXT_FUNCTION: {
        this.requireRuntimeLibrary('Text', node.fn + ' of', node);
        var text = stringify(await this.evaluate(node.operand));
        if (node.fn === 'uppercase') return text.toUpperCase();
        if (node.fn === 'lowercase') return text.toLowerCase();
        if (node.fn === 'length') return text.length;
        if (node.fn === 'reverse') return text.split('').reverse().join('');
        if (node.fn === 'first letter') return text.charAt(0);
        if (node.fn === 'last letter') return text.slice(-1);
        if (node.fn === 'trim') return text.trim();
        return text;
      }

      case AST.MATH_FUNCTION: {
        this.requireRuntimeLibrary('Math', node.fn + ' of', node);
        var values = [];
        for (var i = 0; i < node.args.length; i += 1) {
          values.push(this.toNumber(await this.evaluate(node.args[i]), node, '"' + node.fn + ' of"'));
        }
        if (node.fn === 'maximum') return Math.max.apply(Math, values);
        if (node.fn === 'minimum') return Math.min.apply(Math, values);
        return Math.abs(values[0]); // absolute value of
      }

      case AST.MATH_CONSTANT: {
        this.requireRuntimeLibrary('Math', 'the value of ' + node.name, node);
        return node.name === 'pi' ? Math.PI : Math.E;
      }

      case AST.RANDOM_NUMBER: {
        this.requireRuntimeLibrary('Random', 'random number between ... and ...', node);
        var low = this.toNumber(await this.evaluate(node.low), node, '"random number between"');
        var high = this.toNumber(await this.evaluate(node.high), node, '"random number between"');
        if (high < low) { var tmp = low; low = high; high = tmp; }
        if (Number.isInteger(low) && Number.isInteger(high)) {
          return Math.floor(Math.random() * (high - low + 1)) + low;
        }
        return Math.random() * (high - low) + low;
      }

      default:
        throw new RuntimeError('The interpreter does not know how to work out a "' + node.type + '" value.', node.line, node.column, null);
    }
  };

  Interpreter.prototype.evaluateBinary = async function (node) {
    var left = await this.evaluate(node.left);
    var right = await this.evaluate(node.right);
    var op = node.operator;

    if (op === 'plus') {
      // plus joins text, and adds numbers (including numeric text).
      if (left instanceof Fraction || right instanceof Fraction) {
        return Fraction.from(this.toNumber(left, node, '"plus"')).add(Fraction.from(this.toNumber(right, node, '"plus"')));
      }
      if (typeof left === 'string' || typeof right === 'string') {
        if (isNumericLike(left) && isNumericLike(right)) return this.toNumber(left, node, '"plus"') + this.toNumber(right, node, '"plus"');
        return stringify(left) + stringify(right);
      }
      return this.toNumber(left, node, '"plus"') + this.toNumber(right, node, '"plus"');
    }

    if (op === 'dividedBy') this.requireRuntimeLibrary('Math', 'divided by', node);
    if (op === 'powerOf') this.requireRuntimeLibrary('Math', 'power of', node);

    if (left instanceof Fraction || right instanceof Fraction) {
      var lf = Fraction.from(this.toNumber(left, node, 'maths'));
      var rf = Fraction.from(this.toNumber(right, node, 'maths'));
      if (op === 'minus') return lf.subtract(rf);
      if (op === 'times') return lf.multiply(rf);
      if (op === 'dividedBy') return lf.divide(rf);
      if (op === 'powerOf') return Math.pow(lf.toNumber(), rf.toNumber());
    }

    var a = this.toNumber(left, node, 'maths');
    var b = this.toNumber(right, node, 'maths');
    switch (op) {
      case 'minus': return a - b;
      case 'times': return a * b;
      case 'dividedBy':
        if (b === 0) throw new RuntimeError('Division by zero is not possible.', node.line, node.column, 'Change the number after "divided by" so it is not zero.');
        return a / b;
      case 'powerOf': return Math.pow(a, b);
      default:
        throw new RuntimeError('Unknown maths operator "' + op + '".', node.line, node.column, null);
    }
  };

  /**
   * Convenience entry point: lex + parse + run E++ source text.
   * Returns the Interpreter so callers can inspect variables/libraries.
   */
  function run(source, options) {
    var interpreter = new Interpreter(options);
    return Promise.resolve()
      .then(function () { return EPP.Parser.parse(source); })
      .then(function (program) { return interpreter.run(program); })
      .then(function () { return interpreter; });
  }

  EPP.Fraction = Fraction;
  EPP.Interpreter = Interpreter;
  EPP.normalizeKeyName = normalizeKeyName;
  EPP.Actor = Actor;
  EPP.run = run;
  EPP.stringifyValue = stringify;
  EPP.translatePythonError = translatePythonError;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Interpreter: Interpreter, Fraction: Fraction, run: run, stringifyValue: stringify };
  }
})(typeof window !== 'undefined' ? window : globalThis);
