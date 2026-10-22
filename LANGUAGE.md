# The E++ Language Reference (1.1 Workspace Patch 2)

> **"Looks like English, feels like english, and is english"**

Welcome to **E++ 1.1 Workspace Patch 2**, a modern, human-readable programming language designed to read and behave like pure English prose.

---

## 1. File Formats

- **`.enpp`**: Used for standard E++ programs.
- **`.enppl`**: Used for programs utilizing standard libraries (e.g. `add the "Math" library`, `add the "Python" library`).

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
> ⚠️ **Syntax rule**: E++ rejects `// note` and `#`. Attempting to use them will produce deterministic error `E101`.

---

## 4. Conditionals & Single-Line Syntax

### Single-Line `if` / Next-Line `otherwise`
```text
if 'Score' is greater than 50 then say "Passed!"
otherwise say "Failed."
```

### Syntax Constraints:
- `otherwise` on the same line as `if ... then` produces `[E++ Error E103: Invalid Otherwise Placement]`.
- Standalone `otherwise` without preceding `if` produces `[E++ Error E104: Standalone Otherwise]`.

---

## 5. Python Integration (1.1 Workspace Patch 2)

To run Python, add the `"Python"` library:
```text
add the "Python" library
```

### Single-Line Execution
```text
run the python code "print('Hello from Python')"
run the python code "result = 42" and save the output as 'Answer'
```

### Multi-Line Blocks
```text
run the python code:
    import json
    import math

    data = {"pi": math.pi, "status": "ok"}
    print("Parsed JSON:", json.dumps(data))
```

- Multi-line blocks are treated as raw verbatim text and passed directly to Python `exec()`.
- Standard library modules supported: `math`, `random`, `json`, `re`, `statistics`, `time`, `datetime`, `string`, `sys`, `os`.
- `turtle` is strictly forbidden across all engines and triggers `[E++ Error E701: Python Library Prohibited]`.

---

## 6. Deterministic Diagnostic Registry

- `E101`: Syntax Error (invalid note syntax, malformed statement)
- `E103`: Invalid Otherwise Placement (`otherwise` on same line as `if`)
- `E104`: Standalone Otherwise (`otherwise` without preceding `if`)
- `E201`: Undefined Variable
- `E202`: Golden Rule 2 Violation (double quotes for variable)
- `E301`: Library Not Added
- `E401`: Golden Rule 1 Violation (quoted math)
- `E402`: Golden Rule 3 Violation (unquoted text word in string context)
- `E601`: Missing Offline Runtime Lexer
- `E701`: Python Library Prohibited (`turtle` blocked)
- `E702`: Python Runtime Exception
