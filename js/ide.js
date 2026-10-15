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
    $('noFiles').hidden = store.listFiles().length > 0;
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
      editor.focus();
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
      appendConsole(prompt, 'prompt');
      consoleInputPrompt.textContent = prompt;
      consoleInputForm.hidden = false;
      pendingAnswer = resolve;
      setTimeout(function () { consoleInput.focus(); }, 30);
    });
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
      onLibrary: function (name) {
        loadedLibraries.push(name);
        updateLibrariesStatus();
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
      if (interpreter.cancelled || /stopped/i.test(e && e.message || '')) {
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
  clearConsole();
  renderFileList();
  var files = store.listFiles();
  var initial = files.some(function (f) { return f.name === 'hello.eppl'; }) ? 'hello.eppl' : (files[0] && files[0].name);
  if (initial) openFile(initial);
  else refreshEditor();
  appendConsole('Welcome to the E++ IDE. Open a .eppl file on the left and press Run.', 'system');
})();
