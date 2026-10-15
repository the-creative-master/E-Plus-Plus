/*
 * E++ IDE application.
 * Wires together the editor (with live syntax highlighting), the .eppl file
 * explorer (localStorage), import/export, and the execution engine
 * (lexer -> parser -> AST -> interpreter) with console I/O.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Bundled example programs (also shipped as files in /examples).
  // ------------------------------------------------------------------
  var EXAMPLES = [
    {
      name: 'hello.eppl',
      content:
        'note: Your first E++ program.\n' +
        'Define name as Adonis.\n' +
        'say "Hello " plus \'name\' plus "!"\n' +
        'say "E++ looks like English, reads like English, and behaves like code."\n' +
        '\n' +
        'ask "What is your name?" and save answer as visitor\n' +
        'say "Nice to meet you, " plus \'visitor\' plus "."\n'
    },
    {
      name: 'math.eppl',
      content:
        'note: The Math library unlocks fractions, decimals, percentages,\n' +
        'note: square roots, powers and division.\n' +
        'library "Math" add\n' +
        '\n' +
        'display 1 divided by 2 as fraction\n' +
        'display 1 divided by 2 as decimal\n' +
        'display 1 divided by 3 as fraction\n' +
        'say 50 percent of 200\n' +
        'say square root of 16\n' +
        'say 2 power of 3\n' +
        'say 1 plus 1\n' +
        'say "1 plus 1"\n'
    },
    {
      name: 'quiz.eppl',
      content:
        'note: A tiny quiz. The typed answer is text, but E++ compares\n' +
        'note: numeric answers as numbers automatically.\n' +
        'ask "What is 5 plus 6?" and save answer as output\n' +
        'if output is equal to 11 then say "Correct!" otherwise say "Wrong!"\n' +
        '\n' +
        'ask "What is 9 minus 4?" and save answer as second\n' +
        'if \'second\' is equal to 5 then\n' +
        '  say "Correct again!"\n' +
        'otherwise\n' +
        '  say "Not quite."\n' +
        'end if\n'
    },
    {
      name: 'countdown.eppl',
      content:
        'note: Loops with repeat, and changing a variable with Set.\n' +
        'Define count as 3.\n' +
        '\n' +
        'repeat 3 times\n' +
        '  say \'count\'\n' +
        '  Set count to \'count\' minus 1.\n' +
        'end repeat\n' +
        '\n' +
        'say "Blast off!"\n'
    },
    {
      name: 'calculator.eppl',
      content:
        'note: Answers from ask are text, but maths treats numbers as numbers.\n' +
        'ask "First number?" and save answer as first\n' +
        'ask "Second number?" and save answer as second\n' +
        'say \'first\' plus \'second\'\n' +
        'say \'first\' times \'second\'\n'
    },
    {
      name: 'guessing-game.eppl',
      content:
        'note: The Random library adds random numbers.\n' +
        'library "Random" add\n' +
        '\n' +
        'Define secret as random number between 1 and 10.\n' +
        'ask "I am thinking of a number between 1 and 10. Your guess?" and save answer as guess\n' +
        '\n' +
        'if \'guess\' is equal to \'secret\' then\n' +
        '  say "You guessed it!"\n' +
        'otherwise\n' +
        '  say "No luck this time. The number was " plus \'secret\' plus "."\n' +
        'end if\n'
    },
    {
      name: 'text-tools.eppl',
      content:
        'note: The Text library works with words and sentences.\n' +
        'library "Text" add\n' +
        '\n' +
        'say uppercase of "hello e++"\n' +
        'say lowercase of "LOUD NOISES"\n' +
        'say length of "How long am I?"\n'
    },
    {
      name: 'score-tracker.eppl',
      content:
        'note: Increase and Decrease change a number variable.\n' +
        'Define score as 10.\n' +
        'Increase score by 5\n' +
        'say \'score\'\n' +
        'Decrease score by 3\n' +
        'say \'score\'\n' +
        '\n' +
        'ask "Guess a number" and save answer as guess\n' +
        'if guess is equal to 7 then say "That is the one!" and\n' +
        'otherwise if not a number then say "That was not a number at all." and\n' +
        'otherwise if guess is lesser than 7 then ask "Too low — try again" and save answer as guess and\n' +
        'otherwise ask "Too high — try again" and save answer as guess\n'
    },
    {
      name: 'python.eppl',
      content:
        'note: The Python library lets E++ run real Python code.\n' +
        'note: Python only works after the library line below.\n' +
        'library "Python" add\n' +
        '\n' +
        'python code "print(\'Hello from Python!\')"\n' +
        '\n' +
        'python code "-for number in range(3):\n' +
        '    print(\'Counting in Python:\', number)\n' +
        '"\n' +
        '\n' +
        'say "And now E++ is talking again."\n'
    }
  ];

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  var editor = $('editor');
  var highlightCode = $('highlightCode');
  var lineNumberInner = $('lineNumberInner');
  var consoleOutput = $('consoleOutput');
  var consoleInputForm = $('consoleInputForm');
  var consoleInput = $('consoleInput');
  var consoleInputPrompt = $('consoleInputPrompt');
  var fileList = $('fileList');
  var btnRun = $('btnRun');
  var btnStop = $('btnStop');
  var mobileViewButtons = Array.prototype.slice.call(document.querySelectorAll('.mobile-view-btn'));
  var smallScreenQuery = window.matchMedia('(max-width: 900px)');

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  var store = new EPP.EpplFileStore();
  store.seedIfEmpty(EXAMPLES);

  var currentName = null;
  var running = null;          // { interpreter } while a program runs
  var pendingAnswer = null;    // resolve() for the console input box
  var loadedLibraries = [];
  var saveTimer = null;
  var toastTimer = null;

  // ------------------------------------------------------------------
  // Small UI helpers
  // ------------------------------------------------------------------
  function toast(message, isError) {
    var el = $('toast');
    el.textContent = message;
    el.className = 'toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function appendConsole(text, cls) {
    var empty = consoleOutput.querySelector('.console-empty');
    if (empty) empty.remove();
    var line = document.createElement('div');
    line.className = 'console-line ' + (cls || 'output');
    line.textContent = text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
    // On small screens the console is its own panel: flag new activity
    // on its tab until the user looks at it.
    if (isSmallScreen() && document.body.getAttribute('data-mobile-view') !== 'console' &&
        (cls === 'output' || cls === 'error' || cls === 'prompt' || cls === 'library')) {
      $('consoleBadge').hidden = false;
    }
  }

  function clearConsole() {
    consoleOutput.innerHTML = '<div class="console-line console-empty">Console is empty. Press Run to execute the open .eppl file.</div>';
    consoleInputForm.hidden = true;
  }

  function setRunStatus(text, cls) {
    var el = $('statusRun');
    el.textContent = text;
    el.className = 'status-run' + (cls ? ' ' + cls : '');
  }

  function setSaveStatus(text, dirty) {
    var el = $('saveStatus');
    el.textContent = text;
    el.className = 'save-status' + (dirty ? ' dirty' : '');
  }

  function updateLibrariesStatus() {
    $('statusLibraries').textContent = loadedLibraries.length
      ? 'Libraries: ' + loadedLibraries.join(', ')
      : 'Libraries: none loaded';
  }

  // ------------------------------------------------------------------
  // Small-screen panel switching (Files / Code / Console)
  // ------------------------------------------------------------------
  function isSmallScreen() { return smallScreenQuery.matches; }

  function setMobileView(view) {
    if (view !== 'files' && view !== 'editor' && view !== 'console') return;
    document.body.setAttribute('data-mobile-view', view);
    mobileViewButtons.forEach(function (button) {
      var active = button.getAttribute('data-mobile-view') === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    applyPanelVisibility();
    if (view === 'console') {
      $('consoleBadge').hidden = true;
      window.requestAnimationFrame(function () {
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
      });
    }
  }

  /*
   * Panel visibility is enforced with the `hidden` attribute as well as
   * CSS, so exactly one panel can ever be on screen at a time on small
   * screens (and panels can never overlap or bleed into each other).
   * On larger screens everything is visible again.
   */
  function applyPanelVisibility() {
    var view = document.body.getAttribute('data-mobile-view') || 'editor';
    var small = isSmallScreen();
    var sidebarEl = $('sidebar');
    var workspaceEl = $('workspace');
    var editorEl = $('editorCard');
    var consoleEl = $('consoleCard');
    if (!small) {
      sidebarEl.hidden = false;
      workspaceEl.hidden = false;
      editorEl.hidden = false;
      consoleEl.hidden = false;
      return;
    }
    sidebarEl.hidden = view !== 'files';
    workspaceEl.hidden = view === 'files';
    editorEl.hidden = view !== 'editor';
    consoleEl.hidden = view !== 'console';
  }

  if (typeof smallScreenQuery.addEventListener === 'function') {
    smallScreenQuery.addEventListener('change', applyPanelVisibility);
  } else if (typeof smallScreenQuery.addListener === 'function') {
    smallScreenQuery.addListener(applyPanelVisibility);
  }
  window.addEventListener('orientationchange', function () {
    setTimeout(applyPanelVisibility, 60);
  });

  mobileViewButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setMobileView(button.getAttribute('data-mobile-view'));
    });
  });

  // ------------------------------------------------------------------
  // Editor: highlighting, line numbers, cursor
  // ------------------------------------------------------------------
  function refreshEditor() {
    highlightCode.innerHTML = EPP.highlight(editor.value);
    var lines = editor.value.split('\n').length;
    var numbers = [];
    for (var i = 1; i <= lines; i++) numbers.push(i);
    lineNumberInner.textContent = numbers.join('\n');
    $('statusLines').textContent = lines + (lines === 1 ? ' line' : ' lines');
    syncScroll();
    updateCursor();
  }

  function syncScroll() {
    highlightCode.style.transform = 'translate(' + (-editor.scrollLeft) + 'px,' + (-editor.scrollTop) + 'px)';
    lineNumberInner.style.transform = 'translateY(' + (-editor.scrollTop) + 'px)';
  }

  function updateCursor() {
    var upto = editor.value.slice(0, editor.selectionStart);
    var line = upto.split('\n').length;
    var col = upto.length - upto.lastIndexOf('\n');
    $('statusCursor').textContent = 'Line ' + line + ', Column ' + col;
  }

  editor.addEventListener('input', function () {
    refreshEditor();
    setSaveStatus('Unsaved changes…', true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveCurrent(false); }, 450);
  });
  editor.addEventListener('scroll', syncScroll);
  editor.addEventListener('keyup', updateCursor);
  editor.addEventListener('click', updateCursor);
  editor.addEventListener('keydown', function (event) {
    if (event.key === 'Tab') {
      event.preventDefault();
      var start = editor.selectionStart;
      editor.setRangeText('  ', start, editor.selectionEnd, 'end');
      editor.dispatchEvent(new Event('input'));
    }
  });

  // ------------------------------------------------------------------
  // Files
  // ------------------------------------------------------------------
  function renderFileList() {
    var filter = $('fileSearch').value.trim().toLowerCase();
    var files = store.listFiles().filter(function (f) {
      return !filter || f.name.toLowerCase().indexOf(filter) !== -1;
    });
    fileList.innerHTML = '';
    var totalFiles = store.listFiles().length;
    $('noFiles').hidden = totalFiles > 0;
    var badge = $('fileCountBadge');
    badge.textContent = String(totalFiles);
    badge.hidden = totalFiles === 0;
    files.forEach(function (file) {
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'file-item' + (file.name === currentName ? ' active' : '');
      var date = file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : '';
      button.innerHTML =
        '<span class="file-icon">eppl</span>' +
        '<span class="file-name"></span>' +
        '<span class="file-date">' + EPP.escapeHtml(date) + '</span>';
      button.querySelector('.file-name').textContent = file.name;
      button.title = 'Open ' + file.name;
      button.addEventListener('click', function () { openFile(file.name); });
      li.appendChild(button);
      fileList.appendChild(li);
    });
  }

  function openFile(name) {
    try {
      var file = store.getFile(name);
      currentName = file.name;
      editor.value = file.content;
      loadedLibraries = [];
      updateLibrariesStatus();
      $('currentFileName').textContent = file.name;
      $('statusFile').textContent = file.name + ' (.eppl)';
      setSaveStatus('Saved');
      setRunStatus('Ready');
      refreshEditor();
      renderFileList();
      // On small screens, jump straight to the code — without popping the
      // on-screen keyboard open before the user asks for it.
      if (isSmallScreen()) setMobileView('editor');
      else editor.focus();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function saveCurrent(announce) {
    if (!currentName) return;
    try {
      store.saveFile(currentName, editor.value);
      setSaveStatus('Saved ✓');
      renderFileList();
      if (announce) toast('Saved ' + currentName);
    } catch (e) {
      toast(e.message, true);
    }
  }

  // A small promise-based dialog for New / Rename.
  var dialogResolve = null;
  function askFileName(title, confirmLabel, initial) {
    return new Promise(function (resolve) {
      dialogResolve = resolve;
      $('fileDialogTitle').textContent = title;
      $('fileDialogConfirm').textContent = confirmLabel;
      $('fileDialogError').textContent = '';
      var input = $('fileDialogInput');
      input.value = initial || '';
      $('fileDialog').showModal();
      setTimeout(function () { input.focus(); input.select(); }, 30);
    });
  }
  $('fileDialogForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var value = $('fileDialogInput').value;
    try {
      var valid = EPP.validateEpplFileName(value);
      $('fileDialog').close();
      if (dialogResolve) dialogResolve(valid);
    } catch (e) {
      $('fileDialogError').textContent = e.message;
    }
    dialogResolve = null;
  });
  $('fileDialogCancel').addEventListener('click', function () {
    $('fileDialog').close();
    if (dialogResolve) dialogResolve(null);
    dialogResolve = null;
  });

  $('btnNew').addEventListener('click', function () {
    askFileName('New .eppl file', 'Create file', 'untitled.eppl').then(function (name) {
      if (!name) return;
      try {
        store.createFile(name, 'note: A brand new E++ program.\nsay "Hello from ' + name.replace(/\.eppl$/i, '') + '!"\n');
        renderFileList();
        openFile(name);
        toast('Created ' + name);
      } catch (e) { toast(e.message, true); }
    });
  });

  $('btnRename').addEventListener('click', function () {
    if (!currentName) return;
    askFileName('Rename .eppl file', 'Rename', currentName).then(function (name) {
      if (!name || name === currentName) return;
      try {
        saveCurrent(false);
        store.renameFile(currentName, name);
        currentName = name;
        $('currentFileName').textContent = name;
        $('statusFile').textContent = name + ' (.eppl)';
        renderFileList();
        toast('Renamed to ' + name);
      } catch (e) { toast(e.message, true); }
    });
  });

  $('btnDelete').addEventListener('click', function () {
    if (!currentName) return;
    if (!window.confirm('Delete ' + currentName + '? This cannot be undone.')) return;
    try {
      store.deleteFile(currentName);
      var remaining = store.listFiles();
      currentName = null;
      toast('Deleted the file.');
      if (remaining.length) openFile(remaining[0].name);
      else {
        editor.value = '';
        $('currentFileName').textContent = 'No file open';
        $('statusFile').textContent = 'No file open';
        refreshEditor();
        renderFileList();
        if (isSmallScreen()) setMobileView('files');
      }
    } catch (e) { toast(e.message, true); }
  });

  $('btnSave').addEventListener('click', function () { saveCurrent(true); });
  $('btnExport').addEventListener('click', function () {
    if (!currentName) { toast('Open a file first.', true); return; }
    try {
      saveCurrent(false);
      store.exportFile(currentName);
      toast('Exported ' + currentName);
    } catch (e) { toast(e.message, true); }
  });

  var importInput = $('importInput');
  $('btnImport').addEventListener('click', function () { importInput.click(); });
  importInput.addEventListener('change', function () {
    importFiles(Array.prototype.slice.call(importInput.files || []));
    importInput.value = '';
  });

  function importFiles(files) {
    if (!files.length) return;
    var last = null;
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return store.importFile(file).then(function (saved) {
          last = saved;
          appendConsole('Imported ' + saved.name, 'system');
        }).catch(function (e) {
          appendConsole('Import failed: ' + e.message, 'error');
          toast(e.message, true);
        });
      });
    });
    chain.then(function () {
      renderFileList();
      if (last) openFile(last.name);
    });
  }

  // Drag & drop .eppl files onto the editor.
  $('editorWrap').addEventListener('dragover', function (e) { e.preventDefault(); });
  $('editorWrap').addEventListener('drop', function (e) {
    e.preventDefault();
    importFiles(Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []));
  });

  $('fileSearch').addEventListener('input', renderFileList);
  $('btnRestoreExamples').addEventListener('click', function () {
    var added = 0;
    EXAMPLES.forEach(function (ex) {
      if (!store.exists(ex.name)) { store.saveFile(ex.name, ex.content); added += 1; }
    });
    renderFileList();
    toast(added ? 'Restored ' + added + ' example file' + (added === 1 ? '' : 's') + '.' : 'All example files are already here.');
    if (added && !currentName) openFile(EXAMPLES[0].name);
  });

  // ------------------------------------------------------------------
  // Libraries panel
  // ------------------------------------------------------------------
  (function renderLibraries() {
    var host = $('libraryList');
    EPP.Libraries.list().forEach(function (lib) {
      var card = document.createElement('div');
      card.className = 'library-card';
      var unlocks = lib.unlocks.map(function (u) { return '<li>' + EPP.escapeHtml(u.feature) + '</li>'; }).join('');
      card.innerHTML = '<h3>' + EPP.escapeHtml(lib.name) + ' <span>library "' + EPP.escapeHtml(lib.name) + '" add</span></h3>' +
        '<p>' + EPP.escapeHtml(lib.description) + '</p><ul>' + unlocks + '</ul>';
      host.appendChild(card);
    });
  })();

  // ------------------------------------------------------------------
  // Execution engine: console I/O + run/stop
  // ------------------------------------------------------------------
  consoleInputForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!pendingAnswer) return;
    var answer = consoleInput.value;
    appendConsole(answer, 'answer');
    consoleInput.value = '';
    consoleInputForm.hidden = true;
    var resolve = pendingAnswer;
    pendingAnswer = null;
    resolve(answer);
  });

  function consoleAsk(prompt) {
    return new Promise(function (resolve) {
      if (isSmallScreen()) setMobileView('console');
      appendConsole(prompt, 'prompt');
      consoleInputPrompt.textContent = prompt;
      consoleInputForm.hidden = false;
      pendingAnswer = resolve;
      setTimeout(function () { consoleInput.focus(); }, 30);
    });
  }

  // ------------------------------------------------------------------
  // Python runner (for the Python library's `python code` statements).
  // Real Python (Pyodide/WebAssembly) is bundled with the IDE in
  // vendor/pyodide and started lazily the first time a program actually
  // runs Python — E++ itself never waits for it. Each
  // Run gets a fresh Python namespace; Python's print() goes to the E++
  // console, and Python errors are turned into plain English messages.
  // ------------------------------------------------------------------
  // Python ships WITH the IDE (vendor/pyodide, same origin, works
  // offline). The public CDN is kept only as a fallback in case the
  // bundled files are missing.
  var PYTHON_LOCAL = new URL('vendor/pyodide/', window.location.href).href;
  var PYTHON_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  var pythonRuntimePromise = null;
  var pythonNamespace = null;
  // Host-level lock: the IDE's Python runner itself refuses to run unless
  // the program that is currently running has actually executed
  // `library "Python" add` (signalled through the interpreter's onLibrary
  // callback). This is a third, independent gate on top of the parser and
  // interpreter checks — Python cannot run without the library, period.
  var pythonAuthorized = false;

  function resetPythonRuntime() {
    if (pythonNamespace && typeof pythonNamespace.destroy === 'function') {
      try { pythonNamespace.destroy(); } catch (e) { /* already gone */ }
    }
    pythonNamespace = null;
  }

  function loadPythonScript(base) {
    return new Promise(function (resolve, reject) {
      if (window.loadPyodide) { resolve(); return; }
      var script = document.createElement('script');
      script.src = base + 'pyodide.js';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('loader script failed')); };
      document.head.appendChild(script);
    });
  }

  function startPythonFrom(base) {
    return loadPythonScript(base)
      .then(function () { return window.loadPyodide({ indexURL: base }); });
  }

  function getPythonRuntime() {
    if (!pythonRuntimePromise) {
      appendConsole('Loading Python (it is built into the IDE) — the first run can take a few seconds…', 'system');
      pythonRuntimePromise = startPythonFrom(PYTHON_LOCAL)
        .catch(function () {
          // Bundled copy unavailable for some reason: try the CDN.
          delete window.loadPyodide;
          return startPythonFrom(PYTHON_CDN);
        })
        .then(function (pyodide) {
          appendConsole('Python is ready.', 'system');
          return pyodide;
        })
        .catch(function () {
          pythonRuntimePromise = null; // allow a retry on the next Run
          // Always our own words, never a raw browser/engine error.
          throw new Error('Python could not start in this browser. Try a recent version of Chrome, Edge, Firefox or Safari, then press Run again.');
        });
    }
    return pythonRuntimePromise;
  }

  async function executePython(code) {
    if (!pythonAuthorized) {
      // Plain-English refusal, thrown as an E++ LibraryError so it is
      // shown exactly like the language-level gate.
      throw new EPP.LibraryError(
        'You cannot run Python code yet, because the Python library has not been added.',
        null, null,
        'Add this line above your Python code: library "Python" add — then python code "..." will work.');
    }
    var pyodide = await getPythonRuntime();
    if (!pythonNamespace) pythonNamespace = pyodide.toPy({});
    pyodide.setStdout({
      batched: function (line) { appendConsole(line, 'output'); }
    });
    // Python's own error output (tracebacks, warnings, stderr text) is
    // captured and thrown away on purpose: the only error messages the
    // user ever sees are the IDE's own plain-English ones. Python errors
    // thrown by runPythonAsync are translated by the interpreter.
    pyodide.setStderr({ batched: function () { /* captured, never displayed */ } });
    await pyodide.runPythonAsync(code, { globals: pythonNamespace });
  }

  function formatError(e) {
    if (e && typeof e.format === 'function') return e.format();
    return 'Error: ' + (e && e.message ? e.message : String(e));
  }

  function runCode() {
    if (running) return;
    if (!currentName) { toast('Create or open a .eppl file first.', true); return; }
    if (!EPP.isEpplFile(currentName)) {
      appendConsole('Only .eppl files can be run by the E++ IDE — "' + currentName + '" is not one.', 'error');
      return;
    }
    saveCurrent(false);
    loadedLibraries = [];
    updateLibrariesStatus();
    resetPythonRuntime(); // every Run starts Python with a clean slate
    pythonAuthorized = false; // Python starts locked on every Run
    // Start each Run with a clean console, so output from earlier runs
    // can never be mistaken for this run's output.
    consoleOutput.innerHTML = '';
    // On small screens, running a program takes you to its output.
    if (isSmallScreen()) setMobileView('console');

    appendConsole('—— Running ' + currentName + ' ——', 'divider');
    setRunStatus('Running…', 'running');
    btnRun.disabled = true;
    btnStop.disabled = false;

    var interpreter = new EPP.Interpreter({
      output: function (text) { appendConsole(text, 'output'); },
      input: consoleAsk,
      // Interruptible wait: Stop ends the wait promptly instead of
      // waiting for the full delay to elapse.
      delay: function (seconds) {
        return new Promise(function (resolve) {
          var remaining = seconds * 1000;
          var step = 50;
          var timer = setInterval(function () {
            if (!running || interpreter.cancelled) { clearInterval(timer); resolve(); return; }
            remaining -= step;
            if (remaining <= 0) { clearInterval(timer); resolve(); }
          }, step);
        });
      },
      pythonExecutor: executePython,
      onLibrary: function (name) {
        loadedLibraries.push(name);
        updateLibrariesStatus();
        // Only an actually-executed `library "Python" add` unlocks the
        // IDE's Python runner for this run.
        if (name === 'Python') pythonAuthorized = true;
        appendConsole('Library loaded: ' + name, 'library');
      }
    });
    running = { interpreter: interpreter };

    var program;
    try {
      program = EPP.Parser.parse(editor.value);
    } catch (e) {
      appendConsole(formatError(e), 'error');
      setRunStatus('Finished with errors', 'error');
      finishRun();
      return;
    }

    interpreter.run(program).then(function () {
      if (!interpreter.cancelled) {
        appendConsole('—— Finished ——', 'divider');
        setRunStatus('Finished');
      } else {
        setRunStatus('Stopped', 'error');
      }
    }).catch(function (e) {
      // Only the interpreter's own stop signal counts as "stopped" —
      // never pattern-match error text (a friendly Python error may
      // legitimately contain the word "stopped").
      if (interpreter.cancelled || (e && e.message === 'Execution was stopped.')) {
        appendConsole('Execution stopped.', 'system');
        setRunStatus('Stopped', 'error');
      } else {
        appendConsole(formatError(e), 'error');
        setRunStatus('Finished with errors', 'error');
      }
    }).then(finishRun);
  }

  function finishRun() {
    running = null;
    btnRun.disabled = false;
    btnStop.disabled = true;
    consoleInputForm.hidden = true;
    if (pendingAnswer) { var r = pendingAnswer; pendingAnswer = null; r(''); }
  }

  btnRun.addEventListener('click', runCode);
  btnStop.addEventListener('click', function () {
    if (running) running.interpreter.stop();
    if (pendingAnswer) { var r = pendingAnswer; pendingAnswer = null; consoleInputForm.hidden = true; r(''); }
  });
  $('btnClearConsole').addEventListener('click', clearConsole);

  document.addEventListener('keydown', function (event) {
    var mod = event.ctrlKey || event.metaKey;
    if (mod && event.key === 'Enter') { event.preventDefault(); runCode(); }
    if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); saveCurrent(true); }
  });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  setMobileView('editor');
  clearConsole();
  renderFileList();
  var files = store.listFiles();
  var initial = files.some(function (f) { return f.name === 'hello.eppl'; }) ? 'hello.eppl' : (files[0] && files[0].name);
  if (initial) openFile(initial);
  else refreshEditor();
  appendConsole('Welcome to the E++ IDE (build v8). Open a .eppl file on the left and press Run.', 'system');
  // Boot-time safety self-check: Python must refuse to run without the
  // Python library. If this ever stops refusing, say so loudly.
  try {
    EPP.Parser.parse('python code "print(1)"');
    appendConsole('WARNING: the Python safety check FAILED — Python ran without the Python library. Please report this!', 'error');
  } catch (selfCheckError) {
    if (selfCheckError && selfCheckError.category === 'LibraryError') {
      appendConsole('Safety check passed: Python cannot run unless your program adds library "Python" add first.', 'system');
    } else {
      appendConsole('Safety check: Python was stopped before it could run (' + (selfCheckError && selfCheckError.message) + ')', 'system');
    }
  }
})();
