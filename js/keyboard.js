/*
 * E++ Release 1.2 — Keyboard.
 *
 * One place that knows what every key is called. `the "Up arrow" key is
 * pressed`, `the "space" key`, `the "a" key` and `mouse...` no — keyboard
 * only — all become the browser's own `KeyboardEvent.key` values, so the
 * Studio, the Game library and the interpreter agree on every name.
 *
 * The tracker keeps the keys that are down right now, which is what a game
 * loop needs (a key is not an event when you ask "is it pressed?").
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var ALIASES = {
    'up arrow': 'ArrowUp', uparrow: 'ArrowUp', arrowup: 'ArrowUp', 'arrow up': 'ArrowUp', up: 'ArrowUp',
    'down arrow': 'ArrowDown', downarrow: 'ArrowDown', arrowdown: 'ArrowDown', 'arrow down': 'ArrowDown', down: 'ArrowDown',
    'left arrow': 'ArrowLeft', leftarrow: 'ArrowLeft', arrowleft: 'ArrowLeft', 'arrow left': 'ArrowLeft', left: 'ArrowLeft',
    'right arrow': 'ArrowRight', rightarrow: 'ArrowRight', arrowright: 'ArrowRight', 'arrow right': 'ArrowRight', right: 'ArrowRight',
    space: ' ', 'space bar': ' ', spacebar: ' ', 'the space bar': ' ', 'the space key': ' ',
    enter: 'Enter', return: 'Enter', 'the enter key': 'Enter',
    escape: 'Escape', esc: 'Escape',
    tab: 'Tab', shift: 'Shift', control: 'Control', ctrl: 'Control', alt: 'Alt',
    backspace: 'Backspace', delete: 'Delete', any: '*', 'any key': '*'
  };

  function normalize(name) {
    var raw = String(name === undefined || name === null ? '' : name).trim();
    var lower = raw.toLowerCase();
    if (ALIASES[lower]) return ALIASES[lower];
    if (raw.length === 1) return lower;       // "a" / "A" / "1"
    return raw;                                // already a KeyboardEvent.key, e.g. "F5"
  }

  /** True for the words E++ accepts as key names. */
  function isKeyName(name) {
    var key = normalize(name);
    return !!key && (key === '*' || key.length === 1 || /^[A-Z]/.test(key) || /Arrow|Shift|Control|Alt|Enter|Escape|Tab|Backspace|Delete/.test(key));
  }

  /**
   * Tracks which keys are down. `attach(target)` listens on a window/element
   * and stops the page scrolling when an arrow key or space is used, because
   * otherwise playing a game scrolls the Studio page.
   */
  function Tracker(target) {
    this.down = Object.create(null);
    this.last = '';
    this.target = target || null;
    this.onKeyDown = null;
    this.onKeyUp = null;
    this.bound = false;
    this.capture = true;
  }

  Tracker.prototype.attach = function (target) {
    var self = this;
    var host = target || this.target || (typeof window !== 'undefined' ? window : null);
    if (!host || this.bound) return this;
    this.target = host;
    this.onKeyDown = function (event) {
      var key = event.key;
      self.down[key] = true;
      self.last = key;
      if (self.capture && self.shouldPreventScroll(event)) event.preventDefault();
    };
    this.onKeyUp = function (event) {
      self.down[event.key] = false;
    };
    host.addEventListener('keydown', this.onKeyDown);
    host.addEventListener('keyup', this.onKeyUp);
    this.bound = true;
    return this;
  };

  Tracker.prototype.detach = function () {
    if (!this.bound || !this.target) return this;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.bound = false;
    return this;
  };

  /**
   * True only when the key would scroll the page and nobody is typing.
   *
   * Space and the arrow keys scroll, which is why a game swallows them — but
   * swallowing them in the code editor, in a text box or in the console
   * would make the page impossible to use. So a field always keeps its keys.
   */
  Tracker.prototype.shouldPreventScroll = function (event) {
    var key = typeof event === 'string' ? event : (event && event.key) || '';
    if (key !== ' ' && key.indexOf('Arrow') !== 0) return false;
    var target = event && typeof event === 'object' ? event.target : null;
    if (this.isTypingTarget(target)) return false;
    return true;
  };

  /** True for anything that swallows typed text. */
  Tracker.prototype.isTypingTarget = function (target) {
    if (!target || typeof target !== 'object') return false;
    if (target.isContentEditable) return true;
    var tag = String(target.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return true;
    return false;
  };

  Tracker.prototype.reset = function () {
    this.down = Object.create(null);
    this.last = '';
  };

  Tracker.prototype.isDown = function (name) {
    var key = normalize(name);
    if (key === '*') return this.anyDown();
    return !!this.down[key];
  };

  Tracker.prototype.anyDown = function () {
    for (var key in this.down) { if (this.down[key]) return true; }
    return false;
  };

  EPP.Keys = {
    ALIASES: ALIASES,
    normalize: normalize,
    isKeyName: isKeyName,
    Tracker: Tracker
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Keys: EPP.Keys };
  }
})(typeof window !== 'undefined' ? window : globalThis);
