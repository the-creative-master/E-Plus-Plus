# E++ and the E++ IDE (Dev Build 4)

**E++ looks like English, reads like English, and behaves like code.**

> **Origin & Attribution:** This project is based on one of WeeklyHow's videos where he used AI to build a programming language called E++ (and it's very s— you know!). E++ Dev Build 4 humanizes the language into something genuinely fun, accessible, and English-like.

E++ is a complete programming language implemented from scratch in this
repository — lexer, parser, AST, interpreter, runtime, library system, Python runner, and
error system — together with a complete online IDE in which the language
runs.

## What's New in Dev Build 4 (Project Humanizer)

1. **Pure `.eppl` vs Extended `.eppla` Files**:
   - **`.eppl`** is strictly for files **WITHOUT** any libraries.
   - **`.eppla`** is for files **WITH** libraries (ANY library: Math, Random, Text, Draw, Python).
   - Exporting now uses raw binary octet streams so files never save as `.eppl.txt`.
2. **Project Humanizer Syntax**:
   - Use `add library "Name"` (e.g. `add library "Math"`).
   - Non-English punctuation removed: multi-line Python uses commas `", ... ,"` instead of dashes `"- ... -"`.
3. **Lexer-Based Python Runner & Native Error Codes**:
   - Python code runs directly in pure JavaScript via our lexer-based Python runner — Pyodide and WebAssembly are no longer used!
   - Real Python error codes: errors in Python code report Python's OWN error codes directly (`NameError`, `ZeroDivisionError`, `SyntaxError`, `IndentationError`, `TypeError`), rather than generic translations.
4. **Direct File Deletion in File Explorer**:
   - You can now delete any file directly from the sidebar files menu with the inline delete button (`✕`), without having to open the file first.
5. **Standalone Portable Runtime (`E++.zip`)**:
   - A dedicated **E++.zip** button downloads the standalone E++ runtime as a single-file portable IDE inside a zip archive.
   - Run pure `.eppl` code offline anywhere (libraries are not supported in `E++.zip`).
   - Manual save feature: type `save project as <name>.eppl` into the command bar to save your file.
6. **Interactive Guided Tutorial**:
   - Click the **Tutorial** button to access a 6-step interactive guide with live code you can inject directly into the editor and run.
7. **Dashboard Overhaul**:
   - Modernized status banner showing active file, project mode (`.eppl` pure vs `.eppla` extended), loaded libraries, lines of code, and quick library insert buttons.

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
```

- `"text in double quotes"` is printed literally.
- `'name'` in single quotes means “the variable called name”. Bare variable names are errors.
- Bare words and numbers are maths or keywords: `say 1 plus 1` → `2`, while
  `say "1 plus 1"` prints the text.
- Change variables with `Set count to 'count' plus 1.` or `Increase score by 5`.
- Loop with `repeat 3 times ... end repeat` or `loopback to if`.

## Project Structure

```
index.html                  The IDE (markup & dashboard)
css/ide.css                 The IDE (styles)
js/
  errors.js                 EppError + LexError / ParseError / RuntimeError / LibraryError / FileError
  lexer.js                  Generic tokenizer (pure JavaScript)
  ast.js                    AST node definitions + tree walker
  libraries.js              Library registry (Math, Text, Random, Python, Draw)
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
