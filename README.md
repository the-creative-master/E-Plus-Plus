# E++

E++ is a programming language that reads like English: `say "Hello."` prints a line,
`repeat 3 times ... end repeat` goes round three times, and `Define score as 10.` gives a
name to a value. This repository holds the language, the six libraries that come with it,
a small Python runner, and the IDE that runs all of it.

Dev Build 6.3. The engine, the libraries and the server are C++; the page is plain HTML,
one stylesheet and one script that talks to the server's JSON API. No framework, and no
build step for the front end: `make` is the whole toolchain.

## Build it

Needs a C++17 compiler and `make`. Nothing else, no dependencies to install.

```sh
make                # builds build/epp
make test           # engine tests, then the server walked through with curl
./build/epp serve   # the IDE, at http://localhost:8000
```

The command line has a few other uses:

```sh
./build/epp run workspace/demo.eppla         # run a program
./build/epp check workspace/demo.eppla       # parse it without running
./build/epp run program.eppla --answers "Sam,14"
./build/epp libraries                        # the six libraries and their words
./build/epp serve --port 9000 --workspace /tmp/scratch
```

## What is where

| Path | What it holds |
| --- | --- |
| `src/` | The whole program: lexer, parser, interpreter, libraries, Python runner, JSON reader, file store, HTTP server, command line |
| `web/` | The HTML the server fills in, plus `style.css` and `app.js` (the only script the browser loads) |
| `data/` | Everything the pages say and everything they offer: the words, the settings schema, the lessons, the example programs |
| `tests/` | The engine tests, an end-to-end pass through the server, and the checks on the house rules |
| `workspace/` | Made on first run: your programs, your settings and any lessons you add |
| `build/` | Compiler output |

## Programs live in files

An E++ file ends in `.eppl` or `.eppla`. A `.eppl` file is a program that needs nothing
extra, and that is the only difference between the two: add a library and the file is
saved as `.eppla`. The IDE does that rename for you the moment a library line appears.

```eppl
note: lines after "note:" are ignored
Define who as "world".
say "Hello, " plus 'who' plus "!"
```

```eppla
add library "Math"
display 7 divided by 8 as fraction
say square root of 225
```

## The libraries

| Library | Its words |
| --- | --- |
| Math | divided by, as fraction, as decimal, percent of, power of, square root of, is a positive / negative number, is in the range of A to B |
| Text | uppercase of, lowercase of, length of |
| Random | random number between A and B |
| Image | define ... as image, display image, check if ... exists |
| Draw | define ... as drawing sprite, move up / down / left / right |
| Python | python code ... end python |

A library word used too early is an error that names the library and the line to add:

```
LibraryError (line 4, column 9): "square root of" belongs to the Math library, which has not been added yet.
  Add this line above it: add library "Math"
```

## Python, when you want it

`python code` opens a block that runs as Python until `end python`, with `print` writing to
the same console as `say`:

```eppla
add library "Python"

python code
  total = 0
  for number in range(1, 6):
      total += number
  print("Total:", total)
end python
```

It is a small runner, not CPython: printing, assignment and `+=`/`-=`, `if`/`elif`/`else`,
`for` over `range()` or a list, `while`, `break`, `continue`, `pass`, lists, and
`range`/`len`/`int`/`float`/`str`/`abs`/`round`/`sum`. Python errors keep their Python
names, so `NameError`, `ZeroDivisionError` and `IndentationError` read as usual.

## How the page talks to the server

The page never computes anything about E++ itself. When you type, run a file or press a
button, `web/app.js` asks the C++ server and puts the answer on screen — so there is one
implementation of the language, and the browser is only a view onto it. The wording it
displays comes from `GET /api/labels`, which is `data/messages.json` as JSON.

| Route | Answers with |
| --- | --- |
| `GET /api/status`, `GET /api/labels` | the build, the file count, and every message the IDE can show |
| `GET /api/file`, `GET /api/files` | one file's text and colours, or the file list |
| `POST /api/run` | the console, the sprite grid, the timing, and the line to blame on an error |
| `POST /api/save`, `new`, `rename`, `delete` | the file's new state, plus a sentence for the toast |
| `POST /api/insert-library`, `restore`, `lessons/open`, `settings` | the same shape: what changed, and what to say about it |

Failures come back as `{ "ok": false, "message": "..." }` with a 400, 404 or 409, and the
engine tags the interesting ones (`needs-eppla`, `no-answers`, `library-missing`) so the
page can open the right box instead of reading the prose.

## Settings, lessons and the rest

Nothing in the IDE is written into its markup. Labels, options, defaults, lessons and the
quick reference live in `data/`, the server reads them as it builds each page, and the
checks in `tests/no_refs.sh` fail the build if wording creeps back into `web/`.

- `data/messages.json` — every label and message the IDE can show
- `data/settings.json` — the settings schema, its defaults and its groups; saved values go to `workspace/.settings.json`
- `data/tutorial.json` — the eight lessons
- `data/examples/` — the programs copied into `workspace/` on first run
- `workspace/.lessons.json` — lessons you add or import

Wipe `workspace/` to start over; press *Restore examples* to bring the example programs back.

## Tests

```sh
make test                 # everything
./build/engine_test       # 177 checks over the language, libraries, Python, JSON, store
tests/http_smoke.sh       # 47 checks against a running server
tests/no_refs.sh          # one script for the browser, no hardbaked wording, one explanation of the endings
node tests/front_end.mjs  # 23 checks driving the pages through jsdom (needs `npm install jsdom`)
```

The engine tests and the two shell scripts need nothing beyond a compiler. The jsdom pass is
optional and says so when it is missing.

## Credit

E++ grew out of a video by WeeklyHow, who built a first version of the language with an AI
assistant. This build keeps the idea — an English-like language with real errors — and
rewrites the whole thing: new grammar, new libraries, a Python runner, and an interpreter
in C++.
