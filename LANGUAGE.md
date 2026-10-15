# The E++ Language Reference (Dev Build 4)

**E++ looks like English, reads like English, and behaves like code.**

> **Origin & Attribution:** This project is based on one of WeeklyHow's videos where he used AI to build a programming language called E++ (and it's very s— you know!). E++ Dev Build 4 humanizes the language into something genuinely fun, accessible, and English-like.

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

## 3. Variables

```eppl
Define name as WeeklyHow.
Define score as 0.
Define total as 'price' times 'quantity'.
```

`Define <name> as <value>.` creates (or replaces) a variable. Names are
single words. Refer to a variable with single quotes: `say 'name'`.
Since Dev Build 4, **every** variable reference must be written inside
single quotes — writing a variable's name bare (for example
`if output is equal to 11`) is an English error explaining the rule.
The value in a `Define`/`Set` may still be bare words, which are then
the literal value: `Define name as WeeklyHow.`

Change an existing variable:

```eppl
Set count to 'count' plus 1.
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

## 10. Libraries (.eppla Files Only)

In Dev Build 4, libraries are added with the humanized syntax:

```eppl
add library "<LibraryName>"
```

### File Extension Rule (Requirement 5)
- **`.eppl`** files are strictly for programs **WITHOUT** any libraries.
- **`.eppla`** files are for programs **WITH** libraries (ANY library).
- Attempting to add a library inside a `.eppl` file produces a clear error advising the user to rename the file to `.eppla`.

### Math
Unlocks: `divided by`, `power of`, `as fraction`, `as decimal`, `percent of`, `square root of`.

```eppl
add library "Math"
display 1 divided by 2 as fraction   (prints 1/2)
display 1 divided by 2 as decimal    (prints 0.5)
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
add_library    := "add" "library" STRING
library        := "library" STRING ("add"|"load"|"import")
define         := "Define" name "as" expression
                | "define" VARIABLE "as" "drawing" "sprite"
set            := ("Set"|"Change") name "to" expression
say            := ("say"|"display"|"show") expression
ask            := "ask" expression "and save answer as" name
wait           := "wait" expression ["seconds"]
increase       := "Increase" name "by" expression
decrease       := "Decrease" name "by" expression
python         := "python" "code" STRING
                  (STRING starting with "," or "-" = raw multi-line Python)
loopback       := "loopback" "to" "if"
sprite-move    := VARIABLE "move" ("up"|"down"|"left"|"right") STRING
if             := "if" condition "then" branch
                  ("otherwise if" condition "then" branch)*
                  ["otherwise" branch] ["end if" when block form]
repeat         := "repeat" expression "times" (statement | block "end repeat")
while          := "while" condition ["do"] (statement | block "end while")
```
