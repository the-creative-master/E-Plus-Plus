# Totally Not A Social Media Site

A parody of every social network that has ever asked you to log in, and of
every country that has ever answered with *"this page has been blocked"*.

* **No login.** No account, no password, no email, no phone number, no
  verification mail. Type a username, press **BOOM**, you are on the internet.
* **Real uploads.** Drag a video in, it is stored in your browser and streamed
  back in ten second chunks so it never lags.
* **Likes, dislikes, comments, views, tags, search, feeds.** All of it.
* **Every country on this site is fictional.** The jokes are about censorship
  in general, not about any real government.

```
totally-not-a-social-media-site/
├── index.html          # the whole site
├── css/site.css        # dark/light theme, responsive, no dependencies
├── js/videostorage.js  # the library: catalogue + payloads + export/import
├── js/stream-player.js # the streaming player (10 second chunks)
├── js/app.js           # feed, uploads, reactions, routing, personas
└── tests/              # headless checks (node)
```

## Run it

The site is completely static - no build step, no npm install, no server code:

```bash
python3 -m http.server 8000        # from the repository root
# then open http://localhost:8000/totally-not-a-social-media-site/
```

(`npm start` from the repository root does exactly the same thing.)

## How videos are stored

Everything lives in **`js/videostorage.js`**, in two tiers:

| Tier | What | Where |
| --- | --- | --- |
| Catalogue | title, uploader, likes, comments, tags, views, duration… | `localStorage` → `tnasm.catalog.v2` |
| Payloads | the video bytes and the poster frame | IndexedDB → `tnasm-video-storage` (falls back to `localStorage` when IndexedDB is unavailable) |

The catalogue entry is what the feed renders; the payload is what the player
streams. Nothing is ever sent to a server, because there is no server.

### Take the videos with you

`Charter → Export videostorage.js` writes a real JavaScript file that contains
the whole library, payloads included:

```js
(function (global) {
  global.TNA_VIDEO_STORAGE = {
    version: 2,
    exportedAt: "2026-10-27T…",
    videos: [
      { id: "v_…", title: "…", mime: "video/mp4", data: "data:video/mp4;base64,…" }
    ]
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
```

Drop that file next to `index.html` and the site picks it up on the next load -
`videostorage.js` is both the engine *and* the archive. Importing works the
other way round too: drag a `videostorage.js` file onto the page and the
library is restored.

## How playback never lags

`js/stream-player.js` treats every clip as a byte range problem:

1. A video is only touched when it scrolls into view (IntersectionObserver).
2. The plan is built from the container: for MP4 the `moov`/`mdat` atoms are
   parsed (including files where `moov` sits at the end), for WebM the EBML
   header is checked.
3. The **first ten seconds** are appended to a `MediaSource` as soon as the card
   appears, so the first frame is there before you press play.
4. While you watch, the next ten seconds are appended in the background. The
   player keeps roughly 15 seconds buffered ahead of the playhead.
5. Bytes you already watched are removed from the buffer again, so memory
   stays flat even for long videos.
6. If a browser refuses the codec (or the container is exotic), the player
   silently falls back to a direct blob URL. The video still plays, still
   seeks, still never lags.

The card HUD shows the mode (`STREAM` / `DIRECT`) and how many seconds are
buffered, so the behaviour is visible.

## Features

* **Personas.** A name is not an account. Create several and switch between
  them; likes and dislikes are tracked per persona.
* **Feeds.** For you (trending), Trending, Newest, Most appreciated, Liked by
  you, Your channel, plus per-user channels at `#/u/<name>`.
* **Search and tags.** `/` focuses the search box, `U` opens the upload dialog.
* **Demo clip.** No video file at hand? *Record a demo clip* generates a six
  second animated WebM in the browser and uploads it like any other file.
* **Sanitise mode.** Blurs every thumbnail behind a fake content passport.
* **Global availability.** A list of jurisdictions that have banned the site.
  All of them are made up.
* **Light and dark themes**, keyboard friendly, `prefers-reduced-motion` and
  `prefers-contrast` aware.

## Tests

```bash
node totally-not-a-social-media-site/tests/smoke.mjs   # storage + planner
npm i jsdom                                           # only needed for the DOM test
node totally-not-a-social-media-site/tests/dom.test.mjs # boots the page
```

`dom.test.mjs` boots the real `index.html` in a headless DOM and walks through
the name gate, the feed, the cards, likes, comments, the upload dialog and the
hash routing.

## Disclaimer

Parody. No real platform, company or person is represented, no real country is
named, and nobody's feed was harmed in the making of this site.
