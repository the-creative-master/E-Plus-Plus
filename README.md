# E++ Programming Language [1.1 Workspace Patch 1]
> **"Looks like English, feels like english, and is english"**

Welcome to **E++ 1.1 Workspace Patch 1**, a modern, human-readable programming language designed to look, feel, and read like pure English prose. Fast, bug-free, zero bloat, and fully equipped with both native C++ and pure Python runtimes, 9 standard libraries, deterministic error diagnostics, and a zero-dependency offline Web Studio.

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
> ⚠️ **Syntax rule**: E++ rejects `// note` and `#`. Attempting to use them produces a deterministic `[E++ Error E101: Invalid Note Syntax]`.

---

## 🧭 Deterministic Diagnostic Engine

E++ 1.1 Workspace Patch 1 features a deterministic error diagnostic engine that provides exact error codes, source code snippets with caret pointers, and actionable causes and fixes:

```text
[E++ Error E103: Invalid Otherwise Placement] --> script.enpp:5:28
   5 | if 'Score' is 100 then say "Perfect" otherwise say "Good"
     |                            ^
 = Reason: 'otherwise' cannot be placed on the same line as 'if ... then'.
 = Help: In E++, 'otherwise' always has to be on the next line immediately following the 'if' statement.
```

### Error Code Registry
- `E101`: Syntax Error (invalid note syntax, malformed statement)
- `E103`: Invalid Otherwise Placement (`otherwise` on same line as `if`)
- `E104`: Standalone Otherwise (`otherwise` without preceding `if`)
- `E201`: Undefined Variable
- `E202`: Golden Rule 2 Violation (double quotes used for variable name)
- `E301`: Library Not Added (attempting to use library features without `add the "<Lib>" library`)
- `E401`: Golden Rule 1 Violation (math enclosed in quotes)
- `E402`: Golden Rule 3 Violation (unquoted text word in string context)
- `E601`: Missing Offline Runtime Lexer (Web IDE missing `epp_language.zip`)
- `E701`: Python Library Prohibited (`turtle` blocked)
- `E702`: Python Runtime Exception

---

## 📚 Standard Libraries in 1.1 Workspace Patch 1

Import any library using the humanizer syntax: `add the "<Name>" library`.

### 1. 🐍 Python Library (`"Python"`)
Bridges Python 3 directly into E++ with automatic bi-directional variable injection and output capture:
- Single-line: `run the python code "..." and save the output as 'Variable'`
- Multi-line block:
```text
add the "Python" library

run the python code:
    import math
    print(f"Square root of 144 is {math.isqrt(144)}")
```
- Multi-line blocks preserve raw indentation, comments, and strings without tokenization mangling.
- All Python standard modules (`math`, `random`, `json`, `re`, `statistics`, `time`, `datetime`, `string`, `sys`, `os`) are supported.
- `turtle` is strictly prohibited and triggers deterministic error `E701`.

### 2. 🧮 Math Library (`"Math"`)
Extended arithmetic, trigonometry, percentages, constants:
```text
add the "Math" library
say the square root of 64
say how much 15 percent is of 200
say the maximum of 12 and 45
say the value of pi
```

### 3. 🎲 Random Library (`"Random"`)
Random number generation, dice, coin flips:
```text
add the "Random" library
say a random number between 1 and 100
say roll a dice with 20 sides
say flip a coin
```

### 4. 🔤 Strings Library (`"Strings"`)
String inspection and transformations:
```text
add the "Strings" library
say the length of "Hello World"
say the uppercase of "welcome to e++"
say the reverse of "stressed"
```

### 5. 🎨 Colors Library (`"Colors"`)
Terminal ANSI & Web color styling:
```text
add the "Colors" library
say red "Critical Error Detected!"
say green "Build completed successfully!"
```

### 6. ⏱️ Time Library (`"Time"`)
Timestamps, dates, and execution delays:
```text
add the "Time" library
say the current date
say the current time
wait 500 milliseconds
```

### 7. 🖥️ Console Library (`"Console"`)
Console clearing and screen management:
```text
add the "Console" library
clear the console
```

### 8. 📁 Files Library (`"Files"`)
Read, write, and append workspace files:
```text
add the "Files" library
write "E++ 1.1 Workspace Patch 1 Data" to the file "log.txt"
append "\nSecond entry" to the file "log.txt"
read the file "log.txt" and save the output as 'LogData'
say 'LogData'
```

### 9. ⚙️ System Library (`"System"`)
Execute host OS commands safely:
```text
add the "System" library
say the operating system
run system command "uname -a" and save the output as 'Kernel'
say 'Kernel'
```

---

## 🛠️ CLI Quickstart

### Native C++ Engine
```bash
# Compile engine
make clean && make

# Run program
./epp examples/16_release_showcase.enppl

# Run test suite
make test
```

### Standalone Python Runner
```bash
# Run program
python3 epp.py examples/16_release_showcase.enppl
```

---

## 🌐 Web Studio & Offline Runtime (`index.html`)

Open `index.html` in any modern web browser:
- True offline runtime requiring `epp_language.zip` (verifies and loads lexer directly via standard `DecompressionStream`).
- If `epp_language.zip` is missing or deleted, the Web Studio halts and presents deterministic error `E601`.
- 100% Pyodide-free in-browser Python engine.
- Instant export of `.enpp` and `.enppl` files.
