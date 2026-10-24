# E++ Programming Language [1.2]
> **"Looks like English, feels like english, and is english"**

Welcome to **E++ 1.2** — a release in three parts: **guided tutorials** built
into the Studio, the **Game** library that turns E++ into a small game engine
(the pygame zero of E++), and the **Keyboard**, **ImprovedWait** and
**ImprovedWaitLite** libraries that make programs react to people and to time.

E++ still runs on three engines that agree with each other: a native C++
engine, a single-file Python runtime, and the zero-dependency Studio that runs
offline in the browser.

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

Saving and opening projects needs no ceremony: **Download** writes the project
out, **Import** opens it again, and the Studio keeps track of which key belongs
to which project so you never type one. Nothing about how a project file is
built is worth knowing to use E++, so this manual does not describe it.

- **Download** writes the file and keeps its key in this browser.
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
   - `let 'Student' be Sam`
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

Every engine produces the same error, with the same code, the same line and
column, and a caret under the exact spot:

```text
[E++ Error E103: Invalid Otherwise Placement] --> script.enpp:5:28
   5 | if 'Score' is 100 then say "Perfect" otherwise say "Good"
     |                            ^
 = Reason: 'otherwise' cannot be placed on the same line as 'if ... then'.
 = Help: In E++, 'otherwise' always has to be on the next line immediately following the 'if' statement.
```

| Code | Meaning |
| --- | --- |
| `E101` | Syntax error (invalid note, malformed statement) |
| `E103` | `otherwise` on the same line as `if ... then` |
| `E104` | `otherwise` without a preceding `if` |
| `E201` | Undefined variable, or an actor that was never created |
| `E202` | Golden Rule 2 violation (double quotes for a variable) |
| `E301` | Library not added (feature used before `add the "…" library`) |
| `E302` | Library exists, but not in this build of E++ |
| `E401` | Golden Rule 1 violation (math in quotes) |
| `E402` | Golden Rule 3 violation (unquoted word used as text) |
| `E404` | File not found |
| `E511`–`E522` | A project file that will not open (not a project, damaged, wrong release, no key, wrong key, bad `--key`) |
| `E601` | Missing offline runtime lexer (`epp_language.zip`) |
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
Multi-line blocks keep their indentation, and standard modules (`math`,
`random`, `json`, `re`, `statistics`, `time`, `datetime`, `string`, `sys`,
`os`) all work. `turtle` is prohibited everywhere (`E701`).

### Math (`"Math"`), Random (`"Random"`), Strings (`"Strings"`), Colors (`"Colors"`), Console (`"Console"`), Time (`"Time"`), Files (`"Files"`), System (`"System"`)
The classic libraries, unchanged: square roots and percentages, dice and coins,
uppercase and length, ANSI colours, `clear the console`, dates and timestamps,
file read/write/append, and system commands.

### Draw (`"Draw"`) and Image (`"Image"`)
```text
add the "Draw" library
define 'hero' as drawing sprite
'hero' move right "60"
```

### Game (`"Game"`) — Studio only
The pygame zero of E++: a window, actors with images, movement, collisions and
a game loop.

```text
add the "Game" library
add the "Keyboard" library

set the game window to 640 by 480
set the game background to "night"

create the actor 'hero' with the image "hero.png"
put the actor 'hero' at 0 and 120
note [An actor size is a multiplier: 1 is normal, 2 is twice as big]
set the size of the actor 'hero' to 2

play the game
  if the "Up arrow" key is pressed then 'hero' move up "5"
  if the "Down arrow" key is pressed then 'hero' move down "5"
end the game
```

- `create the actor 'hero' with the image "<picture>"` — the actor's name then
  behaves like a variable that loads that image.
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

### ImprovedWaitLite (`"ImprovedWaitLite"`)
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
**not** include the actor features. That is why the lite library is the one
that ships in `E++.zip`.

---

## 📦 What is inside `E++.zip`

`E++.zip` is the standalone release. It contains the native C++ engine, the
Python runtime, the Studio (`index.html` + `js/`), the examples and the docs —
with **Keyboard** and **ImprovedWaitLite** ready to use. The **Game** library
needs a canvas and the **ImprovedWait** actor engine is the largest module in
the release, so both are left out of the zip on purpose: the build marks them
as unavailable, removes their cards from the library panel, and
`add the "Game" library` answers in plain English instead of failing obscurely.
Use the full Studio release to build games.

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
```bash
npm test        # the JS engine's full suite (projects, libraries, parser, tutorials)
make test       # runs the C++ and Python engines over the examples
make zip        # rebuilds E++.zip and epp_language.zip
```

---

## 🌐 E++ Studio (`index.html`)

Open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
```

- True offline runtime: it verifies and loads the lexer from `epp_language.zip`
  using `DecompressionStream`. If the zip is missing, execution stops with
  `E601` and the badge on the page turns red.
- **New / Import / Save / Download** for `.enpp` and `.enppl`; downloads and
  imports are handled by the keys saved in the browser.
- **🎓 Learn** opens the card-by-card tutorials described below.
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

## 📁 Project layout

```text
include/            C++ headers (lexer, parser, interpreter, value, ast, vault)
src/                C++ engine and the native project-file implementation
js/                 Studio modules: libraries, keyboard, vault, game host, tutorials
tests/run-tests.mjs the JavaScript engine's test suite (npm test)
tools/build-zip.mjs the E++.zip builder (make zip)
examples/           runnable .enpp / .enppl / .eppla programs
lexer.py, epp.py    the Python lexer and runtime
index.html          the whole Studio: UI, engine and editor in one file
LANGUAGE.md         the language reference
```

---

## License

Apache License 2.0. Write programs that read like English, and keep your keys safe.
