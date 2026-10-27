/**
 * smoke.mjs - headless checks for the parts of the site that do not need a
 * browser: the storage engine (catalogue, personas, export/import) and the
 * container planner used by the streaming player.
 *
 * Run with:  node totally-not-a-social-media-site/tests/smoke.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/* ------------------------------------------------------------ browser stubs */

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear()
};

globalThis.FileReader = class FileReaderStub {
  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        const base64 = Buffer.from(buffer).toString("base64");
        this.result = "data:" + (blob.type || "application/octet-stream") + ";base64," + base64;
        if (this.onload) this.onload();
      })
      .catch((err) => {
        this.error = err;
        if (this.onerror) this.onerror();
      });
  }
};

globalThis.MediaSource = class MediaSourceStub {
  static isTypeSupported(type) {
    return typeof type === "string" && /^video\/(mp4|webm)/.test(type);
  }
};

/* ------------------------------------------------------------------ helpers */

function loadScript(relative) {
  const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
  // Indirect eval keeps the file in global scope, exactly like a <script> tag.
  (0, eval)(source);
}

function box(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, Buffer.from(payload)]);
}

function fakeMp4() {
  const ftyp = box("ftyp", Buffer.from("isom0000isom"));
  const moov = box("moov", Buffer.alloc(64, 7));
  const mdat = box("mdat", Buffer.alloc(4096, 9));
  return Buffer.concat([ftyp, moov, mdat]);
}

function fakeWebm() {
  const header = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
  return Buffer.concat([header, Buffer.alloc(300 * 1024, 3)]);
}

/* -------------------------------------------------------------------- tests */

loadScript("js/videostorage.js");
loadScript("js/stream-player.js");

const VideoStorage = globalThis.VideoStorage;
const StreamPlan = globalThis.StreamPlan;

async function run() {
  await VideoStorage.init();
  assert.equal(VideoStorage.backend(), "local", "falls back to localStorage without IndexedDB");

  // --- personas -------------------------------------------------------
  const persona = VideoStorage.createPersona("Anonymous_Otter_412");
  assert.ok(persona, "persona is created");
  assert.equal(VideoStorage.currentPersona().name, "Anonymous_Otter_412");
  assert.equal(VideoStorage.createPersona("anonymous_otter_412").id, persona.id, "same name reuses persona");

  // --- catalogue ------------------------------------------------------
  const payload = fakeMp4();
  const blob = new Blob([payload], { type: "video/mp4" });
  const entry = await VideoStorage.save({
    blob,
    title: "Smoke test clip",
    description: "A synthetic MP4.",
    tags: "test, smoke",
    uploader: persona.name,
    uploaderId: persona.id,
    duration: 10,
    width: 1280,
    height: 720
  });

  assert.equal(VideoStorage.list().length, 1, "one catalogue entry");
  assert.deepEqual(entry.tags, ["test", "smoke"], "tags are normalised");
  assert.equal(VideoStorage.get(entry.id).title, "Smoke test clip");

  const stored = await VideoStorage.getBlob(entry.id);
  assert.ok(stored, "payload can be read back");
  const bytes = Buffer.from(await stored.arrayBuffer());
  assert.equal(bytes.length, payload.length, "payload survives the round trip");
  assert.deepEqual(bytes, payload, "payload bytes are identical");

  // --- reactions ------------------------------------------------------
  const reaction = VideoStorage.react(entry.id, "like");
  assert.equal(reaction.liked, true);
  assert.equal(VideoStorage.get(entry.id).likes, 1);
  assert.equal(VideoStorage.reactionState(entry.id).liked, true);
  VideoStorage.react(entry.id, "like");
  assert.equal(VideoStorage.get(entry.id).likes, 0, "liking twice unlikes");

  // --- export / import ------------------------------------------------
  const exported = await VideoStorage.exportJS();
  assert.ok(exported.includes("TNA_VIDEO_STORAGE"), "export is a videostorage.js file");
  const parsed = VideoStorage.__internals.parseStorageSource(exported);
  assert.equal(parsed.videos.length, 1);
  assert.ok(parsed.videos[0].data.startsWith("data:video/mp4;base64,"), "payload is embedded");

  memory.clear();
  const importResult = await VideoStorage.importJS(exported);
  assert.equal(importResult.added, 1, "import restores the library");
  assert.equal(VideoStorage.list().length, 1);
  const reimported = await VideoStorage.getBlob(VideoStorage.list()[0].id);
  assert.ok(reimported, "imported payload is readable");

  // --- container planner ---------------------------------------------
  const mp4Plan = await StreamPlan.forBlob(new Blob([payload], { type: "video/mp4" }), {
    duration: 10,
    name: "clip.mp4"
  });
  assert.equal(mp4Plan.mode, "stream", "a fast start MP4 is streamed");
  assert.equal(mp4Plan.container, "mp4");
  assert.ok(mp4Plan.init.ranges.length >= 1, "init segment is planned");
  assert.ok(mp4Plan.mediaFrom > mp4Plan.init.ranges[0].end, "media starts after the init segment");

  const webmPlan = await StreamPlan.forBlob(new Blob([fakeWebm()], { type: "video/webm" }), {
    duration: 6,
    name: "clip.webm"
  });
  assert.equal(webmPlan.mode, "stream", "WebM is streamed");
  assert.equal(webmPlan.container, "webm");

  const unknownPlan = await StreamPlan.forBlob(new Blob([new Uint8Array([1, 2, 3])], { type: "video/x-weird" }), {
    duration: 5,
    name: "clip.xyz"
  });
  assert.equal(unknownPlan.mode, "direct", "unknown containers fall back to direct playback");

  // --- chunking -------------------------------------------------------
  assert.equal(StreamPlan.chunkBytesFor(10 * 1024 * 1024, 100), 1024 * 1024, "ten seconds of a 100kb/s clip");
  assert.ok(StreamPlan.chunkBytesFor(1024, 0) >= 256 * 1024, "unknown duration falls back to a safe chunk");

  // --- atoms ----------------------------------------------------------
  const atoms = StreamPlan.parseMp4Atoms(new Uint8Array(payload));
  assert.equal(atoms.ftyp.type, undefined);
  assert.ok(atoms.moov, "moov atom found");
  assert.ok(atoms.mdat, "mdat atom found");
  assert.equal(atoms.mdat.payloadStart, atoms.mdat.start + 8, "mdat payload skips the 8 byte header");

  console.log("✓ videostorage: catalogue, personas, reactions, export/import");
  console.log("✓ stream-player: mp4/webm planning, chunking, fallbacks");
  console.log("all smoke tests passed");
}

run().catch((err) => {
  console.error("✗ " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
