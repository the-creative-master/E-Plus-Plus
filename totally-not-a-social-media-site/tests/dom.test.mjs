/**
 * dom.test.mjs - boots the real page in a headless DOM and exercises the
 * flows that do not need a media pipeline: the name gate, the feed, the
 * cards, the reactions, the upload dialog and the routing.
 *
 * Run with:  node totally-not-a-social-media-site/tests/dom.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let jsdomPkg = null;
try {
  const mod = await import("jsdom");
  jsdomPkg = mod.default || mod;
} catch (err) {
  console.log("• skipped dom.test.mjs - jsdom is not installed (npm i jsdom to run it)");
  process.exit(0);
}

const { JSDOM, VirtualConsole } = jsdomPkg;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const problems = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => {
  // jsdom cannot decode media, so media related errors are expected noise.
  if (/Not implemented|Could not load img|HTMLMediaElement/i.test(String(error && error.message))) return;
  problems.push("jsdomError: " + (error && error.stack ? error.stack : error));
});
virtualConsole.on("error", (...args) => problems.push("console.error: " + args.join(" ")));

const dom = new JSDOM(html, {
  url: "https://totally-not-a-social-media-site.test/index.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole
});

const { window } = dom;
const document = window.document;

// Load the page scripts exactly like the browser would, in order.
["js/videostorage.js", "js/stream-player.js", "js/app.js"].forEach((relative) => {
  window.eval(fs.readFileSync(path.join(ROOT, relative), "utf8"));
});
const inlineScripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map((match) => match[1]);
inlineScripts.forEach((code) => window.eval(code));
document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function run() {
  await new Promise((resolve) => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", resolve);
  });
  await wait(120);

  // --- the app booted -------------------------------------------------
  assert.ok(window.VideoStorage, "videostorage.js is loaded");
  assert.ok(window.StreamPlayer, "stream-player.js is loaded");
  assert.ok(document.querySelector(".brand__text strong"), "the brand renders");
  assert.equal(
    document.querySelector(".brand__text strong").textContent,
    "Totally Not A Social Media Site"
  );

  // --- the name gate --------------------------------------------------
  const gate = document.getElementById("gate");
  assert.ok(gate.classList.contains("is-open"), "the gate asks for a name on first visit");

  const input = document.getElementById("gate-name");
  input.value = "Anonymous_Otter_412";
  document.getElementById("gate-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await wait(60);

  assert.ok(!gate.classList.contains("is-open"), "the gate closes after BOOM");
  assert.ok(
    document.querySelector("#identity .identity__name strong").textContent.includes("Anonymous_Otter_412"),
    "the identity chip shows the chosen name"
  );

  // --- the empty feed -------------------------------------------------
  assert.ok(document.querySelector("#feed .empty"), "an empty state is shown when there is no video");
  assert.equal(document.getElementById("stat-videos").textContent, "0");

  // --- a video in the library ----------------------------------------
  const payload = new window.Blob([new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112])], {
    type: "video/mp4"
  });
  const entry = await window.VideoStorage.save({
    blob: payload,
    title: "A very important clip",
    description: "Smoke tested in a headless DOM.",
    tags: "dom, test",
    uploader: "Anonymous_Otter_412",
    uploaderId: window.VideoStorage.currentPersona().id,
    duration: 42,
    width: 1920,
    height: 1080
  });

  document.getElementById("search").dispatchEvent(new window.Event("input"));
  await wait(60);

  const card = document.querySelector('.card[data-id="' + entry.id + '"]');
  assert.ok(card, "the video is rendered as a card");
  assert.equal(card.querySelector(".card__title").textContent, "A very important clip");
  assert.equal(card.querySelector(".card__duration").textContent, "0:42");
  assert.equal(card.querySelectorAll(".chip").length, 2, "tags are rendered");
  assert.ok(card.querySelector('[data-action="trash"]'), "your own video gets a delete button");
  assert.ok(card.querySelector("video"), "the card carries a video element");

  // --- reactions ------------------------------------------------------
  const likeButton = card.querySelector('[data-action="like"]');
  likeButton.dispatchEvent(new window.Event("click", { bubbles: true }));
  await wait(30);
  assert.equal(likeButton.querySelector(".action__count").textContent, "1", "likes are counted");
  assert.ok(likeButton.classList.contains("is-active"), "the like button lights up");

  likeButton.dispatchEvent(new window.Event("click", { bubbles: true }));
  await wait(30);
  assert.equal(likeButton.querySelector(".action__count").textContent, "0", "liking twice unlikes");

  // --- comments -------------------------------------------------------
  const commentButton = card.querySelector('[data-action="comment"]');
  commentButton.dispatchEvent(new window.Event("click", { bubbles: true }));
  await wait(20);
  assert.ok(!card.querySelector(".card__comments").hidden, "the comment panel opens");
  const commentField = card.querySelector(".comment__input");
  commentField.value = "This is a comment.";
  card.querySelector(".comment__form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await wait(30);
  assert.equal(card.querySelectorAll(".comment").length, 1, "the comment is posted");
  assert.equal(commentButton.querySelector(".action__count").textContent, "1");

  // --- the upload dialog ----------------------------------------------
  document.getElementById("upload-btn").dispatchEvent(new window.Event("click", { bubbles: true }));
  await wait(20);
  assert.ok(
    document.getElementById("upload-modal").classList.contains("is-open"),
    "the upload dialog opens"
  );
  assert.ok(document.getElementById("upload-publish").disabled, "publishing is blocked without a file");
  document.getElementById("upload-close").dispatchEvent(new window.Event("click", { bubbles: true }));
  await wait(20);
  assert.ok(
    !document.getElementById("upload-modal").classList.contains("is-open"),
    "the upload dialog closes"
  );

  // --- routing --------------------------------------------------------
  window.location.hash = "#/u/Anonymous_Otter_412";
  await wait(60);
  assert.equal(document.getElementById("feed-title").textContent, "@Anonymous_Otter_412");
  assert.ok(document.querySelector(".card"), "the channel view keeps the video");

  window.location.hash = "#/new";
  await wait(60);
  assert.equal(document.getElementById("feed-title").textContent, "Fresh uploads");

  window.location.hash = "#/liked";
  await wait(60);
  assert.ok(document.querySelector(".empty"), "the liked view is empty after unliking");

  // --- side rails -----------------------------------------------------
  assert.equal(document.querySelectorAll("#availability .place").length, 8, "the ban list is rendered");
  assert.equal(document.getElementById("stat-videos").textContent, "1", "the stats count the video");

  if (problems.length) {
    throw new Error("Unexpected page errors:\n" + problems.join("\n"));
  }

  console.log("✓ page boots without errors");
  console.log("✓ name gate, feed, cards, likes, comments, upload dialog, routing");
  window.close();
}

run().catch((err) => {
  console.error("✗ " + (err && err.stack ? err.stack : err));
  if (problems.length) console.error(problems.join("\n"));
  process.exit(1);
});
