/*
 * E++ Release 1.2 — project files.
 *
 * A project that leaves the Studio is written in a container of its own,
 * never as plain text: the file is a base64 block with no readable header,
 * no marker line and no words in it.
 *
 * Each download gets a fresh 256-bit key. The key is never stored in the
 * file: the Studio keeps it in IndexedDB (see Keyring below), one entry per
 * project, so a project can be downloaded many times and every copy still
 * opens. Containers are authenticated, so a damaged or foreign file is
 * rejected instead of half-read.
 *
 * This is the reference implementation: lexer.py and src/vault.cpp read and
 * write the same bytes, and tests/run-tests.mjs keeps the three in step.
 * Maintainers: the layout is documented in the test-suite's cross-engine
 * checks rather than here, on purpose.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var MAGIC = [0x8b, 0xe7, 0x1c];
  var VERSION = 0x12;
  var HEADER_LENGTH = 16;   // magic + version + nonce
  var TAG_LENGTH = 32;
  var KEY_LENGTH = 32;
  var NONCE_LENGTH = 12;

  var BODY_LABEL = 'E++ Vault v1 encryption';
  var MAC_LABEL = 'E++ Vault v1 authentication';

  // ------------------------------------------------------------------
  // Byte helpers (no dependencies, works in browsers and in Node)
  // ------------------------------------------------------------------

  function utf8Encode(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(text));
    var bytes = [];
    var str = unescape(encodeURIComponent(String(text)));
    for (var i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
    return new Uint8Array(bytes);
  }

  function utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    var str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(str)); } catch (e) { return str; }
  }

  function concatBytes() {
    var total = 0;
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var part = arguments[i];
      var arr = part instanceof Uint8Array ? part : new Uint8Array(part);
      parts.push(arr);
      total += arr.length;
    }
    var out = new Uint8Array(total);
    var offset = 0;
    for (var j = 0; j < parts.length; j++) { out.set(parts[j], offset); offset += parts[j].length; }
    return out;
  }

  function bytesToBase64(bytes) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += chars[b0 >> 2];
      out += chars[((b0 & 3) << 4) | (b1 >> 4)];
      out += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      out += i + 2 < bytes.length ? chars[b2 & 63] : '=';
    }
    return out;
  }

  function base64ToBytes(text) {
    var clean = String(text).replace(/[\s\r\n]+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('not base64');
    if (clean.length % 4 !== 0) throw new Error('bad base64 length');
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var lookup = {};
    for (var c = 0; c < chars.length; c++) lookup[chars[c]] = c;
    var out = [];
    for (var i = 0; i < clean.length; i += 4) {
      var n0 = lookup[clean[i]];
      var n1 = lookup[clean[i + 1]];
      var n2 = clean[i + 2] === '=' ? 0 : lookup[clean[i + 2]];
      var n3 = clean[i + 3] === '=' ? 0 : lookup[clean[i + 3]];
      out.push((n0 << 2) | (n1 >> 4));
      if (clean[i + 2] !== '=') out.push(((n1 & 15) << 4) | (n2 >> 2));
      if (clean[i + 3] !== '=') out.push(((n2 & 3) << 6) | n3);
    }
    return new Uint8Array(out);
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return hex;
  }

  function hexToBytes(hex) {
    var clean = String(hex || '').replace(/[\s:-]+/g, '').toLowerCase();
    if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) throw new Error('That does not look like a hex key.');
    var out = new Uint8Array(clean.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  function randomBytes(length) {
    var out = new Uint8Array(length);
    var cryptoObj = global.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(out);
      return out;
    }
    throw new Error('E++ needs a secure random source (crypto.getRandomValues) to create project keys.');
  }

  function constantTimeEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  // Mask a 32-bit value. Used by both ChaCha20 and SHA-256 so the code is
  // identical whether or not the host has native 32-bit integers.
  function u32(x) { return x >>> 0; }

  // ------------------------------------------------------------------
  // SHA-256 + HMAC-SHA256
  // ------------------------------------------------------------------

  var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return u32((x >>> n) | (x << (32 - n))); }

  function sha256(bytes) {
    var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    var length = data.length;
    var bitLength = length * 8;
    var withPadding = new Uint8Array((((length + 9) + 63) / 64 | 0) * 64);
    withPadding.set(data);
    withPadding[length] = 0x80;
    // 64-bit big-endian length (JS numbers are exact below 2^53 bits)
    var high = Math.floor(bitLength / 0x100000000);
    var low = bitLength >>> 0;
    var end = withPadding.length;
    withPadding[end - 8] = (high >>> 24) & 0xff;
    withPadding[end - 7] = (high >>> 16) & 0xff;
    withPadding[end - 6] = (high >>> 8) & 0xff;
    withPadding[end - 5] = high & 0xff;
    withPadding[end - 4] = (low >>> 24) & 0xff;
    withPadding[end - 3] = (low >>> 16) & 0xff;
    withPadding[end - 2] = (low >>> 8) & 0xff;
    withPadding[end - 1] = low & 0xff;

    var w = new Array(64);
    for (var offset = 0; offset < withPadding.length; offset += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] = ((withPadding[offset + i * 4] << 24) |
          (withPadding[offset + i * 4 + 1] << 16) |
          (withPadding[offset + i * 4 + 2] << 8) |
          withPadding[offset + i * 4 + 3]) >>> 0;
      }
      for (var j = 16; j < 64; j++) {
        var s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        var s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = u32(w[j - 16] + s0 + w[j - 7] + s1);
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (var k = 0; k < 64; k++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = u32(hh + S1 + ch + SHA256_K[k] + w[k]);
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = u32(S0 + maj);
        hh = g; g = f; f = e; e = u32(d + temp1);
        d = c; c = b; b = a; a = u32(temp1 + temp2);
      }
      h[0] = u32(h[0] + a); h[1] = u32(h[1] + b); h[2] = u32(h[2] + c); h[3] = u32(h[3] + d);
      h[4] = u32(h[4] + e); h[5] = u32(h[5] + f); h[6] = u32(h[6] + g); h[7] = u32(h[7] + hh);
    }

    var out = new Uint8Array(32);
    for (var n = 0; n < 8; n++) {
      out[n * 4] = (h[n] >>> 24) & 0xff;
      out[n * 4 + 1] = (h[n] >>> 16) & 0xff;
      out[n * 4 + 2] = (h[n] >>> 8) & 0xff;
      out[n * 4 + 3] = h[n] & 0xff;
    }
    return out;
  }

  function hmacSha256(keyBytes, messageBytes) {
    var block = 64;
    var key = keyBytes instanceof Uint8Array ? keyBytes : new Uint8Array(keyBytes);
    if (key.length > block) key = sha256(key);
    var padded = new Uint8Array(block);
    padded.set(key);
    var inner = new Uint8Array(block + messageBytes.length);
    var outer = new Uint8Array(block + 32);
    for (var i = 0; i < block; i++) { inner[i] = padded[i] ^ 0x36; outer[i] = padded[i] ^ 0x5c; }
    inner.set(messageBytes, block);
    outer.set(sha256(inner), block);
    return sha256(outer);
  }

  // ------------------------------------------------------------------
  // ChaCha20 (RFC 7539): 20 rounds, 32-bit words, little-endian output
  // ------------------------------------------------------------------

  // The RFC writes these as left rotations by 16, 12, 8 and 7; a left
  // rotation by n is a right rotation by 32 - n, which is what is used here.
  function quarterRound(state, a, b, c, d) {
    state[a] = u32(state[a] + state[b]); state[d] = rotr(state[d] ^ state[a], 16);
    state[c] = u32(state[c] + state[d]); state[b] = rotr(state[b] ^ state[c], 20);
    state[a] = u32(state[a] + state[b]); state[d] = rotr(state[d] ^ state[a], 24);
    state[c] = u32(state[c] + state[d]); state[b] = rotr(state[b] ^ state[c], 25);
  }

  function chacha20Block(key, nonce, counter) {
    var constants = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]; // "expand 32-byte k"
    var state = new Array(16);
    state[0] = constants[0]; state[1] = constants[1]; state[2] = constants[2]; state[3] = constants[3];
    for (var i = 0; i < 8; i++) {
      state[4 + i] = (key[i * 4] | (key[i * 4 + 1] << 8) | (key[i * 4 + 2] << 16) | (key[i * 4 + 3] << 24)) >>> 0;
    }
    state[12] = u32(counter);
    state[13] = (nonce[0] | (nonce[1] << 8) | (nonce[2] << 16) | (nonce[3] << 24)) >>> 0;
    state[14] = (nonce[4] | (nonce[5] << 8) | (nonce[6] << 16) | (nonce[7] << 24)) >>> 0;
    state[15] = (nonce[8] | (nonce[9] << 8) | (nonce[10] << 16) | (nonce[11] << 24)) >>> 0;

    var working = state.slice();
    for (var round = 0; round < 10; round++) {
      quarterRound(working, 0, 4, 8, 12);
      quarterRound(working, 1, 5, 9, 13);
      quarterRound(working, 2, 6, 10, 14);
      quarterRound(working, 3, 7, 11, 15);
      quarterRound(working, 0, 5, 10, 15);
      quarterRound(working, 1, 6, 11, 12);
      quarterRound(working, 2, 7, 8, 13);
      quarterRound(working, 3, 4, 9, 14);
    }

    var out = new Uint8Array(64);
    for (var w = 0; w < 16; w++) {
      var value = u32(working[w] + state[w]);
      out[w * 4] = value & 0xff;
      out[w * 4 + 1] = (value >>> 8) & 0xff;
      out[w * 4 + 2] = (value >>> 16) & 0xff;
      out[w * 4 + 3] = (value >>> 24) & 0xff;
    }
    return out;
  }

  function chacha20Xor(key, nonce, input, counter) {
    var output = new Uint8Array(input.length);
    var blockCounter = counter === undefined ? 0 : counter;
    for (var offset = 0; offset < input.length; offset += 64) {
      var block = chacha20Block(key, nonce, blockCounter);
      blockCounter += 1;
      var limit = Math.min(64, input.length - offset);
      for (var i = 0; i < limit; i++) output[offset + i] = input[offset + i] ^ block[i];
    }
    return output;
  }

  // ------------------------------------------------------------------
  // Keys
  // ------------------------------------------------------------------

  function generateKey() {
    return randomBytes(KEY_LENGTH);
  }

  function deriveKeys(masterKey) {
    var master = masterKey instanceof Uint8Array ? masterKey : base64ToBytes(masterKey);
    if (master.length !== KEY_LENGTH) throw new Error('An E++ vault key must be 32 bytes.');
    return {
      body: hmacSha256(master, utf8Encode(BODY_LABEL)),
      tag: hmacSha256(master, utf8Encode(MAC_LABEL))
    };
  }

  /** A short public nickname for a key, safe to show in the UI. */
  function fingerprint(masterKey) {
    var master = masterKey instanceof Uint8Array ? masterKey : base64ToBytes(masterKey);
    var digest = sha256(concatBytes(utf8Encode('E++ Vault v1 fingerprint'), master));
    return bytesToHex(digest.slice(0, 3));
  }

  // ------------------------------------------------------------------
  // Envelope (what actually lands on disk)
  // ------------------------------------------------------------------

  function saveText(plaintext, masterKey) {
    var master = masterKey instanceof Uint8Array ? masterKey : base64ToBytes(masterKey);
    var derived = deriveKeys(master);
    var nonce = randomBytes(NONCE_LENGTH);
    var ciphertext = chacha20Xor(derived.body, nonce, utf8Encode(plaintext), 0);

    var header = concatBytes(new Uint8Array(MAGIC), new Uint8Array([VERSION]), nonce);
    var body = concatBytes(header, ciphertext);
    var tag = hmacSha256(derived.tag, body);
    var container = concatBytes(body, tag);

    // Wrap at 60 columns so editors do not choke on one enormous line, but
    // never with anything readable in it.
    var b64 = bytesToBase64(container);
    var lines = [];
    for (var i = 0; i < b64.length; i += 60) lines.push(b64.slice(i, i + 60));
    return lines.join('\n') + '\n';
  }

  function looksLikeVault(text) {
    try {
      var bytes = base64ToBytes(text);
      return bytes.length > HEADER_LENGTH + TAG_LENGTH &&
        bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1] && bytes[2] === MAGIC[2];
    } catch (e) {
      return false;
    }
  }

  /** Returns the plaintext, or throws a VaultError with an English reason. */
  function loadText(envelope, masterKey, filename) {
    var master = masterKey instanceof Uint8Array ? masterKey : base64ToBytes(masterKey);
    var name = filename || '<project>';
    var container;
    try {
      container = base64ToBytes(envelope);
    } catch (e) {
      throw vaultError('E511', 'This is not an E++ vault', name,
        'The file contains characters that are not part of an E++ project file.',
        'Download the project again from the E++ Studio, or check the file was not edited by hand.');
    }
    if (container.length < HEADER_LENGTH + TAG_LENGTH) {
      throw vaultError('E512', 'This E++ vault is too short', name,
        'The file is smaller than its own header, so part of it is missing.',
        'Download the project again to get a complete file.');
    }
    if (container[0] !== MAGIC[0] || container[1] !== MAGIC[1] || container[2] !== MAGIC[2]) {
      throw vaultError('E511', 'This is not an E++ vault', name,
        'The file does not start with the E++ vault signature.',
        'Only project files saved by the E++ Studio can be opened. Import a .enpp or .enppl file that E++ wrote.');
    }
    if (container[3] !== VERSION) {
      throw vaultError('E513', 'This E++ vault was written by a different release', name,
        'The file format version is ' + container[3] + ', but this Studio writes and reads version ' + VERSION + '.',
        'Open the file with the release of E++ that created it, then download it again from this Studio.');
    }

    var nonce = container.slice(4, 4 + NONCE_LENGTH);
    var tagOffset = container.length - TAG_LENGTH;
    var body = container.slice(0, tagOffset);
    var tag = container.slice(tagOffset);

    var derived = deriveKeys(master);
    var expected = hmacSha256(derived.tag, body);
    if (!constantTimeEqual(expected, tag)) {
      throw vaultError('E520', 'This key does not open this project', name,
        'The key was tried, but the file rejected it — either the key is from another project or the file has been changed.',
        'Import the project again and let the Studio try every saved key, or download the project again.');
    }

    var ciphertext = container.slice(HEADER_LENGTH, tagOffset);
    var plaintext = chacha20Xor(derived.body, nonce, ciphertext, 0);
    return utf8Decode(plaintext);
  }

  function vaultError(code, name, filename, reason, help) {
    var error = new Error(reason);
    error.code = code;
    error.name = name;
    error.filename = filename;
    error.reason = reason;
    error.help = help;
    error.isVaultError = true;
    return error;
  }

  // ------------------------------------------------------------------
  // Keyring — one key per project, all of them kept, newest first.
  //
  // The Studio stores this in IndexedDB. Outside a browser (tests, the CLI)
  // an in-memory store is used, and the CLI reads the same JSON shape from
  // a keyring file (see epp.py --keyring).
  // ------------------------------------------------------------------

  var KEYRING_RECORD = 'eplusplus.vault.keyring.v1';

  function MemoryKeyStore(initial) {
    this.records = initial ? initial.slice() : [];
  }
  MemoryKeyStore.prototype.load = function () { return Promise.resolve(this.records.slice()); };
  MemoryKeyStore.prototype.save = function (records) { this.records = records.slice(); return Promise.resolve(); };

  /**
   * IndexedDB-backed store. A single object store holds one record per key:
   *   { id, project, key, label, fingerprint, createdAt }
   * where `key` is the base64 master key and `project` is the project name.
   */
  function IndexedDbKeyStore(options) {
    options = options || {};
    this.dbName = options.dbName || 'eplusplus-vault';
    this.storeName = options.storeName || 'keys';
    this.dbPromise = null;
  }
  IndexedDbKeyStore.prototype.open = function () {
    var self = this;
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise(function (resolve, reject) {
      var factory = global.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null);
      if (!factory) { reject(new Error('IndexedDB is not available in this browser.')); return; }
      var request = factory.open(self.dbName, 1);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(self.storeName)) {
          var store = db.createObjectStore(self.storeName, { keyPath: 'id' });
          store.createIndex('project', 'project', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Could not open the E++ keyring.')); };
    });
    return this.dbPromise;
  };
  IndexedDbKeyStore.prototype.load = function () {
    var self = this;
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(self.storeName, 'readonly');
        var request = tx.objectStore(self.storeName).getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error); };
      });
    });
  };
  IndexedDbKeyStore.prototype.save = function (records) {
    var self = this;
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(self.storeName, 'readwrite');
        var store = tx.objectStore(self.storeName);
        records.forEach(function (record) { store.put(record); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  };

  function Keyring(store) {
    this.store = store || (typeof indexedDB !== 'undefined' ? new IndexedDbKeyStore() : new MemoryKeyStore());
    this.records = [];
    this.loaded = false;
    this.counter = 0;
  }

  Keyring.prototype.load = async function () {
    if (this.loaded) return this.records;
    this.records = (await this.store.load()) || [];
    this.loaded = true;
    return this.records;
  };

  Keyring.prototype.persist = async function () {
    await this.store.save(this.records);
  };

  Keyring.prototype.recordsFor = async function (project) {
    var all = await this.load();
    var wanted = String(project || '').toLowerCase();
    return all.filter(function (record) { return String(record.project || '').toLowerCase() === wanted; });
  };

  /**
   * Creates a brand new random key for a project and remembers it. Called on
   * every download, so each download of a project gets its own key while
   * earlier downloads keep working.
   */
  Keyring.prototype.createKeyFor = async function (project) {
    await this.load();
    var key = generateKey();
    var keyB64 = bytesToBase64(key);
    var record = {
      id: 'k' + Date.now().toString(36) + '-' + (this.counter++).toString(36) + '-' + bytesToHex(randomBytes(3)),
      project: String(project || 'project'),
      key: keyB64,
      label: 'Download ' + new Date().toISOString(),
      fingerprint: fingerprint(key),
      createdAt: new Date().toISOString()
    };
    this.records = this.records.concat([record]);
    await this.persist();
    return { key: keyB64, record: record, bytes: key };
  };

  /** Every key the Studio knows about, newest first — used when importing. */
  Keyring.prototype.allKeys = async function () {
    var all = await this.load();
    return all.slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  };

  Keyring.prototype.keyCount = async function () {
    return (await this.load()).length;
  };

  /**
   * Tries every remembered key against a vault. Returns
   *   { ok: true, text, record }  or  { ok: false, tried: n }
   * A corrupt file is reported separately with `corrupt: true` so the UI can
   * tell "wrong key" from "damaged file".
   */
  Keyring.prototype.openVault = async function (envelope, filename, extraKeys) {
    var candidates = (await this.allKeys()).map(function (record) {
      return { key: record.key, source: 'keyring', record: record };
    });
    (extraKeys || []).forEach(function (key) {
      candidates.push({ key: key, source: 'provided', record: null });
    });

    var lastWrongKey = null;
    for (var i = 0; i < candidates.length; i++) {
      try {
        var text = loadText(envelope, candidates[i].key, filename);
        return { ok: true, text: text, key: candidates[i].key, record: candidates[i].record, source: candidates[i].source, tried: i + 1 };
      } catch (error) {
        if (error.code === 'E520') { lastWrongKey = error; continue; }
        // Structural problem: trying more keys cannot help.
        return { ok: false, corrupt: true, error: error, tried: i + 1 };
      }
    }
    return { ok: false, corrupt: false, error: lastWrongKey, tried: candidates.length };
  };

  Keyring.prototype.exportJson = async function () {
    var all = await this.load();
    return JSON.stringify({ format: 'epp-vault-keyring', version: 1, keys: all }, null, 2);
  };

  Keyring.prototype.importJson = async function (json) {
    var parsed = typeof json === 'string' ? JSON.parse(json) : json;
    var incoming = (parsed && parsed.keys) || [];
    await this.load();
    var known = {};
    this.records.forEach(function (record) { known[record.key] = true; });
    var added = 0;
    for (var i = 0; i < incoming.length; i++) {
      var record = incoming[i];
      if (!record || !record.key || known[record.key]) continue;
      this.records = this.records.concat([{
        id: record.id || ('k' + Date.now().toString(36) + '-' + (this.counter++).toString(36)),
        project: record.project || 'imported',
        key: record.key,
        label: record.label || 'Imported key',
        fingerprint: record.fingerprint || fingerprint(record.key),
        createdAt: record.createdAt || new Date().toISOString()
      }]);
      known[record.key] = true;
      added += 1;
    }
    await this.persist();
    return added;
  };

  var Vault = {
    MAGIC: MAGIC,
    VERSION: VERSION,
    KEY_LENGTH: KEY_LENGTH,

    // primitives (exported so tests and tools can cross-check the format)
    sha256: sha256,
    hmacSha256: hmacSha256,
    chacha20Block: chacha20Block,
    chacha20Xor: chacha20Xor,

    base64Encode: bytesToBase64,
    base64Decode: base64ToBytes,
    utf8Encode: utf8Encode,
    utf8Decode: utf8Decode,
    hexToBytes: hexToBytes,
    bytesToHex: bytesToHex,
    concatBytes: concatBytes,
    randomBytes: randomBytes,

    generateKey: generateKey,
    deriveKeys: deriveKeys,
    fingerprint: fingerprint,
    saveText: saveText,
    loadText: loadText,
    looksLikeVault: looksLikeVault,
    error: vaultError,

    Keyring: Keyring,
    MemoryKeyStore: MemoryKeyStore,
    IndexedDbKeyStore: IndexedDbKeyStore,
    KEYRING_RECORD: KEYRING_RECORD
  };

  EPP.Vault = Vault;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Vault: Vault, Keyring: Keyring, MemoryKeyStore: MemoryKeyStore };
  }
})(typeof window !== 'undefined' ? window : globalThis);
