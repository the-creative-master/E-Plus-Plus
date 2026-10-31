> **E++ 1.4a1 — first alpha:** Studio now has a VS Code-inspired editor and output layout. Open **Settings** to choose an accent color or turn off automatic `.enpp` → `.enppl` renaming when a library is added. Settings and files remain local to your browser; existing files are never overwritten by an automatic rename. This is an early preview of 1.4.

# E++ 1.3.5

E++ is a small, English-like programming language with a browser Studio, a C++ command-line engine and a Python runner. Write text in double quotes, variables in single quotes, and maths as numbers and words.

```text
let 'name' be "Ada"
say "Hello, ", 'name'
say 2 plus 3 times 4
```

## What’s new in 1.3.5

- **EShare:** turn an E++ project (including its pictures) into a portable code, then import it in another browser. No server or account is required.
- **Animated Draw:** each drawing cursor has its own speed in pixels per second, plus an explicit instant mode. The console also has a speed selector and manual controls.
- **More reliable Game pictures:** local files are decoded before they can be linked, transparent images stay transparent, and broken links explain how to repair them. The example images are included offline.
- **Fresh documentation:** start with the tutorials below, open **Learn** in Studio, or read the [complete wiki](WIKI.md) and [language reference](LANGUAGE.md).
- **Smaller standalone library set:** `E++.zip` no longer includes the Colors library. Draw, Game and ImprovedWait remain Studio-only; ImprovedWaitLite is in the ZIP. Strict errors remain in both builds.

The 1.3 responsive Studio, named drawing cursors, project files, strict diagnostics and compiled C++ browser lexer are retained. Upgrading never overwrites existing local projects.

## Start the Studio

Requirements: Node.js 18 or newer. No npm packages are needed to run the server.

```bash
npm start
```

Open `http://localhost:8000` on that machine. On phones, use the **Files / Code / Output** tabs and the **Tools** menu. The editor saves personal working copies in this browser. **Learn** opens the interactive lessons; **Wiki** opens the offline guide in the same tab, with a link back to Studio.

You can also open `index.html` directly for offline editing, Draw, Game and EShare.

## Quick tutorials

### 1. Say hello

Create a file, type the following and press **Run code**:

```text
say "Hello, world!"
say 7 plus 5
```

Text needs double quotes. `say hello` is an error (`E402`), not a shortcut for printing text.

### 2. Variables and questions

```text
ask "What is your name?" and save the output as 'name'
say "Hello, ", 'name'
let 'score' be 10
say "Next score:", 'score' plus 1
```

Type your answer in the console. Variable names use single quotes and are case-insensitive.

### 3. Decisions and loops

```text
let 'count' be 1
while 'count' is less than 4 do
  say 'count'
  let 'count' be 'count' plus 1
end while
```

Try `repeat 3 times` … `end repeat`, or an `if ... then` followed by `otherwise` on the next line. Notes use `note [text]`.

### 4. Draw an animated square (full Studio)

```text
add library "Draw"
define 'pencil' as drawing sprite
set the speed of 'pencil' to 200
'pencil' move right "100"
'pencil' move down "100"
'pencil' move left "100"
'pencil' move up "100"
```

The default speed is 240 pixels/second. Change it per sprite with `set the speed of 'pencil' to 60`, `600`, or `instant`. The console’s speed menu can change the selected cursor while it moves; arrows move it manually. **Stop** interrupts an animation. Draw is not in `E++.zip`.

### 5. Make a Game actor (full Studio)

1. Add `add library "Game"` to a `.enppl` project. The **Image** button appears.
2. Choose a local PNG, JPG, GIF, WEBP or SVG, name it `hero`, and link it. The panel inserts the actor code.
3. Run the program. `create the actor 'hero'` uses the picture linked to that name. You can add `put the actor 'hero' at 0 and 0` to position it at the centre.

An unreadable upload is refused; a broken existing link shows a message and a labelled tile. Upload the file again to relink it. Local uploads are embedded; URLs and relative paths in code still depend on those external resources.

## EShare

Open **EShare** from the activity bar or Tools menu. Choose the current project or select an `.enpp` / `.enppl` file; copy the generated code and send it to someone. To open it, choose **Import → Paste an EShare code**. Imports are saved as new local copies without overwriting existing projects. Pictures are included when present. Plain E++ files and encrypted Studio downloads are supported; encrypted files must be unlockable with the keyring on the device creating the code.

EShare uses an authenticated encrypted container, but the decryption key is included in the share code so recipients can open it without setup. **Anyone with the code can read the project:** do not use it to protect secrets. Nothing is uploaded to a server. The old gallery API remains in the server for compatibility, but EShare replaces the gallery in Studio.

## Command-line engines and testing

In the full source checkout, use:

```bash
make                           # build the native C++ engine
./epp -e 'say 2 plus 3'
python3 epp.py -e 'say "Hello"'
make test                      # C++ and Python regression suite
npm test                       # JavaScript, diagnostics, lexer and gallery tests
make zip                       # rebuild E++.zip and epp_language.zip
```

The full repository’s C++ and Python runners can use Colors, but have no Draw or Game canvas. The copies and native binary inside `E++.zip` reject Colors, Draw and Game with a helpful error, including after rebuilding from the ZIP’s source. In an extracted ZIP, `make`, `make test` and `npm start` work; rebuilding release archives and the `npm test` scripts require the full source checkout. For detailed build differences, see [LANGUAGE.md](LANGUAGE.md#13-which-libraries-are-in-ezip).

In the full checkout, after `make zip`, run `npm run test:distribution` to check the extracted archives. Optional end-to-end tests require `npm install` and a Chromium/Chrome executable: set `EPP_BROWSER` to its path, then run `npm run test:studio` and `npm run test:distribution:browser`.

## Projects and safety

**Export** downloads a sealed project; **Keys** exports or imports the keyring needed to open it on another browser or machine. Keep both safe. EShare codes include the key needed to open them, so share them only with people you trust. Don’t run untrusted projects without reviewing them; native Python integration can execute Python on your computer.

The Studio uses `src/lexer.cpp` compiled to offline WebAssembly and consumes its tokens in a JavaScript evaluator. The native CLI separately uses the C++ parser and interpreter; the browser does not run those components. If the compiled lexer is unavailable, Studio stops with `E601` rather than silently falling back. See [WIKI.md](WIKI.md) for architecture, limitations and troubleshooting.

Licensed under [Apache 2.0](LICENSE); third-party notices are in `third_party/licenses/`.
