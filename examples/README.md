# E++ 1.5a1 examples

Ten short programs, each one teaching a part of the language. Every file runs
in the native engine (`./epp file.enpp`) and the Python engine
(`python3 epp.py file.enpp`); the Studio runs all of them too.

| File | What it teaches |
| --- | --- |
| `01_hello.enpp` | `say`, quoted text and unquoted maths. |
| `02_arithmetic.enpp` | `plus`, `minus`, `times`, `divided by` and `check if ... is a number`. |
| `03_variables_and_questions.enpp` | `let 'name' be`, `ask ... and save the output as`. |
| `04_control_flow.enpp` | `if` / `otherwise`, `repeat N times`, `repeat until` and `while`. |
| `05_math_library.enppl` | The Math library: roots, percentages, pi and random numbers. |
| `06_files_library.enppl` | The Files library: `write`, `append`, `read` and **`delete the file`** (new in 1.5a1). |
| `07_wait_until.enppl` | **`wait until`** and `wait at most` (new core statements in 1.5a1). |
| `08_python_library.enppl` | The Python library: one line, a block, and E++ variables in Python. |
| `09_strings_library.enppl` | The Strings library: length, case, reverse, letters and trim. |
| `10_saved_project.enpp` | A sealed project file, opened with `epp-keys.json`. |
| `11_studio_showcase.enppl` | The full Studio: Draw, Game, Keyboard and every library at once. |

`10_saved_project.enpp` is not readable text — it is a sealed project, and
`epp-keys.json` holds the key that opens it:

```bash
./epp --keyring examples/epp-keys.json examples/10_saved_project.enpp
python3 epp.py --keyring examples/epp-keys.json examples/10_saved_project.enpp
```

`11_studio_showcase.enppl` needs the full Studio (`index.html`); `E++.zip` and
the command-line engines leave it out, because Draw and Game are Studio-only.
