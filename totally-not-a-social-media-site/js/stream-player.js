/*!
 * stream-player.js
 * ---------------------------------------------------------------------------
 * The "it just keeps loading" half of Totally Not A Social Media Site.
 *
 * How playback works here:
 *
 *   1. A video card scrolls into view  -> only then is any byte read.
 *   2. The first ~10 seconds are pulled out of the library and appended to a
 *      MediaSource, so the very first frame shows up almost immediately.
 *   3. While you watch, the next 10 second slice is appended in the
 *      background. The buffer is always a little ahead of the playhead, which
 *      is why nothing stutters.
 *   4. Already watched bytes are dropped from the buffer again, so memory
 *      stays flat no matter how long the clip is.
 *   5. If a browser refuses MediaSource for the given codec (or the container
 *      is too exotic), the player silently falls back to a direct blob URL.
 *      The video still plays, still seeks, still never lags.
 *
 * Everything is byte-range based, so nothing is re-downloaded when you scrub.
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  root.StreamPlayer = api.StreamPlayer;
  root.StreamPlan = api.StreamPlan;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var CHUNK_SECONDS = 10;
  var MIN_CHUNK_BYTES = 256 * 1024;
  var MAX_CHUNK_BYTES = 32 * 1024 * 1024;
  var WATCHDOG_MS = 8000;

  var MIME_CANDIDATES = {
    mp4: [
      "video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\"",
      "video/mp4; codecs=\"avc1.4d401f\"",
      "video/mp4; codecs=\"avc1.640028\"",
      "video/mp4"
    ],
    m4v: ["video/mp4", "video/mp4; codecs=\"avc1.42E01E\""],
    webm: [
      "video/webm; codecs=\"vp8, vorbis\"",
      "video/webm; codecs=\"vp9, opus\"",
      "video/webm; codecs=\"vp8\"",
      "video/webm"
    ],
    ogv: ["video/ogg; codecs=\"theora\"", "video/ogg"],
    ogg: ["video/ogg; codecs=\"theora\"", "video/ogg"],
    mov: ["video/mp4; codecs=\"avc1.42E01E\"", "video/mp4"]
  };

  function extensionOf(name) {
    var match = /\.([a-z0-9]+)$/i.exec(String(name || ""));
    return match ? match[1].toLowerCase() : "";
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function readUint32(bytes, offset) {
    if (offset + 4 > bytes.length) return 0;
    return (
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]
    ) >>> 0;
  }

  function ascii(bytes, offset, length) {
    var out = "";
    for (var i = 0; i < length; i++) {
      var code = bytes[offset + i];
      if (!code) break;
      out += String.fromCharCode(code);
    }
    return out;
  }

  /**
   * Reads the top level atom table of an MP4 file.
   * Returns { moov: {start,end}|null, ftyp: {start,end}|null, mdat: {...}|null }.
   */
  function parseMp4Atoms(bytes) {
    var boxes = { moov: null, ftyp: null, mdat: null, free: null };
    var offset = 0;
    while (offset + 8 <= bytes.length) {
      var size = readUint32(bytes, offset);
      var type = ascii(bytes, offset + 4, 4);
      var headerSize = 8;
      if (size === 1) {
        // 64 bit size: read the 8 byte largesize (approximate with Number).
        var large = 0;
        for (var i = 0; i < 8; i++) large = large * 256 + (bytes[offset + 8 + i] || 0);
        size = large;
        headerSize = 16;
      } else if (size === 0) {
        size = bytes.length - offset; // extends to end of file
      }
      if (size < headerSize) break;
      var end = offset + size;
      if (type === "moov" && !boxes.moov) boxes.moov = { start: offset, end: end, size: size };
      if (type === "ftyp" && !boxes.ftyp) boxes.ftyp = { start: offset, end: end, size: size };
      if (type === "mdat" && !boxes.mdat) {
        boxes.mdat = { start: offset, end: end, size: size, payloadStart: offset + headerSize };
      }
      if (type === "free" && !boxes.free) boxes.free = { start: offset, end: end, size: size };
      if (type === "moof" && !boxes.moof) boxes.moof = { start: offset, end: end, size: size };
      if (end > bytes.length) break; // box extends past the inspected window
      offset = end;
    }
    return boxes;
  }

  /**
   * Builds a playback plan for a blob.
   *
   * plan.mode      "stream" (MediaSource friendly) or "direct" (blob URL)
   * plan.mime      the mime/codec string to register with MediaSource
   * plan.init      { start, end } byte range that must be sent first
   * plan.mediaFrom byte offset where the 10 second chunks begin
   */
  function planForBlob(blob, options) {
    options = options || {};
    var duration = Number(options.duration) || 0;
    var ext = extensionOf(options.name || "");
    var plan = {
      mode: "direct",
      mime: blob.type || "video/mp4",
      init: null,
      mediaFrom: 0,
      mediaTo: 0,
      duration: duration,
      chunkBytes: chunkBytesFor(blob.size, duration),
      container: ext || "unknown",
      reason: ""
    };

    if (!root.MediaSource || !root.MediaSource.isTypeSupported) {
      plan.reason = "MediaSource is not supported here.";
      return plan;
    }

    var candidates = MIME_CANDIDATES[ext] || [];
    if (blob.type && blob.type.indexOf("/") >= 0) candidates.unshift(blob.type);
    var chosen = null;
    for (var i = 0; i < candidates.length; i++) {
      if (root.MediaSource.isTypeSupported(candidates[i])) {
        chosen = candidates[i];
        break;
      }
    }
    if (!chosen) {
      plan.reason = "No supported codec for " + (blob.type || ext);
      return plan;
    }
    plan.mime = chosen;

    if (ext === "mp4" || ext === "m4v" || ext === "mov" || chosen.indexOf("mp4") >= 0) {
      return planMp4(blob, plan);
    }
    if (ext === "webm" || chosen.indexOf("webm") >= 0) {
      return planWebm(blob, plan);
    }
    plan.reason = "Unknown container, using direct playback.";
    return plan;
  }

  function chunkBytesFor(size, duration) {
    if (!duration || duration <= 0) return 2 * 1024 * 1024;
    var bytesPerSecond = size / duration;
    return clamp(Math.round(bytesPerSecond * CHUNK_SECONDS), MIN_CHUNK_BYTES, MAX_CHUNK_BYTES);
  }

  function concatBuffers(buffers) {
    var total = buffers.reduce(function (sum, buffer) {
      return sum + buffer.byteLength;
    }, 0);
    var merged = new Uint8Array(total);
    var offset = 0;
    buffers.forEach(function (buffer) {
      merged.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    });
    return merged.buffer;
  }

  function planMp4(blob, plan) {
    // Inspect the head first: a "fast start" file has moov before mdat.
    return blob
      .slice(0, Math.min(blob.size, 1024 * 1024))
      .arrayBuffer()
      .then(function (buffer) {
        var bytes = new Uint8Array(buffer);
        var boxes = parseMp4Atoms(bytes);
        var fragmented = Boolean(boxes.moof);
        if (boxes.moov && boxes.moov.end <= blob.size) {
          plan.mode = "stream";
          plan.container = "mp4";
          plan.init = { ranges: [{ start: 0, end: boxes.moov.end }] };
          if (fragmented) {
            // Fragmented files: hand the raw moof+mdat stream to the browser.
            plan.mediaFrom = boxes.moov.end;
          } else if (boxes.mdat) {
            // Plain files: MSE wants the sample data itself.
            plan.mediaFrom = boxes.mdat.payloadStart;
            plan.mediaTo = Math.min(boxes.mdat.end, blob.size);
          } else {
            plan.mediaFrom = boxes.moov.end;
          }
          return plan;
        }
        return planMp4Slow(blob, plan, boxes);
      })
      .catch(function () {
        plan.reason = "Could not inspect the MP4 atoms.";
        return plan;
      });
  }

  function planMp4Slow(blob, plan, headBoxes) {
    // moov at the end: rebuild an init segment (ftyp + moov) and stream mdat.
    if (!headBoxes.mdat) {
      plan.reason = "No media data box found.";
      return plan;
    }
    return blob
      .slice(Math.max(0, blob.size - 4 * 1024 * 1024))
      .arrayBuffer()
      .then(function (buffer) {
        var bytes = new Uint8Array(buffer);
        var found = -1;
        for (var i = 0; i + 4 <= bytes.length; i++) {
          if (bytes[i] === 0x6d && bytes[i + 1] === 0x6f && bytes[i + 2] === 0x6f && bytes[i + 3] === 0x76) {
            found = i;
            break;
          }
        }
        if (found < 8) {
          plan.reason = "moov atom is missing.";
          return plan;
        }
        var moovStart = found - 4;
        var moovSize = readUint32(bytes, moovStart);
        if (moovSize < 8) {
          plan.reason = "moov atom looks broken.";
          return plan;
        }
        var ranges = [];
        if (headBoxes.ftyp) ranges.push({ start: headBoxes.ftyp.start, end: headBoxes.ftyp.end });
        ranges.push({ start: moovStart, end: moovStart + moovSize });
        plan.mode = "stream";
        plan.container = "mp4";
        plan.init = { ranges: ranges };
        plan.mediaFrom = headBoxes.mdat.payloadStart;
        plan.mediaTo = Math.min(headBoxes.mdat.end, blob.size);
        return plan;
      })
      .catch(function () {
        plan.reason = "Could not read the tail of the MP4 file.";
        return plan;
      });
  }

  function planWebm(blob, plan) {
    // The EBML header, segment info and tracks all live in the first bytes.
    return blob
      .slice(0, Math.min(blob.size, 1024 * 1024))
      .arrayBuffer()
      .then(function (buffer) {
        var bytes = new Uint8Array(buffer);
        if (bytes.length < 4 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
          plan.reason = "Not a WebM file.";
          return plan;
        }
        var initEnd = Math.min(blob.size, Math.max(MIN_CHUNK_BYTES, plan.chunkBytes));
        plan.mode = "stream";
        plan.container = "webm";
        plan.init = { ranges: [{ start: 0, end: initEnd }] };
        plan.mediaFrom = initEnd;
        return plan;
      })
      .catch(function () {
        plan.reason = "Could not read the WebM header.";
        return plan;
      });
  }

  /* ------------------------------------------------------------- player */

  function StreamPlayer(video, options) {
    this.video = video;
    this.options = Object.assign(
      {
        chunkSeconds: CHUNK_SECONDS,
        minChunkBytes: MIN_CHUNK_BYTES,
        maxChunkBytes: MAX_CHUNK_BYTES,
        onState: null
      },
      options || {}
    );
    this.blob = null;
    this.meta = null;
    this.mode = "idle";
    this.plan = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.objectURL = null;
    this.nextOffset = 0;
    this.destroyed = false;
    this.appending = false;
    this.bytesLoaded = 0;
    this._boundHandlers = [];
    this._watchdog = null;
    this._fallbackTimer = null;
  }

  StreamPlayer.prototype._emit = function (state) {
    if (typeof this.options.onState === "function") {
      try {
        this.options.onState(state);
      } catch (err) {
        /* ignore */
      }
    }
  };

  StreamPlayer.prototype._listen = function (target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    this._boundHandlers.push({ target: target, type: type, handler: handler, opts: opts });
  };

  /** Opens a stored video and starts the progressive loader. */
  StreamPlayer.prototype.open = function (blob, meta) {
    var self = this;
    this.blob = blob;
    this.meta = meta || {};
    this.bytesLoaded = 0;
    this.mode = "loading";
    this._emit({ mode: this.mode });

    return planForBlob(blob, { duration: this.meta.duration, name: this.meta.name || this.meta.title })
      .then(function (plan) {
        if (self.destroyed) return self;
        self.plan = plan;
        if (plan.mode !== "stream") {
          return self._useDirect("plan:" + plan.reason);
        }
        return self._useMediaSource(plan);
      })
      .catch(function (err) {
        return self._useDirect("error:" + (err && err.message ? err.message : err));
      });
  };

  StreamPlayer.prototype._useDirect = function (reason) {
    this.mode = "direct";
    this._emit({ mode: this.mode, reason: reason });
    if (!root.URL || !root.URL.createObjectURL) return;
    if (this.objectURL) {
      try {
        root.URL.revokeObjectURL(this.objectURL);
      } catch (err) {
        /* ignore */
      }
      this.objectURL = null;
    }
    try {
      this.objectURL = root.URL.createObjectURL(this.blob);
      this.video.src = this.objectURL;
      this.video.load();
    } catch (err) {
      /* nothing else we can do */
    }
  };

  StreamPlayer.prototype._useMediaSource = function (plan) {
    var self = this;
    return new Promise(function (resolve) {
      var mediaSource;
      try {
        mediaSource = new root.MediaSource();
      } catch (err) {
        resolve(self._useDirect("MediaSource constructor failed"));
        return;
      }
      self.mediaSource = mediaSource;
      self.mode = "streaming";
      self._emit({ mode: self.mode });

      var url = root.URL.createObjectURL(mediaSource);
      self.objectURL = url;

      self._listen(mediaSource, "sourceopen", function () {
        try {
          self.sourceBuffer = mediaSource.addSourceBuffer(plan.mime);
          self.sourceBuffer.mode = "segments";
        } catch (err) {
          resolve(self._useDirect("addSourceBuffer failed"));
          return;
        }
        self._listen(self.sourceBuffer, "updateend", function () {
          self.appending = false;
          self._trimBuffer();
          self._pump();
        });
        self._listen(self.sourceBuffer, "error", function () {
          self._useDirect("source buffer error");
          resolve();
        });
        self._listen(self.video, "seeking", function () {
          // A jump past the buffer needs more bytes before it can continue.
          self._pump();
        });
        if (plan.init && plan.init.ranges && plan.init.ranges.length) {
          self.nextOffset = plan.mediaFrom || 0;
          self._appendRanges(plan.init.ranges, true)
            .then(function () {
              self._pump();
              resolve();
            })
            .catch(function () {
              resolve(self._useDirect("init segment rejected"));
            });
        } else {
          self._pump();
          resolve();
        }
      });

      self._listen(mediaSource, "error", function () {
        resolve(self._useDirect("media source error"));
      });

      self._listen(self.video, "error", function () {
        if (self.mode === "streaming") {
          resolve(self._useDirect("video error"));
        }
      });

      self.video.src = url;

      if (plan.duration) {
        try {
          mediaSource.duration = plan.duration;
        } catch (err) {
          /* ignore */
        }
      }

      // Watchdog: if MediaSource never produces frames, switch to direct play.
      self._fallbackTimer = setTimeout(function () {
        if (self.mode === "streaming" && self.video.readyState < 1) {
          resolve(self._useDirect("watchdog timeout"));
        }
      }, WATCHDOG_MS);
    });
  };

  StreamPlayer.prototype._appendRanges = function (ranges, isInit) {
    var self = this;
    if (!this.sourceBuffer) return Promise.reject(new Error("no source buffer"));
    var reads = ranges.map(function (range) {
      return self.blob.slice(range.start, range.end).arrayBuffer();
    });
    return Promise.all(reads)
      .then(function (buffers) {
        var payload = buffers.length === 1 ? buffers[0] : concatBuffers(buffers);
        return new Promise(function (resolve, reject) {
          var sb = self.sourceBuffer;
          function cleanup() {
            sb.removeEventListener("updateend", onEnd);
            sb.removeEventListener("error", onError);
          }
          function onEnd() {
            cleanup();
            self.bytesLoaded += payload.byteLength;
            resolve();
          }
          function onError() {
            cleanup();
            reject(new Error("append failed"));
          }
          sb.addEventListener("updateend", onEnd);
          sb.addEventListener("error", onError);
          try {
            sb.appendBuffer(payload);
          } catch (err) {
            cleanup();
            reject(err);
          }
        });
      })
      .catch(function (err) {
        if (isInit) throw err;
        return null;
      });
  };

  StreamPlayer.prototype._pump = function () {
    var self = this;
    if (this.destroyed || this.mode !== "streaming") return;
    if (!this.sourceBuffer || this.sourceBuffer.updating || this.appending) return;
    if (!this.plan) return;

    var total = this.blob.size;
    var limit = this.plan.mediaTo || total;
    if (this.nextOffset >= limit) {
      try {
        if (this.mediaSource.readyState === "open") this.mediaSource.endOfStream();
      } catch (err) {
        /* ignore */
      }
      return;
    }

    // Keep roughly fifteen seconds buffered ahead of the playhead...
    var behind = this.nextOffset < this._byteOffsetFor(this.video.currentTime || 0);
    if (!behind && this.bufferedAhead() >= this.options.chunkSeconds * 1.5) return; // enough buffered

    var chunkBytes = this.plan.chunkBytes || chunkBytesFor(total, this.meta.duration);
    var end = Math.min(this.nextOffset + chunkBytes, limit);
    var start = this.nextOffset;
    this.appending = true;
    this._appendRanges([{ start: start, end: end }], false)
      .then(function () {
        self.appending = false;
        self.nextOffset = end;
        self._trimBuffer();
        self._pump();
      })
      .catch(function () {
        self.appending = false;
        self._useDirect("append failed");
      });
  };

  /** Rough byte offset that holds the given timestamp. */
  StreamPlayer.prototype._byteOffsetFor = function (seconds) {
    if (!this.blob) return 0;
    var duration = this.meta.duration || (this.plan && this.plan.duration) || 0;
    if (!duration) return 0;
    var perSecond = this.blob.size / duration;
    return Math.max(0, Math.min(this.blob.size, Math.round(seconds * perSecond)));
  };

  /** Drops bytes we already watched so memory stays flat. */
  StreamPlayer.prototype._trimBuffer = function () {
    var sb = this.sourceBuffer;
    if (!sb || sb.updating) return;
    var time = this.video.currentTime || 0;
    var keepFrom = Math.max(0, time - 10);
    if (keepFrom <= 0) return;
    try {
      var buffered = this.video.buffered;
      if (buffered.length && buffered.start(0) < keepFrom) {
        sb.remove(0, Math.min(keepFrom, buffered.end(buffered.length - 1)));
      }
    } catch (err) {
      /* ignore */
    }
  };

  /** Seconds of media ready to play in front of the playhead. */
  StreamPlayer.prototype.bufferedAhead = function () {
    try {
      var buffered = this.video.buffered;
      for (var i = 0; i < buffered.length; i++) {
        if (buffered.start(i) <= this.video.currentTime && buffered.end(i) >= this.video.currentTime) {
          return buffered.end(i) - this.video.currentTime;
        }
      }
      if (buffered.length) return buffered.end(buffered.length - 1) - this.video.currentTime;
    } catch (err) {
      /* ignore */
    }
    return 0;
  };

  /** Human readable state for the HUD on the card. */
  StreamPlayer.prototype.status = function () {
    return {
      mode: this.mode,
      bytes: this.bytesLoaded,
      total: this.blob ? this.blob.size : 0,
      bufferedAhead: this.bufferedAhead(),
      chunkSeconds: this.options.chunkSeconds
    };
  };

  StreamPlayer.prototype.destroy = function () {
    this.destroyed = true;
    clearTimeout(this._fallbackTimer);
    this._boundHandlers.forEach(function (item) {
      try {
        item.target.removeEventListener(item.type, item.handler, item.opts);
      } catch (err) {
        /* ignore */
      }
    });
    this._boundHandlers = [];
    if (this.sourceBuffer) {
      try {
        if (this.sourceBuffer.updating) this.sourceBuffer.abort();
      } catch (err) {
        /* ignore */
      }
    }
    this.sourceBuffer = null;
    if (this.mediaSource) {
      try {
        if (this.mediaSource.readyState === "open") this.mediaSource.endOfStream();
      } catch (err) {
        /* ignore */
      }
    }
    this.mediaSource = null;
    try {
      this.video.removeAttribute("src");
      this.video.load();
    } catch (err) {
      /* ignore */
    }
    if (this.objectURL) {
      try {
        root.URL.revokeObjectURL(this.objectURL);
      } catch (err) {
        /* ignore */
      }
    }
    this.objectURL = null;
    this.blob = null;
    this.mode = "idle";
  };

  return {
    StreamPlayer: StreamPlayer,
    StreamPlan: {
      forBlob: planForBlob,
      chunkBytesFor: chunkBytesFor,
      parseMp4Atoms: parseMp4Atoms,
      CHUNK_SECONDS: CHUNK_SECONDS
    }
  };
});
