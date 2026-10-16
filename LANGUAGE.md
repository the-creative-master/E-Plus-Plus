# The E++ language

A reference for what the engine accepts, in the order you meet it. Every example here is a
whole program: paste it into the IDE and press Run.

## Lines, notes and dots

A statement is a line. A full stop at the end of a line is allowed and ignored, which is
why `Define score as 10.` and `Define score as 10` mean the same thing.

`note:` starts a comment. Everything from the word to the end of the line is ignored.

```eppl
note: this line does nothing
say "This one does."
```

## Values

| Kind | Written as | Example |
| --- | --- | --- |
| Number | digits, with an optional decimal point | `42`, `3.5`, `-7` |
| Text | double quotes | `"hello"` |
| Name of a value | single quotes | `'score'` |
| Bare word | letters, on the right-hand side of `define` | `Define name as Northwind.` |

Double quotes are text; single quotes are a look-up. `say "score"` prints the word score,
`say 'score'` prints whatever score holds. A bare word anywhere else is an error, with a
hint to put it in quotes.

## Giving values names

```eppl
Define who as "Ada".
Define score as 10.
Define as value count               note: starts at 0, set it later

Set score to 'score' plus 5.
Set count to 4.
Increase score by 2.
Decrease score by 1.

say 'who' plus " has " plus 'score' plus " points."
```

`Define as value name` starts a value at 0 when the value only arrives later. `Set` needs
the name to exist already; the error says so and shows the line to write.

## Saying things

| Statement | What it does |
| --- | --- |
| `say <value>` | prints the value |
| `display <value>` | prints the value, the same way |
| `display <value> as fraction` | prints a division as `7/8` (Math) |
| `display <value> as decimal` | prints a division as `0.875` (Math) |
| `ask "question" and save answer as name` | asks, and stores the answer under a name |

```eppl
ask "What is your name?" and save answer as name
say "Hello, " plus 'name' plus "."
```

Answers arrive in the order the questions are asked. In the IDE they come from the
Answers box above the console, so a program that asks can still be run twice the same way.

## Maths and words

Words, not symbols, and the same precedence as everywhere else: `times` and `divided by`
bind tighter than `plus` and `minus`, and brackets win over both.

```eppla
add library "Math"
add library "Text"

say 2 plus 3 times 4                        note: 14
say (2 plus 3) times 4                      note: 20
display 7 divided by 2 as decimal
say 2 power of 10
say square root of 625
say absolute value of -37
say 15 percent of 240
say uppercase of "quiet"
say length of "how long is this"
say random number between 1 and 6
```

| Word | Needs | Meaning |
| --- | --- | --- |
| `plus`, `minus`, `times` | nothing | adding, taking away, multiplying |
| `divided by`, `as fraction`, `as decimal` | Math | dividing, and showing the result |
| `power of`, `square root of`, `percent of` | Math | powers, roots, percentages |
| `absolute value of` | nothing | the value without its sign |
| `not <value>` | nothing | 1 when the value is zero or empty |
| `uppercase of`, `lowercase of`, `length of` | Text | changing and measuring text |
| `random number between A and B` | Random | a whole number in the range |

## Conditions

```eppl
Define age as 14.

if 'age' is greater than 12 then
  say "Old enough."
otherwise if 'age' is greater than 5 then
  say "Nearly."
otherwise
  say "Not yet."
end if
```

| Test | Also written as |
| --- | --- |
| `is equal to` | `is not equal to` |
| `is exactly equal to` | `is not exactly equal to` |
| `is greater than` | `is less than`, `is greater than or equal to`, `is less than or equal to` |
| `is a number` | `is not a number` |
| `is a positive number` | `is not a positive number`, `is a negative number`, `is not a negative number` (Math) |
| `is in the range of 5 to 10` | `is not in the range of 5 to 10` (Math) |
| `<text> contains <text>` | — |

`is equal to` compares numbers as numbers, so an answer of `12` matches the number 12.
`is exactly equal to` compares what was written, so `"12.0"` is not `"12"`.

A whole statement can follow `then` on one line:

```eppl
if 'age' is equal to 18 then say "Exactly eighteen." otherwise say "Something else."
```

## Loops

```eppl
repeat 3 times
  say "Again"
end repeat

Define left as 3.
while 'left' is greater than 0 do
  say 'left'
  decrease left by 1
end while

repeat 10 times
  say "Working"
  loopback
end repeat
```

`loopback` ends the round it is in and starts the next one, which is how a loop skips work
it no longer needs to do. Using it outside a loop is an error. A `while` loop that runs a
million times without stopping is stopped, with a hint to look at its condition.

## Libraries

A library is a set of words that the engine switches on with `add library "Name"`. The
six are Math, Text, Random, Image, Draw and Python, and `./build/epp libraries` lists them.
Using a word from a library that is not loaded stops the program and names both the library
and the line that adds it.

## Sprites

```eppla
add library "Draw"

define rover as drawing sprite
'rover' move right "50 px"
'rover' move down "20 px"
'rover' move left "10 px"
```

A sprite has a name and a position, starting at the middle. `move` takes up, down, left or
right and a distance, written as text in double quotes; `"50"` and `"50 px"` both work. The
IDE draws every sprite on the dashboard after a run.

## Pictures

A picture is Base64 text. `define dot as image "<base64>"` keeps it, `check if "dot"
exists` reports whether a name is there, and `display image` sends the most recent picture
to the console. A `data:` URI is accepted as it is.

## Python

```eppla
add library "Python"

python code
  names = ["Ada", "Grace"]
  for name in names:
      print(name, len(name))
  print("Done")
end python
```

Indentation inside the block is Python's business, not E++'s; `end python` closes it.
`print(1)` and `print 1` both work. Supported: assignment, `+=`, `-=`, `if`/`elif`/`else`,
`for` over `range()` or a list, `while`, `break`, `continue`, `pass`, lists, comparisons,
`and`/`or`/`not`, and `range`, `len`, `int`, `float`, `str`, `abs`, `round`, `sum`.
`def`, `class` and `import` are refused with a message that says so.

## Errors

An error names its kind, its place, and what to do next:

```
RuntimeError (line 5, column 3): There is no variable called 'score'.
  Define it first, for example: Define score as 1
```

| Kind | When it appears |
| --- | --- |
| `LexError` | a character the language has no use for, or a quote that never closes |
| `ParseError` | a line that starts well and stops making sense |
| `RuntimeError` | a name that does not exist, dividing by zero, a loopback with no loop |
| `LibraryError` | a library word without its library, or a library in a `.eppl` file |
| `IndentationError`, `NameError`, `TypeError`, `ZeroDivisionError`, `SyntaxError` | from inside a Python block, with Python's own names |

## Files

Programs are files in `workspace/`, and the IDE writes them for you: Save keeps the open
file, New makes another, and Restore examples copies the example programs back.

## Running without the IDE

```sh
./build/epp run program.eppla
./build/epp run program.eppla --answers "Sam,14"
./build/epp check program.eppl
```
