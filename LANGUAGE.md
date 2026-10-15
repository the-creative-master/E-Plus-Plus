# The E++ Language Reference

E++ looks like English, reads like English, and behaves like code.
This document describes the language exactly as implemented in this
repository (`js/lexer.js`, `js/parser.js`, `js/ast.js`, `js/interpreter.js`,
`js/libraries.js`).

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
| `Adonis` (bare word) | the variable `Adonis` if one exists; otherwise an English error — bare words must be a variable, a number or a keyword. Exception: on the right-hand side of `Define`/`Set`, bare words are the literal value (`Define name as Adonis.`) |
| `true` / `yes`, `false` / `no` | booleans |

## 3. Variables

```eppl
Define name as Adonis.
Define score as 0.
Define total as 'price' times 'quantity'.
```

`Define <name> as <value>.` creates (or replaces) a variable. Names are
single words. Refer to a variable with single quotes: `say 'name'`.
Bare references work too when the word is used where a value is expected,
as in the spec example `if output is equal to 11 ...`.

Change an existing variable (extension, same idea):

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
any expression. The variable must already hold a number (a typed answer
such as `"40"` counts) and the amount must be a number — otherwise you get
an English `RuntimeError` explaining exactly which part is wrong.

Using a variable that was never defined is a `RuntimeError` naming the
variable, its line, and how to define it.

## 4. Printing

```eppl
say <value>
display <value>      (say, display and show are synonyms)
```

- `"in quotes"` → printed literally: `say "1 plus 1"` prints `1 plus 1`.
- `'in single quotes'` → the variable's value.
- Bare numbers/maths → evaluated: `say 1 plus 1` prints `2`.
- Concatenation uses `plus`: `say "Hello " plus 'name' plus "!"`.
  If both sides of `plus` are numbers (or numeric text, e.g. typed
  answers), it adds; otherwise it joins as text.

## 5. Maths

Available without any library: `plus`, `minus`, `times`, parentheses, and
unary minus. Precedence: parentheses → `power of` → `times` / `divided by`
/ `percent of` → `plus` / `minus`.

With `library "Math" add` (§8) you also unlock `divided by`, `power of`,
`percent of`, `square root of`, `as fraction` and `as decimal` — writing
`2 power of 3` means 2³ = 8, `50 percent of 200` is 100, and
`square root of 16` is 4. (`times` inside `repeat 3 times` ends the count;
write multiplications in a repeat count with parentheses.)

## 6. Input

```eppl
ask "<prompt>" and save answer as <variable>
```

Prints the prompt in the IDE console and waits for the user to type an
answer, which is stored as text. Because maths and comparisons treat
numeric text as a number, quiz-style programs work naturally:

```eppl
ask "What is 5 plus 6?" and save answer as output
if output is equal to 11 then say "Correct!" otherwise say "Wrong!"
```

## 7. Waiting

```eppl
wait <seconds>
```

Pauses for that many seconds (fractions allowed). `wait 'delay'` works if
the variable holds a number. Waiting can be interrupted with **Stop**.

## 8. Conditionals

Single-line form:

```eppl
if <value> is equal to <value> then <statement> otherwise <statement>
```

Block form (the `otherwise` part is optional):

```eppl
if 'score' is greater than 5 then
  say "High score!"
otherwise
  say "Keep going."
end if
```

Comparisons: `is equal to`, `is not equal to`, `is different from`,
`is greater than`, `is lesser than` (also spelled `is less than`),
`is greater than or equal to`, `is less than or equal to`, and `equals`.
Numbers compare numerically (typed answers included); otherwise values
compare as text. A condition without a comparison tests truthiness
(`if 'ready' then ...`).

### Multiple branches

`otherwise if` chains may be as long as you like, in inline or block form;
the first branch whose condition is true runs:

```eppl
if 'score' is greater than 90 then say "A" otherwise if 'score' is greater than 80 then say "B" otherwise say "Keep going"
```

### "and" chaining across lines

A branch action may end with the word `and` to continue the chain on the
next line:

```eppl
ask "Pick a number" and save answer as answer
if answer is equal to 1 then say "One" and
otherwise if not a number then say "Not a number" and
otherwise say "Something else"
```

### Checking for a number

`is not a number` (and `is a number`) test whether a value is numeric.
Written in full it names its value; inside an otherwise-if chain, a bare
`otherwise if not a number then ...` tests the same value the first
condition in the chain tested — usually the last typed answer:

```eppl
if 'age' is not a number then say "Numbers only, please."
```

### Asking again

Because an `otherwise` branch can be any statement, it can ask the same
question again and overwrite the answer:

```eppl
ask "What is 5 plus 6?" and save answer as output
if output is equal to 11 then say "Correct!" otherwise ask "What is 5 plus 6?" and save answer as output
```

## 9. Loops (extensions)

```eppl
repeat 3 times
  say 'count'
  Set count to 'count' minus 1.
end repeat

while 'n' is less than 3 do
  Set n to 'n' plus 1.
end while
```

`stop` leaves the current loop early. Loops are safety-capped and runaway
programs are stopped with a `RuntimeError`.

## 10. Libraries

```eppl
library "<LibraryName>" add
```

loads a library and extends the grammar. Library features used *before*
the `library ... add` line raise a `LibraryError` explaining what to add —
both at parse time and at run time. Unknown library names are rejected
with a list of what exists.

### Math
Unlocks: `divided by`, `power of`, `as fraction`, `as decimal`,
`percent of`, `square root of`.

```eppl
library "Math" add
display 1 divided by 2 as fraction   (prints 1/2)
display 1 divided by 2 as decimal    (prints 0.5)
display 1 divided by 3 as fraction   (prints 1/3 — exact fractions)
```

`as fraction` produces an exact fraction value; `as decimal` converts
back to a decimal number. Fractions stay exact through `plus`, `minus`,
`times` and `divided by` until converted.

### Text
Unlocks: `uppercase of <value>`, `lowercase of <value>`,
`length of <value>`.

### Random
Unlocks: `random number between <low> and <high>` — a whole number when
both bounds are whole numbers, a decimal otherwise.

### Python
Unlocks: `python code`. Python code **cannot run without this library**:
writing `python code "..."` before `library "Python" add` is an English
`LibraryError` (checked while parsing and again while running) that tells
you exactly which line to add. Writing bare Python such as `print("Hello")`
as an E++ statement is also refused with an English `ParseError` — Python
only ever runs inside `python code "..."`, never as an E++ statement.

Single line:

```eppl
library "Python" add
python code "print('Hello from Python')"
```

Multi-line "dash mode": when the quoted code begins with `-`, everything
after the dash until the closing quote is raw Python — it may span lines
and is never parsed as E++. The parser lifts the whole block out of the
program *before* the E++ lexer runs; the lexer itself is generic,
language-agnostic JavaScript and contains no Python knowledge at all
(and, like everything else in the language core, it never executes
anything):

```eppl
python code "-for number in range(3):
    print(number)
"
```

In the IDE, Python really executes (via Pyodide/WebAssembly, bundled
with the IDE itself in `vendor/pyodide` — no download and no internet
connection needed). Each Run starts with a fresh Python namespace, Python's
`print` writes to the E++ console, Python's own error output is captured
and never displayed, and Python errors are reported back as the IDE's own
plain-English errors explaining what kind of mistake Python found (for
example: "Python tried to use a name that has not been created yet").
Programs run
through the language core can supply their own runner with the
`pythonExecutor` interpreter option; with no runner connected, Python
statements fail with a clear English `RuntimeError` instead of doing
nothing.

## 11. `.eppl` files

`.eppl` is the E++ source file format: plain text containing E++ code, in
a file whose name ends in `.eppl`. Only the E++ IDE interprets them:

- The IDE creates, saves, loads, renames and deletes `.eppl` files and
  stores them locally in the browser.
- **Export** downloads a real `.eppl` file; **Import** (button or drag &
  drop) accepts *only* `.eppl` files and rejects anything else, as does
  the Run button.
- A missing extension is completed automatically (`quiz` → `quiz.eppl`);
  a foreign extension (`.txt`, `.js`, …) is rejected with an explanation.

## 12. Errors

Every failure is reported in the console as a typed error with position
and, where useful, a fix-it hint:

- `LexError` — bad characters, unterminated strings/variables.
- `ParseError` — sentences the grammar doesn't understand, missing
  `end if`, statements starting with an unknown word, …
- `LibraryError` — library features used before `library "..." add`, or an
  unknown library name.
- `RuntimeError` — undefined variables, division by zero, square roots of
  negative numbers, non-numeric maths, runaway loops, …
- `FileError` — non-`.eppl` file names, missing files, duplicate names.

Example:

```
LibraryError (line 1, column 5): "square root of" belongs to the Math library, which has not been added yet.
Hint: Add this near the top of your program: library "Math" add
```

## 13. Grammar summary

```
program        := statement*
statement      := define | set | say | ask | wait | library
                | if | repeat | while | stop | note
                | increase | decrease | python
define         := "Define" name "as" expression
set            := ("Set"|"Change") name "to" expression
say            := ("say"|"display"|"show") expression
ask            := "ask" expression "and save answer as" name
wait           := "wait" expression ["seconds"]
library        := "library" STRING ("add"|"load"|"import")
increase       := "Increase" name "by" expression
decrease       := "Decrease" name "by" expression
python         := "python" "code" STRING                        [Python]
                  (STRING starting with "-" = raw multi-line Python)
if             := "if" condition "then" branch
                  ("otherwise if" condition "then" branch)*
                  ["otherwise" branch] ["end if" when block form]
                  (a branch action may end with "and" to continue
                   the chain on the next line)
repeat         := "repeat" expression "times" (statement | block "end repeat")
while          := "while" condition ["do"] (statement | block "end while")
condition      := expression [("is" ["not"] comparison | "equals") expression]
                | expression "is" ["not"] ["a"] "number"
                | "not a number"   (otherwise-if chains only: tests the
                                    first condition's value)
expression     := additive ["as" ("fraction"|"decimal")]
additive       := multiplicative (("plus"|"minus") multiplicative)*
multiplicative := power (("times"|"divided by"|"percent of") power)*
power          := unary ["power of" power]
unary          := ["minus"|"square root of"] unary | primary
primary        := NUMBER | STRING | VARIABLE | bare words | "(" expression ")"
                | ("uppercase of"|"lowercase of"|"length of") unary
                | "random number between" power "and" power
```
