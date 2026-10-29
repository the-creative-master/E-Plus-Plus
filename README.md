# E++ 1.3.5

E++ is a small, English-like programming language with a browser Studio, a C++ command-line engine and a Python runner. Write text in double quotes, variables in single quotes, and maths as numbers and words.

```text
let 'name' be "Ada"
say "Hello, ", 'name'
say 2 plus 3 times 4
```

## What’s new in 1.3.5

- **Community gallery:** publish a copy of a project, including embedded Game pictures, and open other people’s projects as new copies. The gallery is stored in the server’s `shared.js`, not in browser storage.
- **Animated Draw:** each drawing cursor has its own speed in pixels per second, plus an explicit instant mode. The console also has a speed selector and manual controls.
- **More reliable Game pictures:** local files are decoded before they can be linked, transparent images stay transparent, and broken links explain how to repair them. The example images are included offline.
- **Fresh documentation:** start with the tutorials below, open **Learn** in Studio, or read the [complete wiki](WIKI.md) and [language reference](LANGUAGE.md).
- **Smaller standalone library set:** `E++.zip` no longer includes the Colors library. Draw, Game and ImprovedWait remain Studio-only; ImprovedWaitLite is in the ZIP. Strict errors remain in both builds.

The 1.3 responsive Studio, named drawing cursors, project files, strict diagnostics and compiled C++ browser lexer are retained. Upgrading never overwrites existing local projects.

## Start the Studio

Requirements: Node.js 18 or newer. No npm packages are needed to run the server.

```bash
npm start
```

Open `http://localhost:8000` on that machine. On phones, use the **Files / Code / Output** tabs and the **Tools** menu. The editor saves personal working copies in this browser. **Learn** opens the interactive lessons; **Wiki** opens the offline guide in the same tab, with a link back to Studio.

You can also open `index.html` directly for offline editing, Draw and Game. The public gallery requires the Node server; a static website or `file://` cannot write server data.

## Quick tutorials

### 1. Say hello

Create a file, type the following and press **Run code**:

```text
say "Hello, world!"
say 7 plus 5
```

Text needs double quotes. `say hello` is an error (`E402`), not a shortcut for printing text.

### 2. Variables and questions

```text
ask "What is your name?" and save the output as 'name'
say "Hello, ", 'name'
let 'score' be 10
say "Next score:", 'score' plus 1
```

Type your answer in the console. Variable names use single quotes and are case-insensitive.

### 3. Decisions and loops

```text
let 'count' be 1
while 'count' is less than 4 do
  say 'count'
  let 'count' be 'count' plus 1
end while
```

Try `repeat 3 times` … `end repeat`, or an `if ... then` followed by `otherwise` on the next line. Notes use `note [text]`.

### 4. Draw an animated square (full Studio)

```text
add library "Draw"
define 'pencil' as drawing sprite
set the speed of 'pencil' to 200
'pencil' move right "100"
'pencil' move down "100"
'pencil' move left "100"
'pencil' move up "100"
```

The default speed is 240 pixels/second. Change it per sprite with `set the speed of 'pencil' to 60`, `600`, or `instant`. The console’s speed menu can change the selected cursor while it moves; arrows move it manually. **Stop** interrupts an animation. Draw is not in `E++.zip`.

### 5. Make a Game actor (full Studio)

1. Add `add library "Game"` to a `.enppl` project. The **Image** button appears.
2. Choose a local PNG, JPG, GIF, WEBP or SVG, name it `hero`, and link it. The panel inserts the actor code.
3. Run the program. `create the actor 'hero'` uses the picture linked to that name. You can add `put the actor 'hero' at 0 and 0` to position it at the centre.

An unreadable upload is refused; a broken existing link shows a message and a labelled tile. Upload the file again to relink it. Local uploads are embedded; URLs and relative paths in code still depend on those external resources.

## Community gallery and cloud hosting

1. Open **Gallery**, enter a title and optional name and description, then **Publish current project**. Code and embedded pictures become public to everyone using that server. Do not publish secrets.
2. Other visitors select **Open a copy**. The original is not overwritten or executed automatically. A copied project becomes a normal local working copy.
3. The server writes `shared.js` on its own filesystem, using serialized, atomic writes. Browsers fetch it through the same-origin API and do not cache the gallery in localStorage, IndexedDB or cookies. Clearing browser data does not erase published projects.

**A cloud deployment is not included automatically.** `npm start` shares the gallery only with people who can reach that server. For a persistent public gallery, deploy `server.js` on an always-on Node host with HTTPS and a writable persistent volume. Set `EPP_GALLERY_PATH` to a file named `shared.js` on that volume, for example:

```bash
EPP_GALLERY_PATH=/data/shared.js PORT=8000 npm start
```

Alternatively, from the full source checkout, build the included `Dockerfile` and mount a persistent volume at `/data` writable by the container’s Node user. Use one server process per gallery file; the bundled file store does not coordinate multiple replicas. Back up `shared.js` and restore it while the server is stopped. An ephemeral preview, static host, GitHub Pages, or a redeploy without a persistent volume is **not** durable cloud storage. Each deployment has its own gallery; there is no preconfigured central service.

Anyone who can reach the API can publish without an account. The included server has size limits but no accounts, moderation interface, spam protection or automatic removal; a public operator should arrange moderation, backups, HTTPS and appropriate rate limiting. See [the wiki](WIKI.md#community-gallery-and-deployment) for limits and safety notes.

## Command-line engines and testing

In the full source checkout, use:

```bash
make                           # build the native C++ engine
./epp -e 'say 2 plus 3'
python3 epp.py -e 'say "Hello"'
make test                      # C++ and Python regression suite
npm test                       # JavaScript, diagnostics, lexer and gallery tests
make zip                       # rebuild E++.zip and epp_language.zip
```

The full repository’s C++ and Python runners can use Colors, but have no Draw or Game canvas. The copies and native binary inside `E++.zip` reject Colors, Draw and Game with a helpful error, including after rebuilding from the ZIP’s source. In an extracted ZIP, `make`, `make test` and `npm start` work; rebuilding release archives and the `npm test` scripts require the full source checkout. For detailed build differences, see [LANGUAGE.md](LANGUAGE.md#13-which-libraries-are-in-ezip).

In the full checkout, after `make zip`, run `npm run test:distribution` to check the extracted archives. Optional end-to-end tests require `npm install` and a Chromium/Chrome executable: set `EPP_BROWSER` to its path, then run `npm run test:studio` and `npm run test:distribution:browser`.

## Projects and safety

**Export** downloads a sealed project; **Keys** exports or imports the keyring needed to open it on another browser or machine. Keep both safe. Gallery publishing is different: it deliberately makes a public, unsealed copy of your code and embedded pictures. Don’t run untrusted projects without reviewing them; native Python integration can execute Python on your computer.

The Studio uses `src/lexer.cpp` compiled to offline WebAssembly and consumes its tokens in a JavaScript evaluator. The native CLI separately uses the C++ parser and interpreter; the browser does not run those components. If the compiled lexer is unavailable, Studio stops with `E601` rather than silently falling back. See [WIKI.md](WIKI.md) for architecture, limitations and troubleshooting.

Licensed under [Apache 2.0](LICENSE); third-party notices are in `third_party/licenses/`.
