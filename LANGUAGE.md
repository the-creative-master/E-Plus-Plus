# The E++ Language Reference (Dev Build 6.1.2)

**E++ looks like English, reads like English, and behaves like code.**

> **Origin & Attribution:** This project is based on one of WeeklyHow's videos where he used AI to build a programming language called E++ (and it's very s— you know!). E++ Dev Build 6.1.2 humanizes the language into something genuinely fun, accessible, and English-like.

This document describes the language exactly as implemented in this
repository (`js/lexer.js`, `js/parser.js`, `js/ast.js`, `js/interpreter.js`,
`js/python-runner.js`, `js/libraries.js`, `js/files.js`).

## 1. General rules

- Statements end with a **period** `.` or a **newline**. Both are
  equivalent; you may mix them freely.
- `"double quotes"` mark **literal text** (a string).
- `'single quotes'` mark a **variable reference**.
- **Bare words** (no quotes) are maths, keywords, or — when they name no
  variable — literal text.
- Keywords are case-insensitive: `Define`, `define` and `DEFINE` are the
  same. Variable names are also matched case-insensitively.
- `note: anything on this line` is a comment and is ignored. `# ...` and
  `// ...` comments are also supported.

## 2. Values

| Written as | Meaning |
|---|---|
| `"Hello"` | literal text |
| `'name'` | the value of the variable `name` |
| `42`, `3.5` | a number |
| `WeeklyHow` (bare word) | the variable `WeeklyHow` if one exists; otherwise an English error — bare words must be a variable, a number or a keyword. Exception: on the right-hand side of `Define`/`Set`, bare words are the literal value (`Define name as WeeklyHow.`) |
| `true` / `yes`, `false` / `no` | booleans |

## 3. Variables (Dev Build 5: Fixed)

```eppl
Define name as WeeklyHow.
Define score as 0.
Define total as 'price' times 'quantity'.
```

`Define <name> as <value>.` creates (or replaces) a variable. Names are
single words. Refer to a variable with single quotes: `say 'name'`.

**Dev Build 5 changes:**
- Variables **MUST** be inside single quotes: `'name'`
- Variables **NOT** in quotes are **ILLEGAL** (an error is shown)
- **ANY** word inside quotes is a valid variable — the whitelist has been removed
- Multi-word names, names with numbers, and names with special characters all work: `Define 'my variable' as "hello".`

You can also define variables with quoted names:
```eppl
Define 'my score' as 100.
Define 'player 1' as "Alice".
say 'my score'
```

Change an existing variable (Dev Build 5: also works with quoted names):

```eppl
Set count to 'count' plus 1.
Set 'count' to 'count' plus 1.    (also valid)
```

### Increasing and decreasing

```eppl
Increase <variable> by <amount>
Decrease <variable> by <amount>
```

```eppl
Define score as 10.
Increase score by 5
Decrease score by 3
```

The variable may be written as a plain name or as `'name'`; the amount is
any expression. The variable must already hold a number and the amount must be a number — otherwise you get
a plain-English `RuntimeError` explaining exactly which part is wrong.

## 4. Printing

```eppl
say <value>
display <value>      (say, display and show are synonyms)
```

- `"in quotes"` → printed literally: `say "1 plus 1"` prints `1 plus 1`.
- `'in single quotes'` → the variable's value.
- Bare numbers/maths → evaluated: `say 1 plus 1` prints `2`.
- Concatenation uses `plus`: `say "Hello " plus 'name' plus "!"`.

## 5. Maths

Available without any library: `plus`, `minus`, `times`, parentheses, and
unary minus. Precedence: parentheses → `power of` → `times` / `divided by`
/ `percent of` → `plus` / `minus`.

With `add library "Math"` (§10) you also unlock `divided by`, `power of`,
`percent of`, `square root of`, `as fraction` and `as decimal`.

## 6. Input

```eppl
ask "<prompt>" and save answer as <variable>
ask "<prompt>" and save answer as '<variable>'    (Dev Build 5: quoted names also work)
```

Prints the prompt in the IDE console and waits for the user to type an
answer, which is stored as text. Typed answers automatically compare
as numbers when appropriate.

## 7. Waiting

```eppl
wait <seconds>
```

Pauses for that many seconds (fractions allowed). Waiting can be interrupted with **Stop**.

## 8. Conditionals

Single-line form:

```eppl
if <value> is equal to <value> then <statement> otherwise <statement>
```

Block form:

```eppl
if 'score' is greater than 5 then
  say "High score!"
otherwise
  say "Keep going."
end if
```

### Condition types

#### Core Logic (no library needed)

| Condition | Example |
|---|---|
| is a number | `if 'x' is a number then ...` |
| is not a number | `if 'x' is not a number then ...` |
| contains | `if 'text' contains "hello" then ...` |
| is equal to | `if 'x' is equal to "hello" then ...` (case-insensitive) |
| is not equal to | `if 'x' is not equal to "hello" then ...` (case-insensitive) |
| is exactly equal to | `if 'x' is exactly equal to "Hello" then ...` (case-sensitive) |
| is not exactly equal to | `if 'x' is not exactly equal to "Hello" then ...` (case-sensitive) |

**Notes on equality:**
- `is equal to` is **case-insensitive**: `"hello"` equals `"HELLO"` equals `"Hello"`.
- `is exactly equal to` is **case-sensitive**: `"hello"` does NOT equal `"Hello"`.

#### Math Logic (requires Math library)

| Condition | Example |
|---|---|
| is a positive number | `if 'x' is a positive number then ...` |
| is not a positive number | `if 'x' is not a positive number then ...` |
| is a negative number | `if 'x' is a negative number then ...` |
| is not a negative number | `if 'x' is not a negative number then ...` |
| is in the range of A to B | `if 'x' is in the range of 1 to 10 then ...` |
| is not in the range of A to B | `if 'x' is not in the range of 1 to 10 then ...` |

**Notes:**
- Zero is **neither** positive nor negative.
- Non-numeric values are "not a positive number" and "not a negative number".
- Range checks are **inclusive**: `is in the range of 1 to 10` includes both 1 and 10.
- Range bounds can be written in either order: `1 to 10` and `10 to 1` are equivalent.

### Loopback (Dev Build 4)

```eppl
loopback to if
```

`loopback to if` re-evaluates the nearest previous `if`. It only
triggers when that if's condition is true **at the moment of the
loopback**.

## 9. Loops

```eppl
repeat 3 times
  say 'count'
  Set count to 'count' minus 1.
end repeat

while 'n' is less than 3 do
  Set n to 'n' plus 1.
end while
```

`stop` leaves the current loop early.

Dev Build 5: All condition types (contains, positive/negative, range) work inside loops.

## 10. Libraries (.eppla Files Only)

In Dev Build 5, libraries are added with the humanized syntax:

```eppl
add library "<LibraryName>"
```

### File Extension Rule (Requirement 5)
- **`.eppl`** files are strictly for programs **WITHOUT** any libraries.
- **`.eppla`** files are for programs **WITH** libraries (ANY library).
- Attempting to add a library inside a `.eppl` file produces a clear error advising the user to rename the file to `.eppla`.

### Math
Unlocks: `divided by`, `power of`, `as fraction`, `as decimal`, `percent of`, `square root of`, `is a positive number`, `is a negative number`, `is in the range of A to B`.

```eppl
add library "Math"
display 1 divided by 2 as fraction   (prints 1/2)
display 1 divided by 2 as decimal    (prints 0.5)

Define score as 50
if 'score' is a positive number then say "Above zero"
if 'score' is in the range of 1 to 100 then say "In range"
```

### Text
Unlocks: `uppercase of <value>`, `lowercase of <value>`, `length of <value>`.

```eppl
add library "Text"
say uppercase of "hello"
```

### Random
Unlocks: `random number between <low> and <high>`.

```eppl
add library "Random"
say random number between 1 and 6
```

### Python & Project Humanizer (Requirements 1, 3, 9)
Unlocks: `python code`.
- Python code runs directly in pure JavaScript via our lexer-based Python runner — Pyodide is no longer used!
- Single line Python:
  ```eppl
  add library "Python"
  python code "print('Hello from Python')"
  ```
- Multi-line Python (Project Humanizer comma mode):
  Humanizer replaces symbols: multi-line Python blocks open with `",` and close with `,"`.
  ```eppl
  add library "Python"
  python code ",for i in range(3):
      print('Number:', i)
  ,"
  ```
- **Native Python Error Codes (Requirement 3)**:
  Errors inside Python statements report Python's OWN exact error codes directly:
  `NameError: name 'missing' is not defined`, `ZeroDivisionError: division by zero`, `SyntaxError: invalid syntax`, `TypeError: unsupported operand type(s)`.

### Draw
Create drawing sprites and move them on the IDE canvas:

```eppl
define 'hero' as drawing sprite
'hero' move right "60"
'hero' move down "30"
```

### Image (Dev Build 5: New)
Define, check, and display images using Base64-encoded data:

```eppl
add library "Image"

define 'cat' as image "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ..."
check if 'cat' exists
display image 'cat'
```

- `define '<name>' as image "<base64-string>"` — defines an image variable with Base64-encoded image data
- `check if '<name>' exists` — checks if an image variable has been defined
- `display image '<name>'` — displays the image in the console (automatically detects PNG/JPEG/GIF/WebP formats)

The Base64 string can be either raw Base64 data or a full data URI (e.g., `"data:image/png;base64,..."`).

## 11. Standalone Runtime: E++.zip (Requirements 6 & 7)

Clicking the **E++.zip** button downloads the entire E++ runtime as a portable, single-file offline IDE inside `E++.zip`:
- Runs pure `.eppl` code offline anywhere in any browser.
- Libraries are not supported in `E++.zip` (pure `.eppl` only).
- **Manual Save Feature**: type `save project as <name>.eppl` into the command bar to save your file directly.

## 12. Grammar Summary

```
program        := statement*
statement      := define | set | say | ask | wait | library | add_library
                | if | repeat | while | stop | note
                | increase | decrease | python
                | loopback | sprite-move
                | check | display-image | define-image
add_library    := "add" "library" STRING
library        := "library" STRING ("add"|"load"|"import")
define         := "Define" name "as" expression
                | "Define" VARIABLE "as" expression
                | "define" VARIABLE "as" "drawing" "sprite"
                | "define" VARIABLE "as" "image" expression            [Image]
set            := ("Set"|"Change") (name | VARIABLE) "to" expression
say            := ("say"|"display"|"show") expression
display-image  := ("display"|"say"|"show") "image" VARIABLE             [Image]
ask            := "ask" expression "and save answer as" (name | VARIABLE)
wait           := "wait" expression ["seconds"]
increase       := "Increase" name "by" expression
decrease       := "Decrease" name "by" expression
python         := "python" "code" STRING
                  (STRING starting with "," or "-" = raw multi-line Python)
loopback       := "loopback" "to" "if"
check          := "check" "if" VARIABLE "exists"                                 [Image]
sprite-move    := VARIABLE "move" ("up"|"down"|"left"|"right") STRING
if             := "if" condition "then" branch
                  ("otherwise if" condition "then" branch)*
                  ["otherwise" branch] ["end if" when block form]
                  — branches may chain without limit
condition      := <expression> [comparison <expression>]
                  comparisons include:
                    "is equal to", "is greater than", "is less than"
                    "is a number", "is not a number"
                    "contains"                                          (core)
                    "is a positive number", "is a negative number"      [Math]
                    "is in the range of" A "to" B                       [Math]
repeat         := "repeat" expression "times" (statement | block "end repeat")
while          := "while" condition ["do"] (statement | block "end while")
```

---

## 11. Tutorial Lesson Packs (Dev Build 6.1.1)

The E++ IDE tutorial is data, not code. Lessons live in a **lesson pack**:
`tutorial/pack.json` (the source of truth), with `js/tutorial-pack.js` as the
generated offline copy used when the IDE is opened without a web server.

```json
{
  "format": "eplusplus-tutorial-pack",
  "version": "6.1",
  "title": "E++ Guided Tutorial",
  "lessons": [
    {
      "id": "variables",
      "title": "Variables & Quotes",
      "badge": "Variables",
      "summary": "One sentence: what this lesson teaches.",
      "explanation": "A little more detail, including any gotchas.",
      "code": "Define name as WeeklyHow.\nsay \"Hello \" plus 'name'\n",
      "fileName": "tutorial-variables.eppl"
    }
  ]
}
```

- `id` — unique, lower-case, letters/numbers/dashes. Defaults the example file
  name to `tutorial-<id>.eppl`, or `.eppla` when the code uses a library.
- `title` / `badge` / `summary` / `explanation` / `code` — required; a pack with
  a missing field is rejected with an English error.
- `fileName` — optional override for the file "Try in editor" creates.
- Packs can be imported and exported from the tutorial dialog
  (`epp-tutorial-pack.json`); lessons you add from the editor are kept in your
  browser and merged after the official lessons.

Regenerate the offline copy after editing the pack:

```bash
npm run build:tutorial
```

### The settings schema

Settings work exactly the same way. `settings/schema.json` defines every group,
control, default and effect; the IDE renders it and applies each effect. The
dialog markup in `index.html` ships empty, and `js/ide.js` contains no setting
names, labels or defaults.

```json
{
  "format": "eplusplus-settings-schema",
  "version": "6.1.1",
  "groups": [
    {
      "id": "editor",
      "title": "Editor",
      "controls": [
        { "key": "tabSize", "type": "select", "label": "Tab size", "default": 2,
          "options": [ { "value": 2, "label": "2 spaces" }, { "value": 4, "label": "4 spaces" } ],
          "effect": { "kind": "css-var", "var": "--tab-size" } },
        { "key": "wordWrap", "type": "checkbox", "label": "Wrap long lines",
          "default": false,
          "effect": { "kind": "class", "class": "wrap-code", "when": "truthy" } },
        { "type": "actions",
          "buttons": [ { "id": "settingsReset", "label": "Reset all settings", "action": "resetSettings" } ] }
      ]
    }
  ]
}
```

- `type` — `select`, `checkbox`, `info` or `actions`.
- `effect.kind` — `theme`, `class` (with `when: truthy | falsy`),
  `class-map` (value → CSS class) or `css-var` (value + optional `unit`).
- `options`, `notes`, `description` and `descriptionId` are optional extras.
- A schema that breaks these rules is rejected in plain English, and the IDE
  falls back to the bundled copy.

```bash
npm run build:settings   # refresh js/settings-schema.js after editing the schema
```

### The UI manifest

The IDE's interface is data as well. `index.html` ships an empty
`<div id="appRoot"></div>`; `js/shell.js` builds the chrome from
`ui/manifest.json`, so every label, button, panel, hint and placeholder can be
changed there.

```json
{
  "format": "eplusplus-ui-manifest",
  "version": "6.1.2",
  "document": { "title": "E++ IDE — Programs that read like English" },
  "topbar": {
    "brand": { "logo": { "main": "E", "accent": "++" }, "title": "E++ IDE", "badge": { "text": "Dev Build 6.1.2" } },
    "actionGroups": [
      { "className": "action-group file-actions",
        "buttons": [ { "id": "btnSave", "label": "💾 Save", "title": "Save (Ctrl+S)" } ] }
    ]
  },
  "sidebar": { "files": { "title": "Files", "listId": "fileList" } },
  "workspace": { "console": { "title": "Console", "outputId": "consoleOutput" } }
}
```

- Ids (`id`, `titleId`, `hostId`, `…Id`) are the contract with `js/ide.js`: the
  build tool and the test suite check that the manifest creates every element
  the controller looks up.
- Elements are created with `createElement` and `textContent` only, so no
  manifest, lesson pack or schema can inject markup.

```bash
npm run build:ui   # refresh js/ui-shell.js after editing the manifest
```
