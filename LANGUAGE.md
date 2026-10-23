# The E++ Language Reference (1.2 Encryption++)

> **"Looks like English, feels like english, and is english"**

This is the reference for **E++ 1.2 Encryption++**. It covers the language
itself, the sealed project format you meet when you download or import a file,
and the libraries that ship with this release.

---

## 1. File formats

| Extension | Use |
| --- | --- |
| `.enpp` | A pure E++ program: no libraries. |
| `.enppl` | A program that uses libraries (`add the "Math" library`, …). |
| `.eppla` | The older name for a library program; still accepted everywhere. |
| `.enpp` / `.enppl` **downloaded from the Studio** | A sealed project. It is not text: it is a block of base64 that only a saved key opens. |

### Sealed projects

- Every download is written with a key generated for that download. The key is
  never stored inside the file.
- The Studio keeps keys in the browser's key store. Importing a project tries
  each remembered key until one opens it; if none does, the Studio says which
  keyring you probably need.
- **🔑 Keys** exports them as `epp-keys.json` and imports that file elsewhere.
- The command-line engines read the same keyring:

  ```bash
  ./epp --keyring epp-keys.json project.enppl
  python3 epp.py --keyring epp-keys.json project.enppl
  ```

- Importing a plain-text `.enpp` / `.enppl` file is refused (`E511`). Copy the
  code into a new file in the Studio instead, or seal it from the CLI:

  ```bash
  ./epp --encrypt plain.enpp -o sealed.enpp
  ```

The repository's own sealed example is `examples/17_sealed_project.enpp`, opened
with `examples/epp-keys.json`; the Studio picks that example keyring up on
boot, so the demo opens in the browser as well.

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

```text
repeat 3 times:
    say "E++ makes programming read like a book!"
end repeat
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

## 12. Which libraries are in `E++.zip`

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

## 13. Diagnostics

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
| `E511` | Not a sealed E++ project |
| `E512` | Truncated or damaged sealed project |
| `E513` | Sealed with a different release |
| `E520` | The key does not open this project |
| `E521` | No key available |
| `E522` | Bad `--key` (needs 64 hex characters) |
| `E601` | Missing offline runtime lexer (`epp_language.zip`) |
| `E701` | Python `turtle` is prohibited |
| `E702` | Python runtime exception |
