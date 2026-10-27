# E++ Programming Language [1.3]
> **"Looks like English, feels like English, and is English"**

**E++ 1.3** brings a completely redesigned Studio, **Project No Wrongs**
(stricter syntax and clearer diagnostics), and **Draw**, a Studio-only drawing
library. The native C++ engine, Python runtime and browser Studio continue to
share E++ project files and the same core language rules.

## What's new in 1.3

- **A new Studio:** an editor-first workspace, syntax highlighting, searchable
  files, library and guide panels, a live console, local autosave and responsive
  Workspace / Code / Output views on mobile. Run and Stop remain available, as
  do tutorials, project keys, pictures and the Game library.
- **Project No Wrongs:** unknown statements are errors, not output. Text must
  be double-quoted: `say hello` is an `E402` error; use `say "hello"`. The
  Studio and the C++ and Python engines report locations, reasons and fixes,
  including for syntax in branches that do not execute.
- **Draw, only in the full Studio:** any named drawing sprite appears as a
  cursor in the console. Move several independent cursors with code or with the
  on-screen and keyboard controls. **Draw is not included in `E++.zip`.**
- **Safe upgrade:** existing browser projects and tutorial progress are kept;
  restoring missing examples does not overwrite your files.

### Migrating older code

Put literal text in double quotes and variable names in single quotes:

```text
note [Old: say hello or let 'Student' be Sam]
say "hello"
let 'Student' be "Sam"
say 'Student'
```

Use `note [text]` for notes. Unknown commands, incomplete expressions,
unclosed quotes and missing libraries now produce diagnostics instead of
being silently treated as text. These checks also apply to `E++.zip`.

---

## 🆕 What is new in 1.2.1 — Language Patch 1

| Change | What it means |
| --- | --- |
| **Names mean pictures** | A project now keeps a picture book. Link a picture to a name once — `hero` — and `create the actor 'hero'` uses it, every run, with no image data in the program at all. |
| **New words** | `link the image "hero.png" to the actor 'hero'` binds a name inside the program, and `set the image of the actor 'hero' to "gem.png"` swaps a picture while it runs. `create the actor 'hero'` no longer needs `with the image`. |
| **Actors show while the game runs** | The picture is loaded *before* the actor is drawn, and the canvas is given a frame after the statements that change it, so a game is visible while it runs instead of only after it stops. |
| **A real picture panel** | The 🖼 Image button opens a panel with a drop zone, a preview, the name field and every picture linked in this project. Drag a file in, name it, press Link — no prompt, no pasted blob. |
| **Pictures travel** | A project with pictures keeps them in its own file, so a downloaded game opens with its sprites. Projects without pictures are plain code, exactly as before. |

### Also in 1.2.1: the Studio fixes

A small release that fixes what 1.2 got wrong and tidies what it left rough.

| Change | What it means |
| --- | --- |
| **ImprovedWaitLite moved to `E++.zip` only** | The Studio now offers **ImprovedWait** (which already includes every lite feature) and no longer lists ImprovedWaitLite at all. No page shows two ways to wait. |
| **Actor images work** | Adding a picture writes a program that runs (`create the actor 'hero'` plus `put the actor 'hero' at 0 and 0`), so `'hero'` really is the actor afterwards. Images with `//` inside (every data URL) are no longer mistaken for comments. |
| **A 💡 Suggest button** | Ideas are posted to the project's public issue tracker, so the whole community can see, reply to and vote on them — not just the person who typed them. The panel also lists what everyone else has suggested. |
| **Cleaner layout** | The toolbar is grouped (files · learn · tools · run) with dividers, the stats bar is split into labelled groups with the golden rules as fine print, and the small panels line up. |
| **Quieter editor** | Space and the arrow keys scroll the page again instead of being swallowed, and the Studio asks with its own dialogs instead of the browser's `prompt`/`confirm`. |

---

## 🆕 What is new in 1.2

| Feature | What it gives you | In `E++.zip`? |
| --- | --- | --- |
| **Tutorials** | Card-by-card lessons in the Studio, each one checked against real output | ✅ |
| **Keyboard** | `if the "Up arrow" key is pressed then ...` — arrows, space, enter and every letter | ✅ |
| **ImprovedWaitLite** | Named waits, `wait until`, `wait at most`, `wait ... and then ...`, `cancel the wait` | ✅ |
| **Game** | A game window, actors that carry an image, movement, collisions, a game loop | ❌ Studio only |
| **ImprovedWait** | Everything in ImprovedWaitLite **plus** actors: wait for an actor, pause/resume/stop another actor | ❌ Studio only |

The **Image** button appears in the Studio as soon as a project adds the Game
library: type an actor name, pick a picture, and that name then behaves like a
variable that loads the image.

---

## 💾 Projects and keys

Saving and opening projects needs no ceremony: **Export** downloads the project,
**Import** opens it again, and the Studio keeps track of which key belongs
to which project so you never type one. Nothing about how a project file is
built is worth knowing to use E++, so this manual does not describe it.

- **Export** downloads the file and keeps its key in this browser.
- **Import** opens a project saved by E++ — anywhere, as long as this browser
  still has its key.
- **🔑 Keys** lists the keys this browser holds, exports them as
  `epp-keys.json`, and imports a keyring from another machine.
- If you move a project to another computer, take the keyring with it:

  ```bash
  ./epp --keyring epp-keys.json game.enppl
  ./epp --key 5f0c…c9 game.enppl
  ```

A file that E++ did not save is refused instead of half-read, and the CLI says
the same thing.

The repository ships one saved example, `examples/17_saved_project.enpp`, and
the key that opens it in `examples/epp-keys.json`. The Studio imports that
example keyring on first boot, so the demo opens everywhere, and every engine
reads the same file:

```bash
./epp --keyring examples/epp-keys.json examples/17_saved_project.enpp
python3 epp.py --keyring examples/epp-keys.json examples/17_saved_project.enpp
```

---

## ⚡ The 3 Golden Rules of E++

1. **NO quotes for Math**:
   - `say 1 plus 1` ➔ Evaluates to `2`
   - `say 2 times 3` ➔ Evaluates to `6`
2. **SINGLE quotes for Variables**:
   - `let 'Grade' be 29`
   - `let 'Student' be "Sam"`
   - *Never use double quotes for variable names!*
3. **DOUBLE quotes for Strings**:
   - `say "Hello, World!"`
   - `say "1 + 1"` ➔ Outputs literal text `"1 + 1"`.

---

## 📝 Notes & Comments

Comments are written with `note` and **square brackets**:

```text
note [This is a comment note in E++]
note [Notes are ignored during execution and document your program]
```

> ⚠️ `//` and `#` are rejected with a deterministic `E101` error.

---

## 🧭 Deterministic diagnostics

Errors include a code, a source location, a reason and a suggested fix. The
precise caret position can vary by engine:

```text
[E++ Error E103: Invalid Otherwise Placement] --> script.enpp:5:28
   5 | if 'Score' is 100 then say "Perfect" otherwise say "Good"
     |                            ^
 = Reason: 'otherwise' cannot be placed on the same line as 'if ... then'.
 = Help: In E++, 'otherwise' always has to be on the next line immediately following the 'if' statement.
```

| Code | Meaning |
| --- | --- |
| `E101` | Unknown or malformed statement, invalid note or comment |
| `E102` | Unterminated string or variable name |
| `E103` | `otherwise` on the same line as `if ... then` |
| `E104` | `otherwise` without a preceding `if` |
| `E105` | Missing or incomplete value |
| `E106` | Missing or mismatched block ending |
| `E201` | Undefined variable, or an actor that was never created |
| `E202` | Golden Rule 2 violation (double quotes for a variable) |
| `E301` | Library not added (feature used before `add the "…" library`) |
| `E302` | Library exists, but not in this build of E++ |
| `E303` | Unknown library name |
| `E401` | Golden Rule 1 violation (math in quotes) |
| `E402` | Golden Rule 3 violation (unquoted word used as text) |
| `E403` | Division by zero |
| `E404` | File not found |
| `E405` | Invalid value or loop limit |
| `E407` | Invalid drawing distance or color |
| `E511`–`E522` | A project file that will not open (not a project, damaged, wrong release, no key, wrong key, bad `--key`) |
| `E601` | The compiled C++ browser lexer is unavailable |
| `E701` | Python `turtle` is prohibited |
| `E702` | Python runtime exception |

---

## 📚 Libraries

Add any library with the humanizer syntax `add the "<Name>" library`.

### Python (`"Python"`)
```text
add the "Python" library
run the python code "print('Hello from Python')"
```
Multi-line blocks keep their indentation. In the browser, Python is a **limited
JavaScript translation**, with partial shims for modules such as `math`,
`random`, and `json`; it is not a full CPython interpreter. The Python CLI uses
its installed Python runtime. `turtle` is prohibited everywhere (`E701`).

### Math (`"Math"`), Random (`"Random"`), Strings (`"Strings"`), Colors (`"Colors"`), Console (`"Console"`), Time (`"Time"`), Files (`"Files"`), System (`"System"`)
The classic libraries, unchanged: square roots and percentages, dice and coins,
uppercase and length, ANSI colours, `clear the console`, dates and timestamps,
file read/write/append, and system commands.

### Draw (`"Draw"`) — full Studio only

```text
add the "Draw" library
define 'pencil' as drawing sprite
'pencil' move right "80"
'pencil' move down "60"
set the color of 'pencil' to "#67e8f9"
lift the pen of 'pencil'
'pencil' move left "40"
lower the pen of 'pencil'
'pencil' move up "60"
```

Every `define`, `let` or `set` that assigns `drawing sprite` creates a named
cursor in the console. Sprites start at the center with the pen down; movement
uses quoted pixel distances and leaves a colored trail. Each cursor has its own
position, color and pen. Use `clear the drawing` or **Clear drawing** to erase
trails without moving the cursors; running again resets the surface.

Select a cursor in the console and use its arrow buttons, or focus the drawing
surface and press arrow keys (hold Shift to move one pixel instead of ten).
Draw and Game can be used together in the full Studio. **Draw is not shipped in
`E++.zip` or the CLI runtimes**; trying to add it there reports `E302`.
See [LANGUAGE.md](LANGUAGE.md#9a-the-draw-library-studio-only) for details.

### Game (`"Game"`) — Studio only
The pygame zero of E++: a window, actors with images, movement, collisions and
a game loop.

```text
add the "Game" library
add the "Keyboard" library

set the game window to 640 by 480
set the game background to "night"

note [Link a picture to the name hero with the 🖼 Image button first]
create the actor 'hero'
put the actor 'hero' at 0 and 120
note [An actor size is a multiplier: 1 is normal, 2 is twice as big]
set the size of the actor 'hero' to 2

play the game
  if the "Up arrow" key is pressed then 'hero' move up "5"
  if the "Down arrow" key is pressed then 'hero' move down "5"
end the game
```

- `create the actor 'hero'` — the name `hero` is already linked to a picture in
  the project, so the code stays short. The actor's name then behaves like a
  variable that loads that image.
- `create the actor 'hero' with the image "<picture>"` still works when the
  picture is written in the line itself (a file name or `data:` URL).
- `link the image "hero.png" to the actor 'hero'` links a name from inside the
  program; `set the image of the actor 'hero' to "gem.png"` changes it later.
- `put the actor 'hero' at X and Y` — `0 and 0` is the middle of the window.
- `show` / `hide` / `pause` / `resume` / `stop` the actor, `stop every actor`.
- `if 'hero' is touching 'gem' then ...` tests two actors' boxes.
- `play the game ... end the game` runs the body once per frame; **Stop Game**
  in the Studio ends it early.

### Keyboard (`"Keyboard"`)
```text
add the "Keyboard" library

if the "Up arrow" key is pressed then say "Up!"
if the "Space" key is pressed then say "Jump!"
if the "a" key is pressed then say "Left-ish!"
say "The last key was: ", the key pressed
wait for a key press
```
Key names are forgiving: `"Up arrow"`, `"arrow up"`, `"Up"` and `"up"` are the
same key, the same goes for down, left and right, and the quotes are optional —
`if the Up arrow key is pressed then ...` is the same sentence. `"Space"`, `"Enter"`,
`"Escape"`, `"Tab"`, `"Shift"`, `"Control"`, `"Alt"`, `"Backspace"`,
`"Delete"` and every single letter work too. `any` means "any key".

### ImprovedWaitLite (`"ImprovedWaitLite"`) — `E++.zip` only
The cut-down waiting engine. It is part of the standalone `E++.zip` download and
is **not** in E++ Studio, which has the full `ImprovedWait` library instead.

```text
add the "ImprovedWaitLite" library

note [A named wait can be cancelled from anywhere in the program]
wait 2 seconds as 'intro'
cancel the wait 'intro'

note [Run a statement after the pause finishes]
wait 1 second and then say "Ready!"

note [Wait for a condition, with or without a deadline]
wait until 'score' is greater than 9
wait at most 5 seconds until 'ready' is 1
```

### ImprovedWait (`"ImprovedWait"`) — Studio only
Everything in ImprovedWaitLite, plus control over actors:

```text
add the "ImprovedWait" library

wait for the actor 'hero' to finish
pause the actor 'enemy'
resume the actor 'enemy'
stop the actor 'enemy'
stop every actor
```

`ImprovedWait` includes every ImprovedWaitLite feature; ImprovedWaitLite does
**not** include the actor features. So each build ships exactly one of them:
the Studio has `ImprovedWait`, and `E++.zip` — which leaves the game library
out — has `ImprovedWaitLite`. Writing `add the "ImprovedWaitLite" library` in
the Studio says where that library lives instead of failing obscurely.

---

## 📦 What is inside `E++.zip`

`E++.zip` contains the native C++ engine, Python runtime, a standalone
browser workspace, examples and documentation. It includes strict 1.3
syntax and diagnostics. Its browser workspace includes **Keyboard** and
**ImprovedWaitLite**, but not **Draw**, **Game**, or **ImprovedWait**. Their
runtimes and dependent examples are omitted; adding one reports `E302`.
Use the full Studio for Draw and Game. The full Studio offers ImprovedWait
instead of ImprovedWaitLite.

---

## 🛠️ CLI Quickstart

### Native C++ engine
```bash
make clean && make

./epp examples/16_release_showcase.enppl
./epp -e 'say 1 plus 1'
./epp                                    # REPL

# Saving and opening project files
./epp --new-key
./epp --key <64 hex> project.enpp
./epp --keyring epp-keys.json project.enpp
./epp --save project.enpp -o saved.enpp
./epp --open saved.enpp --key <64 hex>
```

### Standalone Python runtime
```bash
python3 epp.py examples/16_release_showcase.enppl
python3 epp.py --new-key
python3 epp.py --keyring epp-keys.json examples/16_release_showcase.enppl
```

Both read the same keyring file the Studio exports (`epp-keys.json`), look for
`EPP_KEYRING` or a published key next to the project when none is given, and
report the same `E5xx` diagnostics.

### Tests and packaging

From the full repository checkout:

```bash
npm install      # installs the small browser-test dependency
npm test         # JS core, diagnostics, Draw, and compiled C++ lexer checks
make test        # CLI tests plus native C++ / WebAssembly lexer comparison
make zip         # rebuilds E++.zip and epp_language.zip

# Optional: real browser checks (use your local Chrome/Chromium executable)
EPP_BROWSER=/path/to/chromium npm run test:studio
```

The browser lexer is built from `src/lexer.cpp`, `include/lexer.hpp`, and
`src/wasm_lexer.cpp` using Zig's WASI C++ toolchain. After editing those files,
regenerate the offline artifact with `ZIG=/path/to/zig make wasm-lexer` and
rerun the tests. The generated `js/native-lexer-wasm.js` embeds the compiled
WebAssembly so `file://` works without a server. Its source fingerprint is
checked by the test suite.

---

## 🌐 E++ Studio (`index.html`)

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
```

- Studio **actually lexes each program with `src/lexer.cpp`**, compiled to
  WebAssembly and embedded for offline use. Its tokens drive Studio's
  JavaScript evaluator, including literals and arithmetic; the browser does
  **not** run `src/parser.cpp` or `src/interpreter.cpp`. The native CLI uses
  those C++ components. Simple programs normally finish quickly; there is no
  lookup of example outputs. If the compiled lexer cannot load, Studio reports
  `E601` rather than silently switching to a different lexer. `epp_language.zip`
  is a downloadable runtime bundle, not an execution dependency.
- **New / Import / Save / Export** for `.enpp` and `.enppl`; exported projects
  are encrypted with keys saved in the browser. Edits are also saved locally.
- On phones and tablets, use **Workspace**, **Code**, and **Output** at the
  bottom to switch panels. **Tools** contains project actions, Learn, and the
  other utilities; **Run code** switches to Output, and **Stop** interrupts a run.
- **Wrap** keeps long lines readable without changing your code or its line
  numbers. It defaults on when space is tight and remembers your choice.
- **🎓 Learn** opens the card-by-card tutorials described below; on small
  screens, **Lessons** opens the course list.
- **🔑 Keys** lists saved keys and exports / imports a keyring.
- **🖼 Image** adds an actor image to a Game project.
- **📦 E++.zip** downloads the standalone release described above.
- The game pane (canvas + **Stop Game**) appears when a program opens the Game
  library.

---

## 🎓 Tutorials

Press **🎓 Learn** in the Studio. Lessons are **cards**, one idea at a time, and
a card is only finished when your program is **run and its output checked** —
copying a sample from the card and pressing *Run & check* is never enough on
its own.

| Course | Cards |
| --- | --- |
| 🌱 **First words** | talking, numbers without quotes, quotes change everything, notes, reading your first error |
| 🏷️ **Values with names** | `let`, changing a value, `ask`, building a sentence from pieces |
| 🔀 **Decisions** | `if … then`, `otherwise`, comparing text, block `if … then:` … `end if` |
| 🔁 **Loops** | `repeat … times`, `while … do`, a counter with a running total |
| 📚 **Libraries** | adding a library, percentages, word tools, a random number |
| ⌨️ **Keys and timing** | `is pressed`, the letter keys, `wait`, `wait … until` |
| 🎮 **Games** *(full Studio only)* | the game window, an actor, the game loop, `is touching` |

Every card has a goal, a short explanation, a code box, hints, and a check.
The check runs the program in a throw-away copy of the engine and compares the
real console output (line by line, plus any "must not print" rule or pattern),
so a program that prints the right words by another route still passes and a
program that only *looks* right does not.

- **▶ Run & check** marks the card. The output your program printed is shown
  under the feedback, so you can compare it with the goal yourself.
- **💡 Hint** reveals one hint at a time; after two wrong answers the card
  offers **👀 Show the answer** as a way out.
- **↗ Try in the editor** copies the card's code into the main editor and runs
  it there, which is where a project of your own belongs.
- Progress and your in-progress code are kept in this browser, so closing the
  tab does not lose your place. **↺ Reset** puts a card back to its start.
- Cards that need a library this build does not ship (the Game course inside
  `E++.zip`) are hidden instead of failing, and the sidebar says so.

The Studio allows the article-less spelling of the library words, so a card can
show `say the square root of 144` while your own program says
`say square root of 144`; both are marked correct.

---

## 📱 Totally Not A Social Media Site

A separate, self-contained parody site lives in `totally-not-a-social-media-site/`.
No login, no password: type a username and BOOM. Upload videos, give likes,
comment, search. Every video is catalogued and stored by `js/videostorage.js`,
and playback streams in ten second chunks so nothing ever lags. All of the
countries it claims to be banned in are fictional.

```bash
python3 -m http.server 8000      # then open /totally-not-a-social-media-site/
```

See [`totally-not-a-social-media-site/README.md`](totally-not-a-social-media-site/README.md)
for the details.

---

## 📁 Project layout

```text
include/            C++ headers (lexer, parser, interpreter, value, ast, vault)
src/                C++ engine and the native project-file implementation
js/                 Studio modules, including the compiled native lexer and its adapter
tests/              JavaScript, browser, and cross-engine regression tests
tools/              Release and WebAssembly lexer builders
examples/           runnable programs (Draw and Game examples require the full Studio)
lexer.py, epp.py    the Python lexer and runtime
index.html          the whole Studio: UI, engine and editor in one file
LANGUAGE.md         the language reference
totally-not-a-social-media-site/   standalone parody social site (no build step)
```

---

## License

Apache License 2.0. The compiled browser lexer also includes LLVM libc++ and
WASI libc components; their notices are in `third_party/licenses/`.
