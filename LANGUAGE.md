# The E++ Language Reference (1.4rc1)

> **"Looks like English, feels like english, and is english"**

This is the reference for **E++ 1.4rc1**. It covers the language itself, the
project files you download and import, and the libraries that ship with this
release.

---

## 1. File formats

| Extension | Use |
| --- | --- |
| `.enpp` | A pure E++ program: no libraries. |
| `.enppl` | A program that uses libraries (`add the "Math" library`, …). |
| `.eppl` / `.eppla` | Older example extensions accepted by the command-line engines; use `.enpp` / `.enppl` for Studio projects. |
| `.enpp` / `.enppl` **downloaded from the Studio** | A project file. E++ opens it with the key it keeps for that project. |

### Project files

- **Export** downloads the file; **Import** opens it again.
- The Studio keeps one key per project in this browser, so you never type a key
  to open your own work. **🔑 Keys** exports them as `epp-keys.json` and
  imports that file elsewhere.
- The command-line engines read the same keyring:

  ```bash
  ./epp --keyring epp-keys.json project.enppl
  python3 epp.py --keyring epp-keys.json project.enppl
  ```

- A file that E++ did not write is refused (`E056`) instead of half-read. Copy
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
   - `let 'Student' be "Sam"`
   - *Never use double quotes for variable names! Double quotes are reserved for text.*
3. **DOUBLE quotes for Strings**:
   - `say "Hello, World!"`
   - `say "1 + 1"` ➔ literal text `"1 + 1"`.

### Migrating to 1.3

Literal text must always be quoted: `say hello` and `let 'Student' be Sam`
now report `E001`; write `say "hello"` and `let 'Student' be "Sam"`.
Unrecognized statements are errors (`E015`), not implicit output. Syntax
checks also inspect inactive branches. Libraries still have their own grammar:
for example `add library Math` is a library declaration, not a text value.

---

## 3. Notes & Comments

```text
note [This is a comment note in E++]
note [Notes are ignored during execution and document your program]
```

`//` and `#` are rejected with `F011`.

---

## 4. Conditionals

### Single-line `if` / next-line `otherwise`

```text
if 'Score' is greater than 50 then say "Passed!"
otherwise say "Failed."
```

- `otherwise` on the same line as `if ... then` ➔ `E021`.
- A standalone `otherwise` ➔ `E022`.
- A block ended with the wrong word ➔ `E019`; a block that never ends ➔ `E018`.

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
let 'Student' be "Sam"

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
note [Colored output is only in the full Studio, not E++.zip]
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

Multi-line blocks preserve indentation, comments and strings. Studio translates
a subset of Python to JavaScript and provides partial standard-library shims;
it is **not** a full Python interpreter. The Python CLI uses its installed
Python runtime. `turtle` is prohibited in every engine (`E048`).

---

## 9A. The Draw library (Studio only)

Draw is available in the **full E++ Studio only**. `E++.zip` and the C++ and
Python CLI runtimes do not include it; adding Draw there reports `Z002`.

```text
add the "Draw" library
define 'pencil' as drawing sprite
let 'spark' be drawing sprite
set the speed of 'pencil' to 200
set the speed of 'spark' to instant
set the color of 'pencil' to "#ffcc88"
'pencil' move right "80"
'pencil' move down "60"
lift the pen of 'spark'
'spark' move left "40"
lower the pen of 'spark'
'spark' move up "30"
clear the drawing
```

- Any single-quoted name works. `define ... as`, `let ... be`, and `set ... to`
  create a sprite and immediately show its labelled cursor in the console.
- Each sprite starts at the center `(0, 0)` with its pen down. Right increases
  x; down increases y. Move `up`, `down`, `left` or `right` by a quoted numeric
  pixel distance. Each sprite keeps its own position, pen and color.
- Program moves animate at 240 pixels/second by default. `set the speed of
  'name' to 200` changes that sprite (valid range: greater than 0 up to 100000
  pixels/second); `set the speed of 'name' to instant` moves without animation.
  A move completes before the next statement; Stop interrupts it. The console
  speed menu adjusts the selected cursor while it moves. Manual arrows move
  immediately.
- `lift the pen of 'name'` moves without drawing; `lower the pen of 'name'`
  resumes drawing. `set the color of 'name' to "purple"` accepts CSS colors.
- `clear the drawing` clears trails but keeps sprites and their positions.
  A new run resets the drawing surface. Assigning a normal value to a drawing
  variable removes its cursor.
- In the console, select a cursor and use the arrow buttons. Alternatively,
  focus the canvas and use the arrow keys: ten pixels per press, or one while
  holding Shift. Draw and Game may be used in the same Studio program.

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
create the actor 'hero'
put the actor 'hero' at 0 and 120
note [An actor size is a multiplier: 1 is normal, 2 is twice as big]
set the size of the actor 'hero' to 2

show the actor 'hero'
hide the actor 'hero'
```

- An actor's **name behaves like a variable that loads its image**.
- `put ... at X and Y` measures from the middle of the window: `0 and 0` is the
  centre, so a game looks the same at any window size.
- A **picture book** belongs to the project: link a picture to a name once and
  that name is that picture from then on. The Studio's **🖼 Image** panel (drop a
  file, name it, press Link) adds the link *and* writes `create the actor 'hero'`
  for you — the picture itself stays out of the program.

### Linking pictures in the program

```text
link the image "hero.png" to the actor 'hero'
link the image "data:image/png;base64,..." to the name 'gem'

create the actor 'hero'
set the image of the actor 'hero' to "hero-alt.png"
```

- `link the image ... to the actor '…'` (or `to the name '…'`) binds a picture to
  a name. `create` and any later `create` of that name use it.
- `set the image of the actor '…' to ...` changes the picture of an actor that
  already exists, and updates the link for that name.
- `create the actor 'hero' with the image "<source>"` still works, and links the
  name as a side effect.
- An actor whose name has no picture yet still runs: it draws a labelled tile,
  and the Studio says how to link one. Unreadable uploads are rejected, and
  failed existing links are identified so you can relink a local image.

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
words mean anything (`E042` if it is not):

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
`uppercase of "e++"`, `length of "hello"`).

`say` accepts several pieces separated by commas. E++ inserts a space only
where two pieces would otherwise run together, so `say "Hi-", 'Word'` prints
`Hi-there`, `say "Hi", 'Word'` prints `Hi there`, and
`say "Hello, ", 'Name'` prints `Hello, Ada` with one space.

---

## 13. Which libraries are in `E++.zip`

| Library | `E++.zip` | Full Studio |
| --- | --- | --- |
| Math, Random, Strings, Console, Time, Files, System, Python | ✅ | ✅ |
| Colors | ❌ | ✅ |
| Draw | ❌ | ✅ |
| Keyboard | ✅ | ✅ |
| ImprovedWaitLite | ✅ | ❌ |
| Game | ❌ | ✅ |
| ImprovedWait | ❌ | ✅ |

This table describes the browser workspaces. The command-line engines have
no canvas and report `Z002`/`Z003` for Draw and Game. The ZIP’s C++ and Python
engines also reject Colors, including after rebuilding its sources; the full
repository CLI runners still support Colors. Adding an unavailable library
reports its reason instead of pretending it exists. The legacy JavaScript core
also contains an older Image grammar; Studio picture projects use Game's image
panel instead.

---

## 14. Diagnostics

Every message E++ prints has a code. 1.4rc1 defines exactly one hundred of them:

| Family | Count | Meaning |
| --- | --- | --- |
| `E001`-`E075` | 75 | General errors. The program stops. |
| `W001`-`W005` | 5 | Warnings. The program keeps running. |
| `Z001`-`Z005` | 5 | Only ever raised by `E++.zip`, the standalone distribution. |
| `F001`-`F015` | 15 | Fatal lexer errors. Raised while reading the source; the parser never raises them. |

An error looks like this:

```
[E++ Error E018: Unclosed Block]
  --> game.eppl:7:1
   |
     | repeat 3 times
     | ^
   = Reason: This repeat block has no matching ending.
   = Help: Close the block with its own ending, for example: end repeat
```

A warning is printed the same way but prefixed `[E++ Warning W001: ...]`, and
the program carries on. `EPP.Diagnostics.warnings()` returns them for the
Studio pre-flight, and `EPP.run(source, { onWarning })` streams them live.

Studio tokenizes programs with the same `src/lexer.cpp` as the C++ CLI,
compiled to WebAssembly. Its browser evaluator is JavaScript, not the native
C++ parser and interpreter. If the compiled lexer cannot load, execution stops
with the critical lexer failure `F015`; there is no silent alternate lexer.

### General errors (75)

| Code | Name | What to do |
| --- | --- | --- |
| `E001` | Unquoted Text | Put text in double quotes, or use single quotes for a variable. |
| `E002` | Bare Variable Name | Write the variable name inside single quotes, for example: let 'score' be 0 |
| `E003` | Missing Value | Give the statement a value to use, for example: say "Hello" |
| `E004` | Unfinished Value | Finish the value, for example: say 2 plus 3 |
| `E005` | Unterminated Double Quote | Close the string with a second double quote (") on the same line. |
| `E006` | Unterminated Single Quote | Close the variable name with a second single quote (') on the same line. |
| `E007` | Empty Variable Name | Put a name between the single quotes, for example: 'score' |
| `E008` | Empty Value | Give the statement something between the quotes, or remove the quotes. |
| `E009` | Invalid Character In A Variable Name | Use letters, digits, spaces, underscores or hyphens inside the quotes. |
| `E010` | Value Out Of Range | Use a smaller value, for example: repeat 10 times |
| `E011` | Value Is Not A Number | Use a number, or a variable that holds a number. |
| `E012` | Unsupported Escape Sequence | E++ understands \n, \t, \", \\ and \r inside double quotes. |
| `E013` | Equation Inside Quotes | Remove the quotes so E++ can work out the maths: say 1 plus 1 |
| `E014` | Empty String | Write something between the quotes: say "Hello" |
| `E015` | Unknown Statement | Statements start with a word such as say, let, if, repeat, while, note or add library. |
| `E016` | Empty Statement | Remove the leftover punctuation or put a statement on that line. |
| `E017` | Unexpected Block Ending | Remove the leftover ending, or open the block it belongs to. |
| `E018` | Unclosed Block | Close the block with its own ending, for example: end repeat |
| `E019` | Mismatched Block Ending | An if closes with end if, a repeat with end repeat and a while with end while. |
| `E020` | Missing Then | Write the decision like this: if 1 is 1 then say "Yes" |
| `E021` | Invalid Otherwise Placement | Move otherwise to the line straight after its if. |
| `E022` | Standalone Otherwise | Put otherwise immediately after the if it belongs to. |
| `E023` | Missing Repeat Count | Write the loop like this: repeat 3 times |
| `E024` | Invalid Repeat Count | Repeat needs a whole number from 0 to 100000, for example: repeat 3 times |
| `E025` | Missing While Condition | Write the loop like this: while 'count' is less than 4 do |
| `E026` | Invalid Comparison | Compare with "equal to", "greater than", "less than" or the number tests. |
| `E027` | Invalid Condition | Write a condition such as: if 'score' is greater than 10 then |
| `E028` | Undefined Variable | Define the variable first, for example: let 'score' be 0 |
| `E029` | Variable Already Defined | Pick another name, or change the existing variable with Set. |
| `E030` | Invalid Variable Name | Write the name in single quotes, for example: let 'score' be 0 |
| `E031` | Missing Assignment Value | Give the variable a value, for example: let 'score' be 0 |
| `E032` | Not A Number | Use a number, or a variable that holds a number, in the maths. |
| `E033` | Division By Zero (fraction) | A fraction cannot have zero underneath. Change the number after "divided by". |
| `E034` | Square Root Of A Negative Number | Square roots need a number that is zero or more. |
| `E035` | Invalid Fraction | A fraction cannot have zero underneath. |
| `E036` | Variables Are Not Quoted | Variables use single quotes and text uses double quotes. |
| `E037` | Change Needs A Number | Only numbers can go up or down: define 'score' as 0 first. |
| `E038` | Amount Must Be A Number | Write a number after "by", for example: Increase 'score' by 1 |
| `E039` | Ask Needs A Variable | Save the answer like this: ask "Name?" and save the output as 'name' |
| `E040` | Missing Ask Question | Give the ask a question, for example: ask "Your name?" and save the output as 'name' |
| `E041` | Variable Name Is Too Long | Keep variable names to 64 characters or fewer. |
| `E042` | Library Not Added | Add the library before using what it unlocks, for example: add library "Math" |
| `E043` | Unknown Library | Check the spelling, or look at the Libraries panel for the full list. |
| `E044` | Library Name Not Quoted | Write the library name in double quotes, for example: add library "Math" |
| `E045` | Invalid Library Statement | Write it like this: add library "Math" |
| `E046` | Libraries Need An .eppla File | Rename the file so it ends in .eppla: a file that uses libraries is an .eppla file. |
| `E047` | Python Library Not Added | Add this line above the Python code: add library "Python" |
| `E048` | Python Code Is Not E++ | To run Python, add the Python library and use: python code "..." |
| `E049` | Python Code Block Never Ends | Close the Python block with its own closing quote. |
| `E050` | Empty Python Code | Put the Python code between the quotes: python code "print(1)" |
| `E051` | Library Already Added | Remove the repeated line; the library is already loaded. |
| `E052` | File Needs A Name | Give the file a name such as hello.eppl or game.eppla. |
| `E053` | File Already Exists | Pick a different name, or open the existing file. |
| `E054` | File Not Found | Create the file first, or pick another one in the explorer. |
| `E055` | Wrong File Extension | Files that use libraries are .eppla files; files without libraries are .eppl files. |
| `E056` | Not An E++ Project | Open a project file that E++ saved, or start a new .eppl file. |
| `E057` | Damaged Project File | Download the project again to get a complete file. |
| `E058` | Project Saved By Another Release | Open the project with the release that saved it, then save it again. |
| `E059` | Key Does Not Open This Project | Import the project in the browser that saved it, or add its key. |
| `E060` | E++ Does Not Use This Punctuation | E++ uses words for maths: plus, minus, times, divided by. |
| `E061` | Symbols Are Not Values | Names start with a letter or an underscore. |
| `E062` | Wrong Decimal Separator | Write decimal numbers with a full stop: 2.5 |
| `E063` | Unexpected End Of Line | Finish the statement, or continue it on the next line. |
| `E064` | Unexpected End Of Program | Finish the idea: a value, a condition or a block ending is missing. |
| `E065` | Unclosed Parenthesis | Add the closing ) where the maths ends. |
| `E066` | Division By Zero (numbers) | Change the number after "divided by" so it is not zero. |
| `E067` | The Program Ran Too Long | Check for a loop that never ends. |
| `E068` | Endless Loop | Make sure the loop can finish, or add conditions that eventually stop it. |
| `E069` | Stop Used Outside A Repeat | stop ends a repeat loop, so put it inside repeat ... end repeat. |
| `E070` | Execution Stopped | Press Run again when you are ready. |
| `E071` | Picture Is Empty | Link a picture file to the actor: link the image "hero.png" to the actor 'hero' |
| `E072` | Value Is Not A Picture | Use a picture file such as "hero.png", or pick one with the Image button. |
| `E073` | Unknown Actor | Create the actor first: create the actor 'hero' with the image "hero.png" |
| `E074` | Unknown Image | Define the image first: define 'cat' as image "<picture>" |
| `E075` | Sprite Not Defined | Define the sprite first: define 'pencil' as drawing sprite |

### Warnings (5)

| Code | Name | What to do |
| --- | --- | --- |
| `W001` | Text Looks Like An Equation | Remove the quotes if you wanted the maths: say 1 plus 1 |
| `W002` | Variable Name Looks Like Text | Use double quotes for text and single quotes for variables. |
| `W003` | Library Added But Unused | Remove the library line, or use one of its features. |
| `W004` | Continued On The Next Line | One statement per line keeps the structure clear. |
| `W005` | Number Written As Text | Write the number without double quotes, for example: wait 2 seconds |

### E++.zip only (5)

| Code | Name | What to do |
| --- | --- | --- |
| `Z001` | Colors Live In The Studio | Download the full E++ Studio to print in color. In E++.zip use a plain say statement. |
| `Z002` | Draw Is Not In E++.zip | Download the full E++ Studio to draw with sprites. |
| `Z003` | Game Is Not In E++.zip | Download the full E++ Studio to create games and actors. |
| `Z004` | ImprovedWait Is Not In E++.zip | In E++.zip use ImprovedWaitLite: add library "ImprovedWaitLite" |
| `Z005` | JavaScript Runtime Is Not In E++.zip | Use the native engine or epp.py in E++.zip, or download the full Studio for the JavaScript runtime. |

### Fatal lexer errors (15)

| Code | Name | What to do |
| --- | --- | --- |
| `F001` | Lexer Received Invalid Input | Pass the program as text (a string) to the lexer. |
| `F002` | The Program Is Too Large To Lex | Split the program into smaller files. |
| `F003` | Unrecognised Character | E++ uses words for maths. Remove or replace this character. |
| `F004` | Unterminated String | Close the string, for example: say "Hello". |
| `F005` | Unterminated Variable Name | Close it, for example: say 'name'. |
| `F006` | Empty Variable Reference | Put a variable name between the single quotes. |
| `F007` | Reserved Lexer Code | Not emitted. An unterminated note is the general error `E064`. |
| `F008` | Note Without Brackets | Write notes like this: note [Your note] |
| `F009` | Line Contains A Null Character | Remove the invisible NUL character (it usually arrives from a binary file). |
| `F010` | Unrecognised Number | Write numbers as digits, for example 42 or 3.5. |
| `F011` | Comment Characters Are Not E++ | E++ notes do not use // or #. Use: note [Your note] |
| `F012` | Word Is Too Long | Keep words to 256 characters or fewer. |
| `F013` | Unexpected End Of Input Inside A Value | Finish the value before the line or the program ends. |
| `F014` | Invalid Escape Sequence | E++ understands \n, \t, \", \\ and \r inside double quotes. |
| `F015` | Lexer Could Not Build The Token Stream | This is a bug in E++: report it with the program that caused it. |
