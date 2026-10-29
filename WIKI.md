# E++ 1.3.5 Wiki

An approachable guide to E++, from your first line to games, animated drawings and shared projects. For exact syntax and diagnostic codes, see [LANGUAGE.md](LANGUAGE.md).

## Contents

- [What is E++?](#what-is-e)
- [Start and find your way around](#start-and-find-your-way-around)
- [Tutorial: output and maths](#tutorial-output-and-maths)
- [Tutorial: variables and questions](#tutorial-variables-and-questions)
- [Tutorial: decisions and loops](#tutorial-decisions-and-loops)
- [Tutorial: add a library](#tutorial-add-a-library)
- [Drawing with animated sprites](#drawing-with-animated-sprites)
- [Games and pictures](#games-and-pictures)
- [Community gallery and deployment](#community-gallery-and-deployment)
- [Saving, exporting and keys](#saving-exporting-and-keys)
- [Runtime and library differences](#runtime-and-library-differences)
- [Errors and troubleshooting](#errors-and-troubleshooting)
- [Keyboard and accessibility](#keyboard-and-accessibility)

## What is E++?

E++ is an English-like programming language. It has a browser Studio for writing and running projects, a native C++ command-line engine, and a Python runner. The engines share core language rules and project-file support, but not every visual feature or library is available in each engine.

The three rules to remember:

1. Use **double quotes for text**: `"Hello"`.
2. Use **single quotes for variable names**: `'score'`.
3. Write **maths without quotes**: `2 plus 3`.

`say hello` is not a text shortcut: it produces an unquoted-text error. Use `say "hello"`. Variable names are case-insensitive. Notes use `note [explanation]`; `#` and `//` are not E++ comments.

## Start and find your way around

Run `npm start` with Node.js 18 or newer, and open `http://localhost:8000` on the same machine. The server also provides the community gallery. Opening `index.html` directly works offline for the editor, Draw and Game, but cannot publish to the gallery.

- **Files:** select a project, create one, rename it or restore missing examples. Existing files are not overwritten by the restore action.
- **Code:** write your program; syntax highlighting and line numbers follow the editor. Use **Wrap** for long lines.
- **Output:** see text, errors and visual canvases. **Run code** executes; **Stop** interrupts a running program.
- **Libraries:** insert a library declaration. **Learn** opens interactive lessons, and **Wiki** opens this guide in the same tab. Use **Back to Studio** to return to your project.
- On narrow screens, switch between **Files**, **Code**, and **Output**, and use **Tools** to reach project actions.

The Studio keeps personal working files and linked pictures in the current browser. This is separate from the public gallery. Do not rely on a browser as your only backup: export important projects and their keyring.

## Tutorial: output and maths

Create a new `.enpp` file, type this and press **Run code**:

```text
note [My first program]
say "Hello, E++!"
say 7 plus 5
say 2 plus 3 times 4
say "2 plus 3"
```

The last line prints the words inside the quotes, not their calculated value. Arithmetic supports `plus`, `minus`, `times`, `divided by` and operators such as `+`, `-`, `*` and `/`. Parentheses can group arithmetic. A division by zero is an error.

## Tutorial: variables and questions

```text
let 'name' be "Ada"
let 'score' be 10
say "Hello, ", 'name'
let 'score' be 'score' plus 1
say "Score:", 'score'
ask "What is your name?" and save the output as 'visitor'
say "Welcome, ", 'visitor'
```

The `ask` line waits for input in the console. `let`, `define ... as`, and `set ... to` can assign values. `say` can join several pieces with commas; text still needs double quotes, and variable references need single quotes.

## Tutorial: decisions and loops

```text
let 'score' be 5
if 'score' is greater than 3 then say "Great work!"
otherwise say "Keep trying!"

repeat 3 times
  say "Practice makes progress."
end repeat

let 'count' be 1
while 'count' is less than 4 do
  say 'count'
  let 'count' be 'count' plus 1
end while
```

Place `otherwise` on the next line, not after the first `say`. Blocks can also use `if ... then:`, `else:` and `end if`. Close every `repeat`, `while`, and block `if` with the corresponding `end`. Syntax is checked even in a branch that does not run.

## Tutorial: add a library

A library unlocks extra words. Use a `.enppl` project and add it before using its features:

```text
add library "Math"
add library "Strings"
say the square root of 144
say the uppercase of "hello"
```

Other common libraries include Random, Time, Files, System and Python. The full Studio also offers Colors, Draw, Game and ImprovedWait. The ZIP has ImprovedWaitLite rather than ImprovedWait and does not contain Colors, Draw or Game. A missing declaration reports `E301`; a library not in that build reports `E302`.

## Drawing with animated sprites

Draw is available in the full Studio, not in `E++.zip` or the command-line engines. Any single-quoted variable name can become a visible, controllable cursor.

```text
add library "Draw"
define 'pencil' as drawing sprite
set the color of 'pencil' to "#ffcc88"
set the speed of 'pencil' to 200
'pencil' move right "100"
'pencil' move down "100"
'pencil' move left "100"
'pencil' move up "100"
```

- Each sprite starts at the centre, `(0, 0)`, with its pen down and its own color and speed. Right increases x; down increases y.
- Program moves animate at **240 pixels per second by default**. Set a positive speed up to 100,000 pixels per second: `set the speed of 'pencil' to 60`. You may use a numeric expression or variable.
- `set the speed of 'pencil' to instant` explicitly skips animation for that cursor. Change the speed again to restore animation.
- The console’s **Cursor** and **Speed** menus select and adjust a sprite, including while it moves. Arrow buttons move the selected cursor 10 pixels immediately; focus the canvas to use arrow keys, or hold Shift for one-pixel steps.
- `lift the pen of 'pencil'` moves without a trail; `lower the pen of 'pencil'` resumes drawing. `clear the drawing` clears trails without moving cursors. A new run resets them.
- A move waits for its animation before the program continues. **Stop** interrupts it at its current position. Assigning an ordinary value to a drawing variable removes that cursor.

## Games and pictures

Game is Studio-only. Start with `game_showcase.enppl`, or write:

```text
add library "Game"
set the game window to 640 by 480
set the game background to "night"
create the actor 'hero'
put the actor 'hero' at 0 and 0
'hero' move right "50"
```

Choose **Image** after adding Game, select a local picture, give it the name `hero`, and link it. The picture panel can insert the actor setup for you. Local files are decoded and resized before being linked; they are stored as embedded image data, not fetched from a remote server when the game runs. Transparency is preserved. The included example has two embedded starter pictures.

A broken or unsupported upload is refused with a message. If an older link or an external URL fails, the panel explains that it could not load and the game displays a labelled tile; unlink and upload the picture again. A URL or relative filename written in code still depends on that resource being available. Exported and gallery projects carry their linked embedded pictures.

The game window uses its centre as `(0, 0)`. `set the size of the actor 'hero' to 2` doubles its size. `show`, `hide`, and `if 'hero' is touching 'gem' then ...` work with actors. A `play the game` / `end the game` block runs once per frame. Add Keyboard for checks such as `if the "Up arrow" key is pressed then 'hero' move up "5"`; use **Stop game** or `stop the game` to finish. ImprovedWait adds actor pause, resume and wait features.

## Community gallery and deployment

The gallery is shared by everyone using the **same running server**. Open **Gallery**, fill in a title and optional author and description, and choose **Publish current project**. Code and embedded picture data are public. Choose **Open a copy** on a card to create a new local project; it does not overwrite your existing files and does not run automatically. Review other people’s code before running it.

The server validates and stores projects in a server-side `shared.js` file. Gallery reads use a same-origin API with no browser gallery cache. Clearing cookies, localStorage or IndexedDB does not delete published entries. An opened local copy, however, is an ordinary browser project and can be lost if local storage is cleared.

A local `npm start` is not a globally hosted service. To make one public and durable, deploy the Node server behind HTTPS with a writable persistent volume. Set `EPP_GALLERY_PATH=/data/shared.js`, `PORT`, and optionally `HOST` (default `0.0.0.0`). The Dockerfile in the full source checkout supports a volume mounted at `/data`; ensure it is writable by the container’s Node user. An ephemeral host, a static-only site, GitHub Pages or a fresh redeploy without a volume cannot retain published projects. There is no preconfigured central cloud service.

The server serializes concurrent writes and atomically replaces the file. Use **one server process per gallery file**; it is not a distributed database and does not coordinate multiple replicas. Back up `shared.js`; stop the server before restoring a backup. Do not expose the data file as an executable script. Corrupt data makes startup fail instead of silently resetting it.

The API accepts titles up to 80 characters, authors up to 60, descriptions up to 300, code up to 128 KB and up to 24 embedded images totalling roughly 1.2 MB. External image links are not included as gallery pictures: re-upload them locally first. The store caps its size at 50 MB and 2,000 projects. An oversized or invalid submission is rejected. Code may still contain URLs, which remain external dependencies.

Publishing is anonymous and public. There are no accounts, built-in moderation tools, deletion interface or spam protection. A public operator must provide suitable rate limiting, monitoring, moderation, backups and a way to handle takedown requests. Never publish credentials or private material. A server operator can remove entries from a backed-up gallery file while the server is stopped, taking care to preserve the JSON data structure.

## Saving, exporting and keys

The editor auto-saves working files in the browser. `.enpp` denotes a pure program; `.enppl` is used for programs with libraries. The command-line engines also accept older `.eppl` and `.eppla` examples.

**Export** downloads a sealed project and keeps its key in this browser. **Keys** can export a keyring file and import it on another machine. Keep the keyring private and back it up alongside the project; a sealed project cannot be opened without a matching key. The CLI accepts `--keyring epp-keys.json project.enppl`. Studio-exported projects include linked pictures. Gallery publication is different: it deliberately publishes an unsealed copy.

## Runtime and library differences

The Studio loads `src/lexer.cpp` compiled to WebAssembly and consumes its real tokens in a JavaScript evaluator. It is not running the C++ parser or interpreter in the browser. If the compiled lexer is unavailable, execution stops with `E601`; there is no silent alternate lexer.

The native `./epp` uses the C++ lexer, parser and interpreter. `python3 epp.py` uses the Python engine. Their core syntax and diagnostics overlap with Studio, but they do not provide its Draw or Game canvas. Studio translates a subset of Python to JavaScript and is not a full Python interpreter. The command-line Python bridge can run Python on the machine; only run code you trust.

In the full Studio: Math, Random, Strings, Colors, Console, Time, Files, System, Python, Keyboard, Draw, Game and ImprovedWait are available. In `E++.zip`: Colors, Draw, Game and ImprovedWait are unavailable, while ImprovedWaitLite is available. The archived native and Python runners also reject Colors. The full repository’s native and Python runners retain Colors. Availability does not imply identical OS, filesystem, Python or graphical behavior across engines.

Build the native engine with `make`, run tests with `make test` and `npm test`, and rebuild the archives with `make zip`. Browser regression tests require Playwright and a local Chromium executable; see the repository test scripts.

## Errors and troubleshooting

- **E101 / E102 / E105 / E106:** unknown or incomplete statement, unfinished quote, missing value or missing block ending. Check the indicated line and help text.
- **E201 / E202:** unknown variable or actor, or a variable name written incorrectly. Use single quotes for names and define them first.
- **E301 / E302 / E303:** add the necessary library, use the full Studio for a Studio-only library, or check its spelling.
- **E402:** a literal word such as `hello` needs double quotes. `say "hello"` is valid.
- **E403 / E407:** division by zero, or invalid Draw distance, speed or color. A speed is positive or `instant`.
- **E511–E522:** a sealed project is damaged or its key is missing. Import the keyring saved with that project.
- **E601:** the compiled C++ lexer could not load. Keep `js/native-lexer.js` and `js/native-lexer-wasm.js` alongside Studio and reload.
- **Gallery unavailable:** start the Node server; a static page and `file://` have no write API. If hosting in the cloud, check the volume, server logs, HTTPS and proxy configuration.
- **Picture is a tile:** choose Image, unlink the failed picture and upload a valid local file. A remote URL can be unavailable or blocked.

## Keyboard and accessibility

Use `Ctrl+Enter` or `Cmd+Enter` to run, and `Ctrl+S` or `Cmd+S` to save. Dialogs retain keyboard focus and close with Escape. The mobile workspace and Draw controls have touch targets; the canvas is keyboard-focusable. The Output panel is a live region. Use browser zoom, high-contrast mode and line wrapping as needed.
