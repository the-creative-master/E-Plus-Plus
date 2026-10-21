# E++ Programming Language [Release 1.0]
> **"Looks like English, feels like english, and is english"**

Welcome to **E++ Release 1.0**, a complete, modern, human-readable programming language designed to look, feel, and read like pure English prose. Fast, bug-free, zero bloat, and fully equipped with 9 standard libraries across both a native C++ engine and a web studio.

---

## 📁 File Types: `.enpp` & `.enppl`

- **`.enpp` (Pure E++)**: Used for clean, pure programs without external libraries.
- **`.enppl` (E++ Libraries)**: Used for programs importing any standard library (e.g. `add the "Math" library`, `add the "Python" library`).

---

## ⚡ The 3 Golden Rules of E++

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

## 📝 Notes & Comments
In E++, comments are written using `note` with **square brackets**:
```text
note [This is a comment note in E++]
note [Notes are ignored during execution and document your program]
```
> ⚠️ **Syntax rule**: E++ rejects `// note` and `#`. Attempting to use them will produce an informative Syntax Error explaining the `note [Note]` syntax.

---

## 📚 Standard Libraries in Release 1.0

Import any library using the humanizer syntax: `add the "<Name>" library`.

### 1. 🐍 Python Library (`"Python"`)
Bridges the Python 3 runtime into E++ with automatic bi-directional variable injection and output capture:
```text
add the "Python" library

note [Single-line Python code:]
run the python code "print('Hello from Python!')"

note [Multi-line Python block with loops:]
run the python code:
for I in range 3:
    print("Loop iteration:", I)

note [Accessing E++ variables inside Python:]
let 'Student' be "Sam"
let 'Grade' be 95
run the python code:
if Grade >= 90:
    print(f"{Student} passed with honors!")

note [Capturing Python output back into E++:]
run the python code "import math; print(math.factorial(6))" and save the output as 'Fact'
say "Factorial:", 'Fact'
```

### 2. 🧮 Math Library (`"Math"`)
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

### 3. 🎲 Random Library (`"Random"`)
Random number generation, dice rolls, and coin flips:
```text
add the "Random" library

say a random number between 1 and 100
say roll a dice
say roll a dice with 20 sides
say flip a coin
```

### 4. 🔤 Strings Library (`"Strings"`)
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

### 5. ⏱️ Time & Date Library (`"Time"`)
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

### 6. 💾 Files Library (`"Files"`)
Full disk file persistence (and virtual filesystem in Web Studio):
```text
add the "Files" library

write "Release 1.0 verified!" to file "log.txt"
append "\nSystem operational." to file "log.txt"
read the file "log.txt" and save the output as 'LogData'
say 'LogData'
```

### 7. 💻 System Library (`"System"`)
Platform architecture, operating system, and system shell commands:
```text
add the "System" library

say the platform
say the os
run system command "whoami" and save the output as 'CurrentUser'
say "Logged in as:", 'CurrentUser'
```

### 8. 🎨 Colors Library (`"Colors"`)
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

### 9. 📺 Console Library (`"Console"`)
Real-time console stream management:
```text
add the "Console" library

clear the console
```

---

## 🛠️ Building & Running

```bash
# Clean compilation:
make clean && make

# Run pure .enpp file:
./epp examples/01_hello.enpp

# Run library-powered .enppl file:
./epp examples/16_release_showcase.enppl

# Inline one-liner execution:
./epp -e 'say 1 plus 1'

# Interactive English REPL:
./epp

# Check version:
./epp --version
```

---

## 🌐 E++ Web Studio (`index.html`)

- **Guaranteed Terminal Visibility**: 50/50 side-by-side split guarantees both Editor and Terminal Console are 100% visible and never clipped or hidden on any screen size.
- **Live Stats Dashboard**: Tracks Active File, File Type pill badges, Active Libraries, and Line counts.
- **Interactive File Explorer**: Full support for `.enpp` and `.enppl` files with search, instant creation, renaming, and export.
- **Embedded Python Subsystem**: Executes inline and multi-line Python code seamlessly inside the browser.
- **One-Click Bundle Export**: Download `E++.zip` containing all C++ source files, headers, Makefile, and examples.
