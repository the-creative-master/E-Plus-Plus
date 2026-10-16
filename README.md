# E++ and the E++ IDE (Dev Build 6.1.1)

**E++ looks like English, reads like English, and behaves like code.**

> **Origin & Attribution:** This project is based on one of WeeklyHow's videos where he used AI to build a programming language called E++ (and it's very s— you know!). E++ Dev Build 6.1.1 humanizes the language into something genuinely fun, accessible, and English-like.

E++ is a complete programming language implemented from scratch in this
repository — lexer, parser, AST, interpreter, runtime, library system, Python runner, and
error system — together with a complete online IDE in which the language
runs.

## What's New in Dev Build 6.1.1

1. **The tutorial is no longer hardbaked into the IDE** (the big one):
   - Lesson content lives in the lesson pack `tutorial/pack.json` — the IDE
     only renders it. Edit the file and reload: the tutorial changes, no IDE
     code touched.
   - Over http(s) the pack is fetched at runtime; `js/tutorial-pack.js` is a
     generated offline fallback (`npm run build:tutorial`), and both are
     validated before use, with readable English errors for broken packs.
   - **Your own lessons**: “★ Save editor file as lesson”, “⤓ Export pack”,
     “⤒ Import pack”, “↺ Reset”, stored in your browser alongside the official
     lessons.
   - **Progress tracking**: visited lessons are ticked in the lesson rail and
     the pack remembers where you stopped.
   - **“Try in editor” can no longer eat your code**: it saves the file you were
     working on and opens the example in its own `tutorial-<lesson>.eppl[a]`
     file. (Previously it overwrote the open file.)
   - 10 lessons, every example verified to parse *and* run by the test suite.
3. **Much more in Settings**, grouped into Appearance · Editor · Behaviour ·
   Tutorial · Data:
   - *Appearance*: theme (dark / light / **match system**), layout density
     (comfortable / compact), console height (compact / normal / tall), editor
     font size, and toggles for the dashboard bar, line numbers, Libraries panel
     and Quick reference panel.
   - *Editor*: tab size (2/4/8) and spaces-vs-tab, word wrap, auto-save on/off
     and auto-save delay.
   - *Behaviour*: auto-`.eppla` rename, clear console before running, confirm
     before deleting, re-open the last file on start.
   - *Tutorial*: lesson-pack source readout, auto-open on first visit, and
     reset of progress/custom lessons.
   - *Data*: restore example files, reset all settings, delete all local data.
4. **Layout cleanup**: the settings dialog is grouped and scrollable with a
   title bar and footer, the tutorial is a two-pane dialog (lesson rail +
   lesson), the Libraries and Quick reference panels collapse, the header has
   its file and app actions separated, and the dashboard bar is tidier and can
   be switched off.
5. **Bug fixed — auto-`.eppl` → `.eppla` rename**: the handler called a function
   that did not exist, so the rename failed silently and left the tab and file
   list showing the old name. It now renames in place and keeps the whole UI in
   sync.

Everything from the earlier builds still works: `contains`,
`is a positive number`, `is in the range of A to B`, quoted variables,
`repeat N times`, the Image library, `is exactly equal to`, and the `.eppl` /
`.eppla` split.

## What's in the IDE

- **Code editor** — textarea-based editor with live, lexer-driven syntax
  highlighting, line numbers, tab support and cursor position tracking.
- **Run / Stop** — `Ctrl+Enter` runs the open file; long programs
  and `wait` statements can be stopped at any time. `Ctrl+S` saves.
- **Console** — program output, loaded-library notices, interactive input
  for `ask`, and friendly handcrafted errors with line/column and hints.
- **File explorer** — create, open, rename, delete (directly from list) and search `.eppl` / `.eppla` files.
  Files are stored locally in the browser (`localStorage`) and auto-save as you type.
- **Import / Export** — download the current file as `.eppl` or `.eppla` without `.txt` being appended.
- **E++.zip** — download the standalone E++ engine.
- **Tutorial** — 10 interactive lessons that load from the editable lesson pack
  (`tutorial/pack.json`), with your own lessons, import/export, progress ticks,
  and non-destructive "Try in editor".
- **Bundled examples** — `hello.eppl`, `calculator.eppl`, `countdown.eppl`, `quiz.eppl`, `score-tracker.eppl`, `math.eppla`, `guessing-game.eppla`, `text-tools.eppla`, `python.eppla`, `drawing.eppla`.

## The E++ Language in 60 Seconds

```eppl
note: Statements end with a period or a newline.
Define name as WeeklyHow.
say "Hello " plus 'name' plus "!"

ask "What is 5 plus 6?" and save answer as output
if 'output' is equal to 11 then say "Correct!" otherwise say "Wrong!"

note: Files with libraries must be saved as .eppla
add library "Math"
display 1 divided by 2 as fraction

note: Dev Build 6.1.1 — new conditions
if 'output' is a positive number then say "Above zero"
if 'output' is in the range of 1 to 20 then say "In range"

note: Dev Build 6.1.1 — contains
Define greeting as "Hello World"
if 'greeting' contains "World" then say "Found it!"
```

- `"text in double quotes"` is printed literally.
- `'name'` in single quotes means "the variable called name". Bare variable names are errors.
- Bare words and numbers are maths or keywords: `say 1 plus 1` → `2`, while
  `say "1 plus 1"` prints the text.
- Change variables with `Set count to 'count' plus 1.` or `Set 'count' to 'count' plus 1.`.
- Loop with `repeat 3 times ... end repeat` or `loopback to if`.
- Check substrings with `contains`, positive/negative with `is a positive number`, ranges with `is in the range of A to B`.

## Project Structure

```
index.html                  The IDE (markup & dashboard)
css/ide.css                 The IDE (styles)
js/
  errors.js                 EppError + LexError / ParseError / RuntimeError / LibraryError / FileError
  lexer.js                  Generic tokenizer (pure JavaScript)
  ast.js                    AST node definitions + tree walker
  libraries.js              Library registry (Math, Text, Random, Python, Draw, Image)
  parser.js                 Parser with Humanizer syntax (add library, comma Python blocks, .eppl vs .eppla)
  python-runner.js          Pure JS Python lexer & interpreter (native Python error codes, no Pyodide)
  interpreter.js            Interpreter & execution engine
  files.js                  .eppl (pure) and .eppla (libraries) file store with octet-stream export
  highlight.js              Syntax highlighting built on the real lexer
  standalone-generator.js   Generates self-contained standalone index.html & E++.zip archive
  tutorial-pack.js          GENERATED offline copy of the lesson pack (npm run build:tutorial)
  tutorial.js               Tutorial engine: loads/validates/merges lesson packs, progress
  settings-schema.js        GENERATED offline copy of the settings schema (npm run build:settings)
  settings.js               Settings engine: loads/validates the schema, defaults, effects
  ide.js                    IDE app controller, file explorer, settings renderer, tutorial renderer, dashboard
settings/schema.json        THE settings schema — edit this to change Settings
tutorial/pack.json          THE lesson pack — edit this to change the tutorial
tools/build-settings-schema.mjs  Generates js/settings-schema.js from settings/schema.json
tools/build-tutorial-pack.mjs    Generates js/tutorial-pack.js from tutorial/pack.json
examples/                   Bundled example programs (.eppl and .eppla)
tests/run-tests.mjs         Test suite for the language core, files, Python, E++.zip, lesson packs
tests/ide-smoke.mjs         Optional jsdom smoke test for the whole IDE (npm run test:ide)
```

## Editing the tutorial and the settings

Both are data, not IDE code:

```bash
# Tutorial: edit the lessons (title, badge, summary, explanation, code)
$EDITOR tutorial/pack.json

# Settings: edit the groups and controls (key, type, label, default, effect)
$EDITOR settings/schema.json

# Refresh the offline copies the IDE falls back to
npm run build          # runs build:tutorial + build:settings

# Reload the IDE (over the dev server, the build step is optional: the IDE
# fetches tutorial/pack.json and settings/schema.json directly)
```

Adding a setting is a JSON edit — no IDE code:

```json
{
  "key": "wordWrap",
  "type": "checkbox",
  "label": "Wrap long lines instead of scrolling sideways",
  "default": false,
  "effect": { "kind": "class", "class": "wrap-code", "when": "truthy" }
}
```

Effects can be `class`, `class-map`, `css-var` or `theme`; switches that the
IDE has to act on (auto-save, tab size) are picked up by key, so removing one
from the schema is enough to remove it from the IDE.

You can also add lessons from inside the IDE (Settings ▸ Tutorial, or the
lesson-pack buttons in the tutorial dialog) and export the whole set as a
shareable `epp-tutorial-pack.json`.

## Tests

```bash
npm test          # language core, file store, E++.zip, lesson pack, settings schema (104 groups)
npm run test:ide  # boots the real IDE in jsdom and drives it — 37 checks, incl. adding a
                  # setting to the served schema and watching the dialog grow (needs jsdom)
```
