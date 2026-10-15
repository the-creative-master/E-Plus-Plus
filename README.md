# E++ and the E++ IDE

**E++ looks like English, reads like English, and behaves like code.**

E++ is a complete programming language implemented from scratch in this
repository — lexer, parser, AST, interpreter, runtime, library system and
error system — together with a complete online IDE in which the language
runs. The IDE is the only program that interprets `.eppl` files: it creates,
loads, saves, imports, exports and runs them, all locally in your browser.

## Run the IDE instantly

No build step and no dependencies — the IDE is plain HTML/CSS/JS.

```bash
# Option 1: dev server (recommended)
npm start            # then open http://localhost:8000

# Option 2: just open the file
open index.html      # (or double-click it)
```

Run the language test-suite (Node ≥ 18):

```bash
npm test
```

## What's in the IDE

- **Code editor** — textarea-based editor with live, lexer-driven syntax
  highlighting, line numbers, tab support and cursor position tracking.
- **Run / Stop** — `Ctrl+Enter` runs the open `.eppl` file; long programs
  and `wait` statements can be stopped at any time. `Ctrl+S` saves.
- **Console** — program output, loaded-library notices, interactive input
  for `ask`, and friendly errors with line/column and a “how to fix it” hint.
- **File explorer** — create, open, rename, delete and search `.eppl` files.
  Files are stored locally in the browser (`localStorage`) and auto-save as
  you type.
- **Import / Export** — download the current file as a real `.eppl` file, or
  import `.eppl` files by choosing or drag-and-dropping them. Anything that
  does not end in `.eppl` is rejected — only this IDE interprets `.eppl`.
- **Bundled examples** — `hello.eppl`, `math.eppl`, `quiz.eppl`,
  `countdown.eppl`, `calculator.eppl`, `guessing-game.eppl` and
  `text-tools.eppl` are seeded on first launch (and kept in `/examples`).
- **Small screens** — at 900px and below the IDE switches to an app-style
  layout: **Files / Code / Console** tabs show one full-height panel at a
  time (panel visibility is enforced in JS as well as CSS, so panels can
  never overlap; the IDE fits `100dvh` and each panel scrolls internally).
  The header compacts to brand + Run on one row with Save/Export/Import in
  a slim row beneath (a single row in short landscape), opening a file
  jumps to Code, running jumps to Console (with a badge for new output),
  and controls/inputs use touch-sized 16px text so mobile browsers don't
  auto-zoom. Narrower breakpoints (560px/380px) further compact the status
  bar, file list and editor chrome. Stylesheets/scripts are cache-busted
  (`?v=`) so an updated IDE can never mix new markup with a stale
  stylesheet.

## The E++ language in 60 seconds

```eppl
note: Statements end with a period or a newline.
Define name as Adonis.
say "Hello " plus 'name' plus "!"

ask "What is 5 plus 6?" and save answer as output
if output is equal to 11 then say "Correct!" otherwise say "Wrong!"

library "Math" add
display 1 divided by 2 as fraction
```

- `"text in double quotes"` is printed literally.
- `'name'` in single quotes means “the variable called name”.
- Bare words and numbers are maths or keywords: `say 1 plus 1` → `2`, while
  `say "1 plus 1"` prints the text.
- A bare word that is not a variable is literal text, so
  `Define name as Adonis.` stores `Adonis`; a bare word that **is** a
  variable (like `output` above) uses its value.

The full language reference — grammar, operators, conditionals, loops,
libraries, the `.eppl` file format and the exact semantics of every feature,
including how the overlapping points in the original spec were resolved —
is in **[LANGUAGE.md](LANGUAGE.md)**.

## Project structure

```
index.html            The IDE (markup)
css/ide.css           The IDE (styles)
js/
  errors.js           EppError + LexError / ParseError / RuntimeError /
                      LibraryError / FileError (message, line, column, hint)
  lexer.js            Tokenizer: strings, 'variables', numbers, bare words,
                      statement-ending periods & newlines, comments/notes
  ast.js              AST node definitions + tree walker
  libraries.js        Library registry (Math, Text, Random): what each
                      library unlocks, aliases, grammar ownership
  parser.js           Recursive-descent parser; builds the AST; enforces
                      library gating while parsing
  interpreter.js      Async runtime: variables, Fraction arithmetic, say,
                      ask, wait, conditionals, repeat/while loops, and
                      runtime library checks. I/O is injected.
  files.js            .eppl file store: localStorage persistence, create /
                      save / load / rename / delete / import / export,
                      .eppl-only validation
  highlight.js        Syntax highlighting built on the real lexer
  ide.js              IDE app: editor, explorer, console I/O, execution
                      engine wiring, shortcuts, drag & drop
examples/*.eppl       The bundled example programs as standalone files
tests/run-tests.mjs   Headless test-suite for the whole language core
```

## How execution works

```
.eppl source ─▶ Lexer ─▶ tokens ─▶ Parser ─▶ AST ─▶ Interpreter ─▶ console
```

1. The **lexer** produces tokens with exact source positions.
2. The **parser** builds an AST and, because libraries extend the grammar,
   rejects library features used before their `library "..." add` line.
3. The **interpreter** walks the AST asynchronously so `ask` can wait for
   typed input and `wait` can really wait; the **runtime** double-checks
   library access, guards against runaway loops, and reports errors with
   the statement's line and column.

The language core (`errors`, `lexer`, `ast`, `libraries`, `parser`,
`interpreter`) is environment-agnostic: the same files that run in the
browser are loaded headlessly by the Node test-suite.

## Design decisions (where the spec overlaps)

The specification lists `divided by` and `power of` both under general
maths and under the Math library's unlocks. E++ follows the Math-library
section: those operators (with `as fraction`, `as decimal`, `percent of`
and `square root of`) are unlocked by `library "Math" add`, and using them
earlier produces a `LibraryError` that tells you exactly what to add.
Basic `plus`, `minus` and `times` always work. A few natural English
extensions round out the language (`Set … to …`, block `if … end if`,
`repeat … times`, `while … do`, `note:` comments, and the Text and Random
libraries); each is documented in LANGUAGE.md and none changes any
specified behaviour.
