/*
 * E++ Abstract Syntax Tree (AST) definitions.
 * The parser builds programs exclusively out of these nodes. Every node is a
 * plain object with a `type` plus the source position (`line`, `column`) of
 * the statement/expression it came from, so runtime errors can be located.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var Type = {
    PROGRAM: 'Program',
    DEFINE: 'Define',
    SET: 'Set',
    SAY: 'Say',
    ASK: 'Ask',
    WAIT: 'Wait',
    LIBRARY: 'Library',
    IF: 'If',
    INCREASE: 'Increase',
    DECREASE: 'Decrease',
    PYTHON_CODE: 'PythonCode',
    LOOPBACK: 'Loopback',
    DEFINE_SPRITE: 'DefineSprite',
    MOVE_SPRITE: 'MoveSprite',
    DEFINE_IMAGE: 'DefineImage',
    DISPLAY_IMAGE: 'DisplayImage',
    CHECK_EXISTS: 'CheckExists',
    REPEAT: 'Repeat',
    WHILE: 'While',
    STOP: 'Stop',
    NOTE: 'Note',
    LITERAL: 'Literal',
    VARIABLE: 'Variable',
    BARE_WORD: 'BareWord',
    BINARY: 'Binary',
    UNARY: 'Unary',
    PERCENT_OF: 'PercentOf',
    SQUARE_ROOT: 'SquareRoot',
    CONVERSION: 'Conversion',
    TEXT_FUNCTION: 'TextFunction',
    MATH_FUNCTION: 'MathFunction',
    MATH_CONSTANT: 'MathConstant',
    RANDOM_NUMBER: 'RandomNumber',
    CONDITION: 'Condition',

    // Release 1.2 — Game library
    GAME_WINDOW: 'GameWindow',
    GAME_BACKGROUND: 'GameBackground',
    DEFINE_ACTOR: 'DefineActor',
    PLACE_ACTOR: 'PlaceActor',
    ACTOR_ACTION: 'ActorAction',
    ACTOR_SIZE: 'ActorSize',
    SET_ACTOR_IMAGE: 'SetActorImage',
    LINK_IMAGE: 'LinkImage',
    GAME_LOOP: 'GameLoop',
    STOP_GAME: 'StopGame',
    TOUCHING: 'Touching',

    // Release 1.2 — Keyboard library
    KEY_PRESSED: 'KeyPressed',
    WAIT_FOR_KEY: 'WaitForKey',

    // Release 1.2 — ImprovedWait / ImprovedWaitLite
    WAIT_THEN: 'WaitThen',
    WAIT_NAMED: 'WaitNamed',
    CANCEL_WAIT: 'CancelWait',
    WAIT_UNTIL: 'WaitUntil',
    WAIT_FOR_ACTOR: 'WaitForActor'
  };

  function at(node, token) {
    if (token) { node.line = token.line; node.column = token.column; }
    return node;
  }

  var AST = {
    Type: Type,

    Program: function (body) { return { type: Type.PROGRAM, body: body || [], line: 1, column: 1 }; },
    Define: function (name, value, token) { return at({ type: Type.DEFINE, name: name, value: value }, token); },
    Set: function (name, value, token) { return at({ type: Type.SET, name: name, value: value }, token); },
    // `say` takes either one value or a comma-separated list of values, which
    // E++ prints as one line: say "Score: ", 'score'
    Say: function (value, token, parts) { return at({ type: Type.SAY, value: value, parts: parts || null }, token); },
    Ask: function (prompt, name, token) { return at({ type: Type.ASK, prompt: prompt, name: name }, token); },
    Wait: function (duration, token) { return at({ type: Type.WAIT, duration: duration }, token); },
    Library: function (name, token) { return at({ type: Type.LIBRARY, name: name }, token); },
    If: function (condition, thenBranch, elseBranch, token, branches) {
      var node = {
        type: Type.IF, condition: condition,
        thenBranch: thenBranch || [], elseBranch: elseBranch || []
      };
      // `branches` is the full if / otherwise-if / otherwise chain:
      // [{ condition, body }, ..., { condition: null, body }] where a null
      // condition is the final `otherwise`. When it is not supplied it is
      // derived from the classic condition/thenBranch/elseBranch fields,
      // which are always kept in sync for older code.
      node.branches = branches && branches.length ? branches : (
        [{ condition: condition, body: node.thenBranch }].concat(
          node.elseBranch.length ? [{ condition: null, body: node.elseBranch }] : []
        )
      );
      return at(node, token);
    },
    Increase: function (name, amount, token) { return at({ type: Type.INCREASE, name: name, amount: amount }, token); },
    Decrease: function (name, amount, token) { return at({ type: Type.DECREASE, name: name, amount: amount }, token); },
    PythonCode: function (code, token, block) {
      return at({ type: Type.PYTHON_CODE, code: code, block: !!block }, token);
    },
    Loopback: function (token) { return at({ type: Type.LOOPBACK }, token); },
    DefineSprite: function (name, token) { return at({ type: Type.DEFINE_SPRITE, name: name }, token); },
    MoveSprite: function (name, direction, pixels, token) {
      return at({ type: Type.MOVE_SPRITE, name: name, direction: direction, pixels: pixels }, token);
    },
    DefineImage: function (name, source, token) { return at({ type: Type.DEFINE_IMAGE, name: name, source: source }, token); },
    DisplayImage: function (name, token) { return at({ type: Type.DISPLAY_IMAGE, name: name }, token); },
    CheckExists: function (name, token) { return at({ type: Type.CHECK_EXISTS, name: name }, token); },
    Repeat: function (count, body, token) { return at({ type: Type.REPEAT, count: count, body: body || [] }, token); },
    While: function (condition, body, token) { return at({ type: Type.WHILE, condition: condition, body: body || [] }, token); },
    Stop: function (token) { return at({ type: Type.STOP }, token); },
    Note: function (text, token) { return at({ type: Type.NOTE, text: text || '' }, token); },

    Literal: function (value, token) { return at({ type: Type.LITERAL, value: value }, token); },
    Variable: function (name, token) { return at({ type: Type.VARIABLE, name: name }, token); },
    BareWord: function (text, token) { return at({ type: Type.BARE_WORD, text: text }, token); },
    Binary: function (operator, left, right, token) {
      return at({ type: Type.BINARY, operator: operator, left: left, right: right }, token);
    },
    Unary: function (operator, operand, token) { return at({ type: Type.UNARY, operator: operator, operand: operand }, token); },
    PercentOf: function (percent, base, token) { return at({ type: Type.PERCENT_OF, percent: percent, base: base }, token); },
    SquareRoot: function (operand, token) { return at({ type: Type.SQUARE_ROOT, operand: operand }, token); },
    Conversion: function (kind, operand, token) { return at({ type: Type.CONVERSION, kind: kind, operand: operand }, token); },
    TextFunction: function (fn, operand, token) { return at({ type: Type.TEXT_FUNCTION, fn: fn, operand: operand }, token); },
    MathFunction: function (fn, args, token) { return at({ type: Type.MATH_FUNCTION, fn: fn, args: args || [] }, token); },
    MathConstant: function (name, token) { return at({ type: Type.MATH_CONSTANT, name: name }, token); },
    RandomNumber: function (low, high, token) { return at({ type: Type.RANDOM_NUMBER, low: low, high: high }, token); },
    Condition: function (operator, left, right, token) {
      return at({ type: Type.CONDITION, operator: operator, left: left, right: right || null }, token);
    },

    // ---- Release 1.2 nodes -------------------------------------------------

    GameWindow: function (width, height, token) {
      return at({ type: Type.GAME_WINDOW, width: width, height: height }, token);
    },
    GameBackground: function (value, token) {
      return at({ type: Type.GAME_BACKGROUND, value: value }, token);
    },
    DefineActor: function (name, image, token) {
      return at({ type: Type.DEFINE_ACTOR, name: name, image: image }, token);
    },
    PlaceActor: function (name, x, y, token) {
      return at({ type: Type.PLACE_ACTOR, name: name, x: x, y: y }, token);
    },
    ActorAction: function (name, action, token) {
      return at({ type: Type.ACTOR_ACTION, name: name, action: action }, token);
    },
    /** set the image of the actor 'hero' to "<source>" */
    SetActorImage: function (name, image, token) {
      return at({ type: Type.SET_ACTOR_IMAGE, name: name, image: image }, token);
    },
    /** link the image "<source>" to the actor 'hero' */
    LinkImage: function (name, image, token) {
      return at({ type: Type.LINK_IMAGE, name: name, image: image }, token);
    },
    ActorSize: function (name, size, token) {
      return at({ type: Type.ACTOR_SIZE, name: name, size: size }, token);
    },
    GameLoop: function (body, token) {
      return at({ type: Type.GAME_LOOP, body: body || [] }, token);
    },
    StopGame: function (token) { return at({ type: Type.STOP_GAME }, token); },
    Touching: function (name, other, token) {
      return at({ type: Type.TOUCHING, name: name, other: other }, token);
    },
    KeyPressed: function (key, negated, token) {
      return at({ type: Type.KEY_PRESSED, key: key, negated: !!negated }, token);
    },
    WaitForKey: function (token) { return at({ type: Type.WAIT_FOR_KEY }, token); },
    WaitThen: function (duration, statement, timerName, token) {
      return at({ type: Type.WAIT_THEN, duration: duration, statement: statement || null, timerName: timerName || null }, token);
    },
    WaitNamed: function (duration, timerName, token) {
      return at({ type: Type.WAIT_NAMED, duration: duration, timerName: timerName }, token);
    },
    CancelWait: function (timerName, token) {
      return at({ type: Type.CANCEL_WAIT, timerName: timerName }, token);
    },
    WaitUntil: function (condition, limit, limitIsTime, token) {
      return at({ type: Type.WAIT_UNTIL, condition: condition, limit: limit || null, limitIsTime: !!limitIsTime }, token);
    },
    WaitForActor: function (name, limit, token) {
      return at({ type: Type.WAIT_FOR_ACTOR, name: name, limit: limit || null }, token);
    },

    /** Depth-first walk over a node tree. `visit(node)` runs before children. */
    walk: function (node, visit) {
      if (!node || typeof node !== 'object') return;
      visit(node);
      var self = this;
      Object.keys(node).forEach(function (key) {
        if (key === 'line' || key === 'column') return;
        var child = node[key];
        if (Array.isArray(child)) child.forEach(function (c) { self.walk(c, visit); });
        else if (child && typeof child === 'object' && child.type) self.walk(child, visit);
      });
    },

    describe: function (node) {
      if (!node) return '<empty>';
      var label = node.type;
      if (node.name) label += '(' + node.name + ')';
      if (node.operator) label += '(' + node.operator + ')';
      if (node.type === Type.LITERAL) label += '(' + JSON.stringify(node.value) + ')';
      if (node.type === Type.VARIABLE) label += "('" + node.name + "')";
      return label;
    }
  };

  EPP.AST = AST;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AST: AST };
  }
})(typeof window !== 'undefined' ? window : globalThis);
