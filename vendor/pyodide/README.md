# Vendored Python runtime (Pyodide)

These files are the **core Pyodide 0.26.4 runtime** (CPython compiled to
WebAssembly), copied from the official `pyodide` npm package
(Apache-2.0 licensed; Pyodide itself is MPL-2.0 — see
https://github.com/pyodide/pyodide).

They are bundled with the E++ IDE so the Python library
(`library "Python" add` + `python code "..."`) works **without
downloading anything from a CDN** — Python ships with the IDE and runs
entirely in the browser, offline, from the same origin as the page.

Only the core runtime is included. Files:

| File | What it is |
|---|---|
| `pyodide.js` | Small loader that defines `loadPyodide` |
| `pyodide.asm.js` | WebAssembly glue code |
| `pyodide.asm.wasm` | The CPython interpreter compiled to WebAssembly |
| `python_stdlib.zip` | Python's standard library |
| `pyodide-lock.json` | Package index (for optional extra packages) |

To update: download a newer `pyodide` package from npm and replace these
five files with the same-named files from it.
