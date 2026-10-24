/*
 * E++ Release 1.2 — Game library host.
 *
 * The pygame-zero half of E++: a game window, actors that carry an image,
 * movement, collisions and a game loop. Actors live in a small model here;
 * drawing happens on the canvas the Studio hands over. Nothing in this file
 * is needed by the language itself, which is why E++.zip leaves it out.
 *
 * An actor is created with an image (a data: URL from the Studio's image
 * button, or a plain file name) and its name then behaves like a variable:
 *
 *   create the actor 'hero' with the image "<data:...>"
 *   put the actor 'hero' at 320 and 240
 *   'hero' move right "4"
 *
 * Coordinates put (0, 0) at the middle of the window, which is what makes
 * `'hero' move up "10"` mean the same thing no matter the window size.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var COLOURS = {
    black: '#05070d', white: '#f8fafc', red: '#ef4444', green: '#22c55e',
    blue: '#3b82f6', yellow: '#fde047', cyan: '#22d3ee', magenta: '#e879f9',
    pink: '#f472b6', orange: '#fb923c', purple: '#a855f7', grey: '#64748b',
    gray: '#64748b', night: '#0b1026', sky: '#7dd3fc', ocean: '#0e7490',
    grass: '#16a34a', forest: '#14532d', sand: '#fde68a', sunset: '#f97316',
    space: '#01030a', paper: '#f1f5f9', slate: '#1e293b'
  };

  function colourFor(value) {
    var raw = String(value === undefined || value === null ? '' : value).trim();
    if (!raw) return COLOURS.night;
    var lower = raw.toLowerCase();
    if (COLOURS[lower]) return COLOURS[lower];
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
    if (/^(rgb|rgba|hsl|hsla)\(/i.test(raw)) return raw;
    if (/^data:image\//i.test(raw)) return raw;             // an image background
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;        // url(...) style
    // Unknown colour words become a stable colour instead of "transparent".
    var hash = 0;
    for (var i = 0; i < lower.length; i++) hash = (hash * 31 + lower.charCodeAt(i)) & 0xffffff;
    return '#' + ('000000' + hash.toString(16)).slice(-6);
  }

  function GameHost(canvas) {
    this.canvas = canvas || null;
    this.context = null;
    this.width = 800;
    this.height = 600;
    this.background = 'night';
    this.actors = Object.create(null);
    this.images = Object.create(null);
    this.running = false;
    this.frames = 0;
    this.rafId = null;
    this.frameHandler = null;
    this.canvasScale = 1;
    if (this.canvas && this.canvas.getContext) this.context = this.canvas.getContext('2d');
  }

  GameHost.prototype.attach = function (canvas) {
    this.canvas = canvas || this.canvas;
    if (this.canvas && this.canvas.getContext) this.context = this.canvas.getContext('2d');
    this.resizeCanvas();
    return this;
  };

  GameHost.prototype.setWindow = function (width, height) {
    this.width = Math.max(1, Math.round(Number(width) || 800));
    this.height = Math.max(1, Math.round(Number(height) || 600));
    this.resizeCanvas();
    return this;
  };

  GameHost.prototype.resizeCanvas = function () {
    if (!this.canvas) return;
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
  };

  GameHost.prototype.setBackground = function (value) {
    this.background = value === undefined || value === null || value === '' ? 'night' : String(value);
    return this;
  };

  GameHost.prototype.imageFor = function (source) {
    var src = String(source || '').trim();
    if (!src) return null;
    if (this.images[src]) return this.images[src];
    if (typeof Image === 'undefined') { this.images[src] = null; return null; }
    var image = new Image();
    image.__eppReady = false;
    var self = this;
    image.onload = function () { image.__eppReady = true; self.draw(); };
    image.onerror = function () { image.__eppFailed = true; self.draw(); };
    image.src = src;
    this.images[src] = image;
    return image;
  };

  GameHost.prototype.createActor = function (name, source) {
    var key = String(name).toLowerCase();
    var image = this.imageFor(source);
    var actor = this.actors[key] || {};
    actor.name = name;
    actor.source = String(source || '');
    actor.image = image;
    actor.x = actor.x || 0;
    actor.y = actor.y || 0;
    actor.scale = actor.scale || 1;
    actor.visible = actor.visible !== false;
    actor.paused = false;
    actor.stopped = false;
    this.actors[key] = actor;
    this.draw();
    return actor;
  };

  GameHost.prototype.actor = function (name) {
    return this.actors[String(name).toLowerCase()] || null;
  };

  GameHost.prototype.placeActor = function (name, x, y) {
    var actor = this.actor(name);
    if (!actor) return null;
    actor.x = Number(x) || 0;
    actor.y = Number(y) || 0;
    this.draw();
    return actor;
  };

  GameHost.prototype.moveActor = function (name, direction, pixels) {
    var actor = this.actor(name);
    if (!actor || actor.paused || actor.stopped) return null;
    var amount = Number(pixels) || 0;
    if (direction === 'up') actor.y -= amount;
    else if (direction === 'down') actor.y += amount;
    else if (direction === 'left') actor.x -= amount;
    else if (direction === 'right') actor.x += amount;
    return actor;
  };

  GameHost.prototype.setVisible = function (name, visible) {
    var actor = this.actor(name);
    if (!actor) return null;
    actor.visible = !!visible;
    this.draw();
    return actor;
  };

  GameHost.prototype.setScale = function (name, scale) {
    var actor = this.actor(name);
    if (!actor) return null;
    actor.scale = Math.max(0.05, Number(scale) || 1);
    this.draw();
    return actor;
  };

  GameHost.prototype.controlActor = function (name, action) {
    var self = this;
    if (name === '*') {
      Object.keys(this.actors).forEach(function (key) {
        self.actors[key].stopped = true;
        self.actors[key].paused = true;
      });
      return null;
    }
    var actor = this.actor(name);
    if (!actor) return null;
    if (action === 'show') actor.visible = true;
    else if (action === 'hide') actor.visible = false;
    else if (action === 'pause') actor.paused = true;
    else if (action === 'resume') { actor.paused = false; actor.stopped = false; }
    else if (action === 'stop') { actor.paused = true; actor.stopped = true; }
    this.draw();
    return actor;
  };

  GameHost.prototype.sizeOf = function (actor) {
    var width = (actor.image && actor.image.__eppReady ? actor.image.naturalWidth : 64) || 64;
    var height = (actor.image && actor.image.__eppReady ? actor.image.naturalHeight : 64) || 64;
    return { width: width * actor.scale, height: height * actor.scale };
  };

  /** The same rectangle maths the interpreter uses, so games agree everywhere. */
  GameHost.prototype.touching = function (nameA, nameB) {
    var a = this.actor(nameA);
    var b = this.actor(nameB);
    if (!a || !b || !a.visible || !b.visible) return false;
    var sizeA = this.sizeOf(a);
    var sizeB = this.sizeOf(b);
    return Math.abs(a.x - b.x) < (sizeA.width + sizeB.width) / 2 &&
      Math.abs(a.y - b.y) < (sizeA.height + sizeB.height) / 2;
  };

  GameHost.prototype.clear = function () {
    if (!this.context) return;
    var context = this.context;
    var fill = colourFor(this.background);
    if (/^data:image\//i.test(fill) || /^https?:/i.test(fill)) {
      var image = this.imageFor(fill);
      if (image && image.__eppReady) {
        context.drawImage(image, 0, 0, this.width, this.height);
        return;
      }
    }
    context.fillStyle = fill;
    context.fillRect(0, 0, this.width, this.height);
  };

  GameHost.prototype.draw = function () {
    if (!this.context) return;
    var context = this.context;
    var self = this;
    this.resizeCanvas();
    this.clear();

    // Faint centre cross, so (0, 0) is obvious while building a game.
    context.save();
    context.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(this.width / 2, 0);
    context.lineTo(this.width / 2, this.height);
    context.moveTo(0, this.height / 2);
    context.lineTo(this.width, this.height / 2);
    context.stroke();
    context.restore();

    Object.keys(this.actors).forEach(function (key) {
      var actor = self.actors[key];
      if (!actor.visible) return;
      var size = self.sizeOf(actor);
      var left = self.width / 2 + actor.x - size.width / 2;
      var top = self.height / 2 + actor.y - size.height / 2;

      if (actor.image && actor.image.__eppReady) {
        context.save();
        if (actor.stopped) context.globalAlpha = 0.55;
        context.drawImage(actor.image, left, top, size.width, size.height);
        context.restore();
      } else {
        // No picture yet (or it could not load): a labelled tile, so the
        // actor is still visible and keeps its place while you design.
        context.save();
        if (actor.stopped) context.globalAlpha = 0.55;
        context.fillStyle = actor.stopped ? '#475569' : 'rgba(56, 189, 248, 0.22)';
        context.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        context.lineWidth = 2;
        context.beginPath();
        if (context.roundRect) context.roundRect(left, top, size.width, size.height, 8);
        else context.rect(left, top, size.width, size.height);
        context.fill();
        context.stroke();
        context.fillStyle = '#e2e8f0';
        context.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(actor.name, left + size.width / 2, top + size.height / 2);
        context.restore();
      }
    });
  };

  /** Runs one frame of the game; the Studio's evaluator calls this per frame. */
  GameHost.prototype.tick = function () {
    this.frames += 1;
    this.draw();
  };

  GameHost.prototype.start = function (frameHandler) {
    this.running = true;
    this.frames = 0;
    this.frameHandler = frameHandler || null;
    this.draw();
    return this;
  };

  GameHost.prototype.stop = function () {
    this.running = false;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.draw();
    return this;
  };

  GameHost.prototype.reset = function () {
    this.actors = Object.create(null);
    this.images = Object.create(null);
    this.frames = 0;
    this.running = false;
    this.width = 800;
    this.height = 600;
    this.background = 'night';
    this.resizeCanvas();
    this.draw();
    return this;
  };

  EPP.GameHost = GameHost;
  EPP.GameColours = COLOURS;
  EPP.colourFor = colourFor;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameHost: GameHost, colourFor: colourFor };
  }
})(typeof window !== 'undefined' ? window : globalThis);
