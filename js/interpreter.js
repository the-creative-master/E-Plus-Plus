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
 *     onLibrary: function (name) {},          // a library was loaded
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

  // ---------------- Interpreter ----------------
  function Interpreter(options) {
    options = options || {};
    this.output = typeof options.output === 'function' ? options.output : function () {};
    this.input = typeof options.input === 'function' ? options.input : function () { return Promise.resolve(''); };
    this.delay = typeof options.delay === 'function' ? options.delay : function (seconds) {
      return new Promise(function (resolve) { setTimeout(resolve, seconds * 1000); });
    };
    this.onLibrary = typeof options.onLibrary === 'function' ? options.onLibrary : function () {};
    this.onStatement = typeof options.onStatement === 'function' ? options.onStatement : null;
    this.maxSteps = options.maxSteps || 100000;
    this.maxLoopIterations = options.maxLoopIterations || 10000;
    this.cancelled = false;
    this.reset();
  }

  Interpreter.prototype.reset = function () {
    this.variables = new Map();       // lowercased name -> value
    this.loadedLibraries = new Set(); // canonical library names
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
    return { variables: this.variables, loadedLibraries: this.loadedLibraries };
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
      case AST.DEFINE:
      case AST.SET: {
        var value = await this.evaluate(node.value);
        this.variables.set(node.name.toLowerCase(), value);
        return;
      }
      case AST.SAY: {
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
        var branch = (await this.evaluateCondition(node.condition)) ? node.thenBranch : node.elseBranch;
        await this.executeBlock(branch);
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
    var left = await this.evaluate(node.left);
    if (node.operator === 'truthy') return truthy(left);
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
      case 'equal': return cmp === 0;
      case 'notEqual': return cmp !== 0;
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
        // A bare word is a variable when one exists with that name,
        // otherwise it is literal text (Define name as Adonis).
        var bareKey = node.text.toLowerCase();
        if (this.variables.has(bareKey)) return this.variables.get(bareKey);
        return node.text;
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
        return text.length; // length of
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
  EPP.run = run;
  EPP.stringifyValue = stringify;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Interpreter: Interpreter, Fraction: Fraction, run: run, stringifyValue: stringify };
  }
})(typeof window !== 'undefined' ? window : globalThis);
