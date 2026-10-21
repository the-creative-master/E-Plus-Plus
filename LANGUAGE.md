# The E++ Language Reference (Release 1.0)

> **"Looks like English, feels like english, and is english"**

Welcome to **E++ Release 1.0**, a complete, modern, human-readable programming language designed to read and behave like pure English prose.

---

## 1. File Types

- **`.enpp` (Pure E++)**: Used for clean, pure programs without any external libraries.
- **`.enppl` (E++ Libraries)**: Used for programs that import standard libraries (e.g. `add the "Math" library`, `add the "Python" library`).

---

## 2. The 3 Golden Rules

1. **NO quotes for Math**:
   - `say 1 plus 1` ➔ Evaluates to `2`
   - `say 2 times 3` ➔ Evaluates to `6`
2. **SINGLE quotes for Variables**:
   - `let 'Grade' be 29`
   - `let 'Student' be Sam`
   - *Never use double quotes for variable names! Double quotes are strictly reserved for text strings.*
3. **DOUBLE quotes for Strings**:
   - `say "Hello, World!"`
   - `say "1 + 1"` ➔ Outputs literal text `"1 + 1"`.

---

## 3. Notes & Comments

In E++, comments are written using `note` with **square brackets**:
```text
note [This is a comment note in E++]
note [Notes are ignored during execution and document your program]
```
> ⚠️ **Syntax rule**: E++ rejects `// note` and `#`. Attempting to use them will produce an informative Syntax Error explaining the `note [Note]` syntax.

---

## 4. The 9 Standard Libraries in Release 1.0

Import any library using the humanizer syntax: `add the "<Name>" library`.

### 1. Python (`"Python"`)
Bridges the Python runtime into E++ with automatic bi-directional variable injection and output capture. The engine runs natively (and via the lightweight lexer/interpreter in Web Studio without Pyodide), with full support for Python standard libraries (`math`, `random`, `json`, `re`, `statistics`, `time`, `datetime`, `string`, `sys`, `os`, etc.), while explicitly blocking `turtle`:
```text
add the "Python" library

note [Single-line Python execution:]
run the python code "print('Hello from Python!')"

note [Multi-line Python block with standard libraries:]
run the python code:
import json, re, statistics
data = json.loads('{"name": "EPP", "version": 1.0}')
mean_val = statistics.mean([10, 20, 30])
print(f"Data name: {data['name']}, mean: {mean_val}")

note [Accessing E++ variables inside Python:]
let 'Greeting' be "Welcome to E++ and Python!"
run the python code "print('E++ says:', greeting)"

note [Capturing Python output back into E++:]
run the python code "import math; print(math.factorial(6))" and save the output as 'Result'
say "Factorial:", 'Result'
```

### 2. Math (`"Math"`)
Natural English mathematical calculations:
```text
add the "Math" library

say the square root of 144
say the cube root of 27
say how much 20 percent is of 150
say the absolute value of 0 minus 42
say 2 raised to 8
say the minimum of 15 and 99
say the maximum of 15 and 99
say the value of pi
say the value of e
```

### 3. Random (`"Random"`)
Random number generation, dice rolls, and coin flips:
```text
add the "Random" library

say a random number between 1 and 100
say roll a dice
say roll a dice with 20 sides
say flip a coin
```

### 4. Strings (`"Strings"`)
Rich string inspection and manipulation:
```text
add the "Strings" library

let 'Msg' be "Hello, World!"
say the length of 'Msg'
say the uppercase of 'Msg'
say the lowercase of 'Msg'
say the reverse of 'Msg'
say the first letter of 'Msg'
say the last letter of 'Msg'

let 'Spaced' be "   Text with spaces   "
say the trim of 'Spaced'
```

### 5. Time & Date (`"Time"`)
System clocks, calendar info, timestamps, and delays:
```text
add the "Time" library

say the current time
say the current date
say the current year
say the current timestamp

say "Waiting 500 milliseconds..."
wait 500 milliseconds
say "Waiting 1 second..."
wait 1 second
```

### 6. Files (`"Files"`)
Full disk file persistence in the C++ engine (and virtual filesystem in Web Studio):
```text
add the "Files" library

write "Release 1.0 verified!" to file "log.txt"
append "\nSystem operational." to file "log.txt"
read the file "log.txt" and save the output as 'LogData'
say 'LogData'
```

### 7. System (`"System"`)
Platform architecture, operating system, and system shell commands:
```text
add the "System" library

say the platform
say the os
run system command "whoami" and save the output as 'CurrentUser'
say "Logged in as:", 'CurrentUser'
```

### 8. Colors (`"Colors"`)
Terminal colored output streams (ANSI in native CLI, styled spans in Web Studio):
```text
add the "Colors" library

say green "✓ Success: Build completed!"
say blue "ℹ Info: Processing batch..."
say yellow "⚠ Warning: Check input parameters."
say red "✗ Error: Connection failed."
say cyan "✦ Notice: System online."
say magenta "★ Milestone reached!"
```

### 9. Console (`"Console"`)
Real-time console stream management:
```text
add the "Console" library

clear the console
```

---

## 5. Control Flow

### Single-Line If & Otherwise Statements
E++ supports natural single-line `if ... then` statements. The `otherwise` branch can be attached on the line immediately following the `if`:
```text
if 1 plus 1 is equal to 2 then say "Duh, its math"

let 'Answer' be 2
if 'Answer' is equal to 2 then say "Correct!"
otherwise say "U dumb?"
```
**Important Grammar Rules:**
- `otherwise` **cannot** be placed on the same line as `if ... then` (e.g. `if 1 is equal to 1 then say "A" otherwise say "B"` is a syntax error).
- `otherwise` **cannot** appear as a standalone statement without an `if` on the immediately preceding line.

### Multi-Line Block If Statements
```text
if 10 is greater than 5 then:
    say "Ten is greater!"
otherwise:
    say "Not greater!"
end if
```

### Loops
```text
repeat 3 times:
    say "Repeating!"
end repeat

let 'Counter' be 0
while 'Counter' is less than 3 do:
    let 'Counter' be 'Counter' plus 1
    say "Counter is: ", 'Counter'
end while
```
