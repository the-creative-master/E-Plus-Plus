/* E++ 1.3 Draw: a small, independent drawing surface for the Studio console.
 * Coordinates are measured in pixels from the centre; positive y is down.
 * The host keeps paths separately from cursors so clearing a drawing does not
 * move sprites. It has no dependency on the Game library or on the DOM.
 */
(function (global) {
  'use strict';
  var EPP = global.EPP || (global.EPP = {});
  var COLORS = ['#c4b5fd', '#67e8f9', '#fbbf77', '#86efac', '#f9a8d4', '#fcd34d'];

  function DrawHost(canvas) {
    this.canvas = canvas;
    this.sprites = new Map();
    this.strokes = [];
    this.render();
  }

  DrawHost.prototype.create = function (name) {
    var key = String(name).trim().toLowerCase();
    var sprite = { name: String(name).trim(), x: 0, y: 0, direction: 'up', penDown: true,
      color: COLORS[this.sprites.size % COLORS.length] };
    this.sprites.set(key, sprite);
    this.render();
    return sprite;
  };

  DrawHost.prototype.get = function (name) {
    return this.sprites.get(String(name).trim().toLowerCase()) || null;
  };

  DrawHost.prototype.remove = function (name) {
    this.sprites.delete(String(name).trim().toLowerCase());
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
    this.render();
  };

  DrawHost.prototype.reset = function () {
    this.sprites.clear();
    this.strokes = [];
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
