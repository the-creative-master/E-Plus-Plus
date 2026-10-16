# E++ and the E++ IDE (Dev Build 5)

**E++ looks like English, reads like English, and behaves like code.**

> **Origin & Attribution:** This project is based on one of WeeklyHow's videos where he used AI to build a programming language called E++ (and it's very s— you know!). E++ Dev Build 5 humanizes the language into something genuinely fun, accessible, and English-like.

E++ is a complete programming language implemented from scratch in this
repository — lexer, parser, AST, interpreter, runtime, library system, Python runner, and
error system — together with a complete online IDE in which the language
runs.

## What's New in Dev Build 5

1. **Core Logic Conditions (no library needed)**:
   - `contains` — check if a value contains a substring: `if 'text' contains "hello" then ...`
2. **Math Logic Conditions (requires Math library)**:
   - `is a positive number` / `is not a positive number`
   - `is a negative number` / `is not a negative number`
   - `is in the range of A to B` / `is not in the range of A to B`
3. **Variable System Fixed**:
   - Variables **MUST** be inside single quotes — any word in quotes is valid
   - Whitelist removed: multi-word names, numeric names, special characters all work
   - `Define 'my var' as "hello"` and `Set 'my var' to 42` now work
4. **Loop + Mutation (Arena Additions, Now Officially Supported)**:
   - `repeat N times ... end repeat` fully documented and tested
   - `Set 'variable' to new value` — quoted variable names accepted
5. **Image Library (New)**:
   - `add library "Image"` unlocks image support
   - `define 'cat' as image "<base64-string>"` — define images from Base64 data
   - `check if 'cat' exists` — check if an image variable has been defined
   - `display image 'cat'` — display images in the console (auto-detects PNG/JPEG/GIF/WebP)
6. **General Language Cleanup**:
   - `ask/save answer` now works correctly with quoted variables
   - `if/otherwise` now works correctly with quoted variables
   - All logic conditions work inside loops and Set

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
- **Tutorial** — interactive lessons teaching variables, math, conditions, libraries, and Python.
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

note: Dev Build 5 — new conditions
if 'output' is a positive number then say "Above zero"
if 'output' is in the range of 1 to 20 then say "In range"

note: Dev Build 5 — contains
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
  ide.js                    IDE app controller, file explorer, tutorial, dashboard
examples/                   Bundled example programs (.eppl and .eppla)
tests/run-tests.mjs         Test suite for language core, files, Python, and E++.zip
```
