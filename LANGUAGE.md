# The E++ Language Reference (1.2)

> **"Looks like English, feels like english, and is english"**

This is the reference for **E++ 1.2**. It covers the language itself, the
project files you download and import, and the libraries that ship with this
release.

---

## 1. File formats

| Extension | Use |
| --- | --- |
| `.enpp` | A pure E++ program: no libraries. |
| `.enppl` | A program that uses libraries (`add the "Math" library`, …). |
| `.eppla` | The older name for a library program; still accepted everywhere. |
| `.enpp` / `.enppl` **downloaded from the Studio** | A project file. E++ opens it with the key it keeps for that project. |

### Project files

- **Download** writes the file; **Import** opens it again.
- The Studio keeps one key per project in this browser, so you never type a key
  to open your own work. **🔑 Keys** exports them as `epp-keys.json` and
  imports that file elsewhere.
- The command-line engines read the same keyring:

  ```bash
  ./epp --keyring epp-keys.json project.enppl
  python3 epp.py --keyring epp-keys.json project.enppl
  ```

- A file that E++ did not write is refused (`E511`) instead of half-read. Copy
  the code into a new file in the Studio instead, or write it from the CLI:

  ```bash
  ./epp --save plain.enpp -o saved.enpp
  ```

The repository's own example is `examples/17_saved_project.enpp`, opened with
`examples/epp-keys.json`; the Studio picks that example keyring up on boot, so
the demo opens in the browser as well.

`add the "<Name>" library` opens the libraries below. A library project must be
saved as `.enppl`.

---

## 2. The 3 Golden Rules

1. **NO quotes for Math**:
   - `say 1 plus 1` ➔ `2`
   - `say 2 times 3` ➔ `6`
2. **SINGLE quotes for Variables**:
   - `let 'Grade' be 29`
   - `let 'Student' be Sam`
   - *Never use double quotes for variable names! Double quotes are reserved for text.*
3. **DOUBLE quotes for Strings**:
   - `say "Hello, World!"`
   - `say "1 + 1"` ➔ literal text `"1 + 1"`.

---

## 3. Notes & Comments

```text
note [This is a comment note in E++]
note [Notes are ignored during execution and document your program]
```

`//` and `#` are rejected with `E101`.

---

## 4. Conditionals

### Single-line `if` / next-line `otherwise`

```text
if 'Score' is greater than 50 then say "Passed!"
otherwise say "Failed."
```

- `otherwise` on the same line as `if ... then` ➔ `E103`.
- A standalone `otherwise` ➔ `E104`.

### Block form

```text
if 'Score' is greater than 50 then:
    say "Passed with flying colors!"
else:
    say "Needs improvement."
end if
```

Conditions understand the words people actually use: `is`, `is not`,
`is equal to`, `is greater than`, `is less than`, `is greater than or equal
to`, `is less than or equal to`, plus the library conditions in §9 and §10.

---

## 5. Loops

**Repeat a fixed number of times.** The colon is optional; `end repeat` closes
the block either way.

```text
repeat 3 times:
    say "E++ makes programming read like a book!"
end repeat

repeat 2 times
    say "Again"
end repeat
```

**Repeat while something is true.** `do` (or a colon) opens the block and
`end while` closes it. The condition is checked before every round, so a
condition that is already false runs the body zero times.

```text
let 'n' be 1
while 'n' is less than 4 do
    say 'n'
    let 'n' be 'n' plus 1
end while
```

A counter plus a running total is the same shape:

```text
let 'Total' be 0
let 'n' be 1
while 'n' is less than 6 do
    let 'Total' be 'Total' plus 'n'
    let 'n' be 'n' plus 1
end while
say "The sum is ", 'Total'
```

---

## 6. Variables and asking

```text
let 'Grade' be 29
let 'Student' be Sam

ask "What is your name?" and save the output as 'Name'
say "Hello ", 'name', ", welcome to E++!"
```

Variable names are case-insensitive in use, and `let` re-assigns cleanly:

```text
let 'Score' be 'Score' plus 1
```

---

## 7. Output

```text
say "Hello"
say 1 plus 1
say "Hello ", "World! ", "Welcome to E++!"
say "Hello " and concat it with "World!"
say 1 + 2 and concat it with 2 + 3 with the seperation method of "-"
say red "Colour only works after add the \"Colors\" library"
```

---

## 8. Python integration

```text
add the "Python" library

run the python code "print('Hello from Python')"
run the python code "result = 42" and save the output as 'Answer'

run the python code:
    import math
    print(f"Square root of 144 is {math.isqrt(144)}")
```

Multi-line blocks are passed through verbatim, so indentation, comments and
strings survive. The standard modules (`math`, `random`, `json`, `re`,
`statistics`, `time`, `datetime`, `string`, `sys`, `os`) are available.
`turtle` is prohibited in every engine (`E701`).

---

## 9. The Game library (`add the "Game" library`)

The pygame zero of E++, in the Studio. Game projects are `.enppl`.

### The window

```text
add the "Game" library
set the game window to 640 by 480
set the game background to "night"
```

Colours can be words (`night`, `sky`, `grass`, `sunset`, `space`, …), hex
(`"#123456"`) or an image.

### Actors

```text
create the actor 'hero' with the image "hero.png"
put the actor 'hero' at 0 and 120
note [An actor size is a multiplier: 1 is normal, 2 is twice as big]
set the size of the actor 'hero' to 2

show the actor 'hero'
hide the actor 'hero'
```

- An actor's **name behaves like a variable that loads its image**.
- `put ... at X and Y` measures from the middle of the window: `0 and 0` is the
  centre, so a game looks the same at any window size.
- The Studio's **🖼 Image** button writes the `create the actor` line for you:
  type the actor name, pick the picture.

### Movement and collisions

```text
'hero' move right "5"
'hero' move up "5"
'hero' move left "5"
'hero' move down "5"

if 'hero' is touching 'gem' then say "Caught it!"
```

### The game loop

```text
play the game
  if the "Up arrow" key is pressed then 'hero' move up "5"
  if 'hero' is touching 'gem' then say "Caught it!"
end the game
```

Everything between `play the game` and `end the game` runs once per frame. The
Studio shows the game pane and a **Stop Game** button while it runs;
`stop the game` does the same from inside the program.

### Actors under control

```text
note [Actor control needs the full ImprovedWait library]
pause the actor 'enemy'
resume the actor 'enemy'
stop the actor 'enemy'
stop every actor
```

---

## 10. The Keyboard library (`add the "Keyboard" library`)

```text
if the "Up arrow" key is pressed then 'hero' move up "5"
if the "Up arrow" key is not pressed then say "Waiting…"
if the "a" key is pressed then say "A is down"
if the "Space" key is pressed then say "Jump!"

say "The last key was: ", the key pressed
wait for a key press
```

Key names are forgiving — `"Up arrow"`, `"arrow up"`, `"Up"` and `"up"` are all
the up arrow, the same holds for down, left and right, and the quotes can be
left out: `if the Up arrow key is pressed then ...`. `"Space"`,
`"Enter"`, `"Escape"`, `"Tab"`, `"Shift"`, `"Control"`, `"Alt"`,
`"Backspace"`, `"Delete"` and every single letter are understood. `any` means
"any key at all".

`the key pressed` returns the most recent key by name, ready to compare with a
string. `wait for a key press` pauses until something is pressed (or 30
seconds pass, so a forgotten program cannot hang forever).

---

## 11. Wait libraries

### ImprovedWaitLite — every non-game wait

```text
add the "ImprovedWaitLite" library

note [a named wait, cancelled from elsewhere]
wait 2 seconds as 'intro'
cancel the wait 'intro'

note [a statement that runs after the pause]
wait 1 second and then say "Ready!"

note [wait for a condition, with or without a deadline]
wait until 'score' is greater than 9
wait at most 5 seconds until 'ready' is 1
```

A plain `wait 2 seconds` needs the `Time` library (as in 1.1) or either
ImprovedWait library.

Waits cooperate with the game loop: while a program waits, the canvas keeps
drawing frames.

### ImprovedWait — actors

```text
add the "ImprovedWait" library

wait for the actor 'hero' to finish
wait at most 3 seconds for the actor 'hero' to finish

pause the actor 'enemy'
resume the actor 'enemy'
stop the actor 'enemy'
stop every actor
```

`ImprovedWait` includes everything in `ImprovedWaitLite`. The reverse is not
true: `ImprovedWaitLite` has no actor features, which is why it is the one that
ships inside `E++.zip`.

---

## 12. Maths, randomness and words (`Math`, `Random`, `Strings`)

Library words read like the rest of E++. A library has to be added before its
words mean anything (`E301` if it is not):

```text
add the "Math" library
say the square root of 144
say 20 percent of 150
say the minimum of 7 and 12
say the maximum of 7 and 12
say the value of pi
```

```text
add the "Strings" library
say the uppercase of "e++"
say the lowercase of "E++"
say the reverse of "abc"
say the length of "hello"
say the first letter of "hello"
say the last letter of "hello"
```

```text
add the "Random" library
say "Rolling: ", a random number between 1 and 6
```

The Studio also accepts the article-less spelling (`square root of 144`,
`uppercase of "e++"`, `length of "hello"`) and `power of`, as in
`say 2 power of 3`.

`say` accepts several pieces separated by commas. E++ inserts a space only
where two pieces would otherwise run together, so `say "Hi-", 'Word'` prints
`Hi-there`, `say "Hi", 'Word'` prints `Hi there`, and
`say "Hello, ", 'Name'` prints `Hello, Ada` with one space.

---

## 13. Which libraries are in `E++.zip`

| Library | `E++.zip` | Full Studio |
| --- | --- | --- |
| Math, Random, Strings, Colors, Console, Time, Files, System, Python, Draw, Image | ✅ | ✅ |
| Keyboard | ✅ | ✅ |
| ImprovedWaitLite | ✅ | ✅ |
| Game | ❌ | ✅ |
| ImprovedWait | ❌ | ✅ |

Adding a library this build does not contain raises `E302` with the reason and
a suggestion (`ImprovedWaitLite`), instead of pretending the library exists.

---

## 14. Diagnostics

| Code | Meaning |
| --- | --- |
| `E101` | Syntax error (invalid note syntax, malformed statement) |
| `E103` | `otherwise` placed on the same line as `if ... then` |
| `E104` | `otherwise` without a preceding `if` |
| `E201` | Undefined variable or unknown actor |
| `E202` | Golden Rule 2 violation (double quotes for a variable) |
| `E301` | Library not added |
| `E302` | Library not part of this build |
| `E401` | Golden Rule 1 violation (math in quotes) |
| `E402` | Golden Rule 3 violation (unquoted text word in string context) |
| `E404` | File not found |
| `E511` | Not an E++ project file |
| `E512` | Truncated or damaged project file |
| `E513` | Written by a different release |
| `E520` | The key does not open this project |
| `E521` | No key available |
| `E522` | Bad `--key` (needs 64 hex characters) |
| `E601` | Missing offline runtime lexer (`epp_language.zip`) |
| `E701` | Python `turtle` is prohibited |
| `E702` | Python runtime exception |
