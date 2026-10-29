/* E++ 1.3.5 Draw: an animated, independent drawing surface for the Studio console.
 * Coordinates are measured in pixels from the centre; positive y is down.
 * The host keeps paths separately from cursors so clearing a drawing does not
 * move sprites. It has no dependency on the Game library or on the DOM.
 */
(function (global) {
  'use strict';
  var EPP = global.EPP || (global.EPP = {});
  var COLORS = ['#c4b5fd', '#67e8f9', '#fbbf77', '#86efac', '#f9a8d4', '#fcd34d'];
  var DEFAULT_SPEED = 240; // pixels per second; null means instant

  function DrawHost(canvas) {
    this.canvas = canvas;
    this.sprites = new Map();
    this.strokes = [];
    this.animations = new Set();
    this.pathVersion = 0;
    this.render();
  }

  DrawHost.prototype.create = function (name) {
    var key = String(name).trim().toLowerCase();
    this.stopAnimations(key);
    var sprite = { name: String(name).trim(), x: 0, y: 0, direction: 'up', penDown: true,
      speed: DEFAULT_SPEED, color: COLORS[this.sprites.size % COLORS.length] };
    this.sprites.set(key, sprite);
    this.render();
    return sprite;
  };

  DrawHost.prototype.get = function (name) {
    return this.sprites.get(String(name).trim().toLowerCase()) || null;
  };

  DrawHost.prototype.remove = function (name) {
    var key = String(name).trim().toLowerCase();
    this.stopAnimations(key);
    this.sprites.delete(key);
    this.render();
  };

  DrawHost.prototype.move = function (name, direction, distance) {
    var sprite = this.get(name);
    if (!sprite) return null;
    var fromX = sprite.x, fromY = sprite.y;
    if (direction === 'up') sprite.y -= distance;
    else if (direction === 'down') sprite.y += distance;
    else if (direction === 'left') sprite.x -= distance;
    else if (direction === 'right') sprite.x += distance;
    else throw new Error('Unknown drawing direction.');
    sprite.direction = direction;
    if (sprite.penDown && distance !== 0) {
      this.strokes.push({ x1: fromX, y1: fromY, x2: sprite.x, y2: sprite.y, color: sprite.color });
    }
    this.render();
    return sprite;
  };

  DrawHost.prototype.setSpeed = function (name, speed) {
    var sprite = this.get(name);
    if (!sprite) return null;
    if (speed === null || String(speed).toLowerCase() === 'instant') sprite.speed = null;
    else {
      var value = Number(speed);
      if (!Number.isFinite(value) || value <= 0 || value > 100000) throw new Error('Speed must be between 0 and 100000 pixels per second, or instant.');
      sprite.speed = value;
    }
    return sprite;
  };

  /** Stop promptly even when a browser has suspended animation frames. */
  DrawHost.prototype.stopAnimations = function (name) {
    this.animations.forEach(function (job) {
      if (!name || job.key === name) job.cancel();
    });
  };

  /**
   * Program movement takes real time, while move() remains immediate for the
   * manual controls. Each animation adds at most one stroke unless the pen,
   * drawing or cursor changes, so long movements do not create thousands of
   * segments. Manual movement is relative and remains usable during a run.
   */
  DrawHost.prototype.animateMove = function (name, direction, distance, options) {
    var self = this, sprite = this.get(name);
    if (!sprite) return Promise.resolve(null);
    if (!/^(up|down|left|right)$/.test(direction) || !Number.isFinite(distance)) return Promise.reject(new Error('Invalid drawing movement.'));
    var key = String(name).trim().toLowerCase();
    var settings = options || {};
    var notify = typeof settings.onFrame === 'function' ? settings.onFrame : function () {};
    if (sprite.speed === null || distance === 0) {
      self.move(name, direction, distance);
      notify(sprite);
      return self.flush().then(function () { return sprite; });
    }
    var now = function () { return global.performance && global.performance.now ? global.performance.now() : Date.now(); };
    return new Promise(function (resolve) {
      var remaining = distance, last = now(), handle = null, frameKind = '', done = false;
      var stroke = null, strokeVersion = self.pathVersion;
      function finish() {
        if (done) return;
        done = true;
        if (handle !== null) {
          if (frameKind === 'raf' && typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(handle);
          else clearTimeout(handle);
        }
        self.animations.delete(job);
        resolve(sprite);
      }
      var job = { key: key, cancel: finish };
      self.animations.add(job);
      function schedule() {
        if (typeof global.requestAnimationFrame === 'function') {
          frameKind = 'raf'; handle = global.requestAnimationFrame(tick);
        } else { frameKind = 'timeout'; handle = setTimeout(tick, 16); }
      }
      function tick() {
        handle = null;
        if (done || self.get(name) !== sprite || (settings.cancelled && settings.cancelled())) { finish(); return; }
        var time = now();
        var elapsed = Math.max(0, time - last) / 1000;
        last = time;
        var amount = sprite.speed === null ? Math.abs(remaining) : Math.min(Math.abs(remaining), sprite.speed * elapsed);
        var step = remaining < 0 ? -amount : amount;
        var fromX = sprite.x, fromY = sprite.y;
        if (direction === 'up') sprite.y -= step;
        else if (direction === 'down') sprite.y += step;
        else if (direction === 'left') sprite.x -= step;
        else sprite.x += step;
        // Avoid accumulating floating-point frame errors at the destination.
        if (Math.abs(remaining - step) < 1e-9) {
          sprite.x = Math.round(sprite.x * 1e9) / 1e9;
          sprite.y = Math.round(sprite.y * 1e9) / 1e9;
        }
        sprite.direction = direction;
        if (sprite.penDown && step !== 0) {
          if (!stroke || strokeVersion !== self.pathVersion || stroke.x2 !== fromX || stroke.y2 !== fromY || stroke.color !== sprite.color) {
            stroke = { x1: fromX, y1: fromY, x2: sprite.x, y2: sprite.y, color: sprite.color };
            strokeVersion = self.pathVersion;
            self.strokes.push(stroke);
          } else { stroke.x2 = sprite.x; stroke.y2 = sprite.y; }
        } else if (!sprite.penDown) stroke = null;
        remaining -= step;
        self.render();
        notify(sprite);
        if (Math.abs(remaining) < 1e-9) finish();
        else schedule();
      }
      schedule();
    });
  };

  DrawHost.prototype.setPen = function (name, down) {
    var sprite = this.get(name);
    if (!sprite) return null;
    sprite.penDown = !!down;
    this.render();
    return sprite;
  };

  DrawHost.prototype.setColor = function (name, color) {
    var sprite = this.get(name);
    if (!sprite) return null;
    sprite.color = color;
    this.render();
    return sprite;
  };

  DrawHost.prototype.clear = function () {
    this.strokes = [];
    this.pathVersion++;
    this.render();
  };

  DrawHost.prototype.reset = function () {
    this.stopAnimations();
    this.sprites.clear();
    this.strokes = [];
    this.pathVersion++;
    this.render();
  };

  DrawHost.prototype.render = function () {
    var canvas = this.canvas;
    var ctx = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#10111f';
    ctx.fillRect(0, 0, w, h);

    // A quiet grid makes pixel movements and the centre easy to see.
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(191, 190, 255, 0.07)';
    ctx.lineWidth = 1;
    for (var x = cx % 32; x < w; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (var y = cy % 32; y < h; y += 32) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(191, 190, 255, 0.18)';
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.strokes.forEach(function (stroke) {
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.moveTo(cx + stroke.x1, cy + stroke.y1);
      ctx.lineTo(cx + stroke.x2, cy + stroke.y2);
      ctx.stroke();
    });

    this.sprites.forEach(function (sprite) {
      var x = cx + sprite.x, y = cy + sprite.y;
      var angles = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angles[sprite.direction] || 0);
      // A small, recognisable pointer rather than an actor or image.
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(9, 9); ctx.lineTo(0, 5); ctx.lineTo(-9, 9); ctx.closePath();
      ctx.fillStyle = sprite.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#10111f';
      ctx.stroke();
      ctx.restore();
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = '#ede9fe';
      ctx.fillText(sprite.name, x + 14, y - 8);
    });
  };

  DrawHost.prototype.flush = function () {
    this.render();
    return new Promise(function (resolve) {
      if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(function () { resolve(); });
      else setTimeout(resolve, 0);
    });
  };

  EPP.DrawHost = DrawHost;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DrawHost: DrawHost };
})(typeof window !== 'undefined' ? window : globalThis);
