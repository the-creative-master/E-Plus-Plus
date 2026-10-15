/*
 * E++ IDE application (Dev Build 5).
 *
 * Project Humanizer:
 * - Pure .eppl files (no libraries) vs .eppla files (with libraries).
 * - "add library <Name>" humanized syntax.
 * - Multi-line Python uses commas ", ... ," instead of dashes.
 * - Lexer-based Python runner (no Pyodide) with Python's OWN error codes.
 * - Direct delete button on every file row in files menu.
 * - Standalone runtime "E++.zip" with "save project as name.eppl" manual command.
 * - Interactive multi-step tutorial.
 * - Dashboard overhaul with real-time stats and library insert buttons.
 * - WeeklyHow attribution (based on WeeklyHow's AI programming language video).
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Bundled example programs (also shipped as files in /examples).
  // Pure files without libraries are .eppl; files with libraries are .eppla.
  // ------------------------------------------------------------------
  var EXAMPLES = [
    {
      name: 'hello.eppl',
      content:
        'note: Your first E++ program (Dev Build 5).\n' +
        'note: Based on WeeklyHow\'s AI programming language video.\n' +
        'Define name as WeeklyHow.\n' +
        'say "Hello " plus \'name\' plus "!"\n' +
        'say "E++ looks like English, reads like English, and behaves like code."\n' +
        '\n' +
        'ask "What is your name?" and save answer as visitor\n' +
        'say "Nice to meet you, " plus \'visitor\' plus "."\n'
    },
    {
      name: 'math.eppla',
      content:
        'note: The Math library unlocks fractions, decimals, percentages,\n' +
        'note: square roots, powers and division.\n' +
        'add library "Math"\n' +
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
        'note: A tiny quiz in pure .eppl without any libraries.\n' +
        'ask "What is 5 plus 6?" and save answer as output\n' +
        'if \'output\' is equal to 11 then say "Correct!" otherwise say "Wrong!"\n' +
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
      name: 'guessing-game.eppla',
      content:
        'note: The Random library adds random numbers (.eppla file).\n' +
        'add library "Random"\n' +
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
      name: 'text-tools.eppla',
      content:
        'note: The Text library works with words and sentences (.eppla file).\n' +
        'add library "Text"\n' +
        '\n' +
        'say uppercase of "hello e++"\n' +
        'say lowercase of "LOUD NOISES"\n' +
        'say length of "How long am I?"\n'
    },
    {
      name: 'score-tracker.eppl',
      content:
        'note: Increase and Decrease change a number variable (pure .eppl).\n' +
        'Define score as 10.\n' +
        'Increase score by 5\n' +
        'say \'score\'\n' +
        'Decrease score by 3\n' +
        'say \'score\'\n' +
        '\n' +
        'ask "Guess a number" and save answer as guess\n' +
        'if \'guess\' is equal to 7 then say "That is the one!" and\n' +
        'otherwise if not a number then say "That was not a number at all." and\n' +
        'otherwise if \'guess\' is lesser than 7 then ask "Too low — try again" and save answer as guess and\n' +
        'otherwise ask "Too high — try again" and save answer as guess\n'
    },
    {
      name: 'python.eppla',
      content:
        'note: The Python library lets E++ run real Python code.\n' +
        'note: In Humanizer syntax, multi-line Python uses commas ", ... ,".\n' +
        'add library "Python"\n' +
        '\n' +
        'python code "print(\'Hello from Python!\')"\n' +
        '\n' +
        'python code ",for number in range(3):\n' +
        '    print(\'Counting in Python:\', number)\n' +
        ',"\n' +
        '\n' +
        'say "And now E++ is talking again."\n'
    },
    {
      name: 'drawing.eppla',
      content:
        'note: The Draw library: make a sprite, then move it around (.eppla file).\n' +
        'note: Sprites start in the centre of the drawing at (0, 0).\n' +
        'note: Pixel amounts are always written as text, like "40".\n' +
        '\n' +
        'define \'hero\' as drawing sprite\n' +
        '\'hero\' move right "60"\n' +
        '\'hero\' move down "30"\n' +
        '\'hero\' move left "20"\n' +
        '\'hero\' move up "10"\n' +
        '\n' +
        'say "The hero sprite has moved - watch the drawing below!"\n'
    }
  ];

  // ------------------------------------------------------------------
  // Interactive Tutorial Lessons (Requirement 11)
  // ------------------------------------------------------------------
  var TUTORIAL_LESSONS = [
    {
      title: '1. Welcome to E++ (Dev Build 5)',
      badge: 'Basics',
      summary: 'E++ is an English-like language based on WeeklyHow’s AI video, where AI was asked to create a coding language that reads like human language.',
      explanation: 'Statements in E++ end with a period (.) or a newline. Comments start with "note:". Words like "say" print text to the console.',
      code: 'note: Welcome to E++ Dev Build 5!\n' +
            'note: Inspired by WeeklyHow\'s AI video.\n' +
            'say "Hello, world!"\n' +
            'say "E++ looks like English, reads like English, and behaves like code."'
    },
    {
      title: '2. Variables & Quotes',
      badge: 'Variables',
      summary: 'Define variables using "Define <name> as <value>." Variables are ALWAYS referenced in single quotes (\'name\').',
      explanation: 'Values inside double quotes are literal text. Single quotes refer to variables. Join text with the "plus" operator.',
      code: 'Define name as WeeklyHow.\n' +
            'say "Hello " plus \'name\' plus "!"\n' +
            'Define score as 100.\n' +
            'say "Your starting score is " plus \'score\'.'
    },
    {
      title: '3. English Maths',
      badge: 'Maths',
      summary: 'Maths uses plain English words like plus, minus, and times. Adjust values with Increase and Decrease.',
      explanation: 'Precedence works naturally: parentheses first, then times, then plus and minus. Increase and Decrease modify number variables.',
      code: 'say 10 plus 5 times 2\n' +
            'say (10 plus 5) times 2\n\n' +
            'Define counter as 10.\n' +
            'Increase counter by 5\n' +
            'say "Counter after increase: " plus \'counter\'\n' +
            'Decrease counter by 3\n' +
            'say "Counter after decrease: " plus \'counter\'.'
    },
    {
      title: '4. Questions & Conditions',
      badge: 'Logic',
      summary: 'Ask questions with "ask ... and save answer as <name>". Test answers using natural "if" statements.',
      explanation: 'Answers from ask are text, but automatically compare numerically! You can use "is equal to", "otherwise", and "loopback to if".',
      code: 'ask "What is 5 plus 6?" and save answer as answer\n' +
            'if \'answer\' is equal to 11 then\n' +
            '  say "Spot on! That is correct."\n' +
            'otherwise\n' +
            '  say "Not quite, try again!"\n' +
            'end if'
    },
    {
      title: '5. .eppl vs .eppla (Requirement 5)',
      badge: 'Extensions',
      summary: '.eppl files are strictly for code WITHOUT libraries. .eppla files unlock ANY library!',
      explanation: 'This division ensures pure .eppl programs stay lightweight and run anywhere (including standalone E++.zip), while .eppla unlocks powerful libraries like Math, Text, Random, Draw, and Python.',
      code: 'note: In .eppl files, keep code pure without libraries.\n' +
            'note: In .eppla files, use: add library "Math"\n' +
            'Define pureCode as .eppl has no libraries.\n' +
            'Define libraryCode as .eppla unlocks all libraries.\n' +
            'say \'pureCode\'\n' +
            'say \'libraryCode\'.'
    },
    {
      title: '6. Python & Project Humanizer',
      badge: 'Humanizer',
      summary: 'Add libraries using "add library \\"Python\\"". Multi-line Python uses commas ", ... ,", and errors use Python\'s OWN error codes!',
      explanation: 'Project Humanizer removes unneeded symbols: multi-line Python uses ", ... ," instead of dashes. Python runs directly via our lexer without Pyodide!',
      code: 'note: Save this as a .eppla file to use libraries!\n' +
            'add library "Python"\n\n' +
            'python code "print(\'Hello from Python inside E++!\')"\n\n' +
            'python code ",for i in range(3):\n' +
            '    print(\'Python count:\', i)\n' +
            ',"\n\n' +
            'say "Back to plain English in E++!"'
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
  var pythonAuthorized = false;
  var pythonGlobals = {};
  var currentTutorialStep = 0;

  // ------------------------------------------------------------------
  // Small UI helpers
  // ------------------------------------------------------------------
  function toast(message, isError) {
    var el = $('toast');
    if (!el) return;
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
    if (isSmallScreen() && document.body.getAttribute('data-mobile-view') !== 'console' &&
        (cls === 'output' || cls === 'error' || cls === 'prompt' || cls === 'library')) {
      var badge = $('consoleBadge');
      if (badge) badge.hidden = false;
    }
  }

  function clearConsole() {
    consoleOutput.innerHTML = '<div class="console-line console-empty">Console is empty. Press Run to execute the open file.</div>';
    consoleInputForm.hidden = true;
  }

  function setRunStatus(text, cls) {
    var el = $('statusRun');
    if (el) {
      el.textContent = text;
      el.className = 'status-run' + (cls ? ' ' + cls : '');
    }
  }

  function setSaveStatus(text, dirty) {
    var el = $('saveStatus');
    if (el) {
      el.textContent = text;
      el.className = 'save-status' + (dirty ? ' dirty' : '');
    }
  }

  function updateLibrariesStatus() {
    var text = loadedLibraries.length
      ? 'Libraries: ' + loadedLibraries.join(', ')
      : 'Libraries: none loaded';
    var el = $('statusLibraries');
    if (el) el.textContent = text;
    updateDashboard();
  }

  function updateDashboard() {
    var dashFile = $('dashFile');
    var dashType = $('dashType');
    var dashLibs = $('dashLibs');
    var dashLines = $('dashLines');
    if (dashFile) dashFile.textContent = currentName || 'No file';
    if (dashType) {
      var isA = currentName && /\.eppla$/i.test(currentName);
      dashType.textContent = isA ? '.eppla (Extended)' : '.eppl (Pure)';
      dashType.className = 'dash-badge-pill ' + (isA ? 'badge-eppla' : 'badge-eppl');
    }
    if (dashLibs) {
      dashLibs.textContent = loadedLibraries.length ? loadedLibraries.join(', ') : 'None';
    }
    if (dashLines && editor) {
      var lines = editor.value.split('\n').length;
      dashLines.textContent = String(lines);
    }
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
      var badge = $('consoleBadge');
      if (badge) badge.hidden = true;
      window.requestAnimationFrame(function () {
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
      });
    }
  }

  function applyPanelVisibility() {
    var view = document.body.getAttribute('data-mobile-view') || 'editor';
    var small = isSmallScreen();
    var sidebarEl = $('sidebar');
    var workspaceEl = $('workspace');
    var editorEl = $('editorCard');
    var consoleEl = $('consoleCard');
    if (!small) {
      if (sidebarEl) sidebarEl.hidden = false;
      if (workspaceEl) workspaceEl.hidden = false;
      if (editorEl) editorEl.hidden = false;
      if (consoleEl) consoleEl.hidden = false;
      return;
    }
    if (sidebarEl) sidebarEl.hidden = view !== 'files';
    if (workspaceEl) workspaceEl.hidden = view === 'files';
    if (editorEl) editorEl.hidden = view !== 'editor';
    if (consoleEl) consoleEl.hidden = view !== 'console';
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
    var statusLines = $('statusLines');
    if (statusLines) statusLines.textContent = lines + (lines === 1 ? ' line' : ' lines');
    syncScroll();
    updateCursor();
    updateDashboard();
  }

  function syncScroll() {
    highlightCode.style.transform = 'translate(' + (-editor.scrollLeft) + 'px,' + (-editor.scrollTop) + 'px)';
    lineNumberInner.style.transform = 'translateY(' + (-editor.scrollTop) + 'px)';
  }

  function updateCursor() {
    var upto = editor.value.slice(0, editor.selectionStart);
    var line = upto.split('\n').length;
    var col = upto.length - upto.lastIndexOf('\n');
    var cur = $('statusCursor');
    if (cur) cur.textContent = 'Line ' + line + ', Column ' + col;
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
  // Files (Requirements 2, 4, 5)
  // ------------------------------------------------------------------
  function renderFileList() {
    var searchEl = $('fileSearch');
    var filter = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var files = store.listFiles().filter(function (f) {
      return !filter || f.name.toLowerCase().indexOf(filter) !== -1;
    });
    fileList.innerHTML = '';
    var totalFiles = store.listFiles().length;
    var noFilesEl = $('noFiles');
    if (noFilesEl) noFilesEl.hidden = totalFiles > 0;
    var badge = $('fileCountBadge');
    if (badge) {
      badge.textContent = String(totalFiles);
      badge.hidden = totalFiles === 0;
    }
    files.forEach(function (file) {
      var isA = /\.eppla$/i.test(file.name);
      var badgeCls = isA ? 'file-icon file-icon-eppla' : 'file-icon';
      var badgeText = isA ? 'eppla' : 'eppl';

      var li = document.createElement('li');
      li.className = 'file-row';

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'file-item' + (file.name === currentName ? ' active' : '');
      var date = file.updatedAt ? new Date(file.updatedAt).toLocaleDateString() : '';
      button.innerHTML =
        '<span class="' + badgeCls + '">' + badgeText + '</span>' +
        '<span class="file-name"></span>' +
        '<span class="file-date">' + EPP.escapeHtml(date) + '</span>';
      button.querySelector('.file-name').textContent = file.name;
      button.title = 'Open ' + file.name;
      button.addEventListener('click', function () { openFile(file.name); });
      li.appendChild(button);

      // Requirement 4: Delete files from the files menu
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-file-delete';
      delBtn.title = 'Delete ' + file.name;
      delBtn.setAttribute('aria-label', 'Delete ' + file.name);
      delBtn.innerHTML = '&times;';
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteFileDirect(file.name);
      });
      li.appendChild(delBtn);

      fileList.appendChild(li);
    });
  }

  function deleteFileDirect(name) {
    if (!window.confirm('Delete "' + name + '"? This cannot be undone.')) return;
    try {
      store.deleteFile(name);
      toast('Deleted ' + name);
      var remaining = store.listFiles();
      if (currentName === name) {
        currentName = null;
        if (remaining.length) openFile(remaining[0].name);
        else {
          editor.value = '';
          $('currentFileName').textContent = 'No file open';
          $('statusFile').textContent = 'No file open';
          updateDashboard();
          refreshEditor();
          renderFileList();
          if (isSmallScreen()) setMobileView('files');
        }
      } else {
        renderFileList();
      }
    } catch (e) { toast(e.message, true); }
  }

  function openFile(name) {
    try {
      var file = store.getFile(name);
      currentName = file.name;
      editor.value = file.content;
      loadedLibraries = [];
      updateLibrariesStatus();
      updateDashboard();
      $('currentFileName').textContent = file.name;
      var extLabel = /\.eppla$/i.test(file.name) ? ' (.eppla)' : ' (.eppl)';
      $('statusFile').textContent = file.name + extLabel;
      setSaveStatus('Saved');
      setRunStatus('Ready');
      refreshEditor();
      renderFileList();
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
      updateDashboard();
      if (announce) toast('Saved ' + currentName);
    } catch (e) {
      toast(e.message, true);
    }
  }

  // Small promise-based dialog for New / Rename.
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
      var valid = EPP.validateEpplFileName(value, editor.value);
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
    askFileName('New E++ File (.eppl or .eppla)', 'Create file', 'untitled.eppl').then(function (name) {
      if (!name) return;
      try {
        var isExt = /\.eppla$/i.test(name);
        var starter = isExt
          ? 'note: An extended E++ program with libraries (.eppla).\nadd library "Math"\nsay 5 power of 2\n'
          : 'note: A pure E++ program without libraries (.eppl).\nDefine name as WeeklyHow.\nsay "Hello from " plus \'name\' plus "!"\n';
        store.createFile(name, starter);
        renderFileList();
        openFile(name);
        toast('Created ' + name);
      } catch (e) { toast(e.message, true); }
    });
  });

  $('btnRename').addEventListener('click', function () {
    if (!currentName) return;
    askFileName('Rename File', 'Rename', currentName).then(function (name) {
      if (!name || name === currentName) return;
      try {
        saveCurrent(false);
        store.renameFile(currentName, name);
        currentName = name;
        $('currentFileName').textContent = name;
        var extLabel = /\.eppla$/i.test(name) ? ' (.eppla)' : ' (.eppl)';
        $('statusFile').textContent = name + extLabel;
        renderFileList();
        updateDashboard();
        toast('Renamed to ' + name);
      } catch (e) { toast(e.message, true); }
    });
  });

  $('btnDelete').addEventListener('click', function () {
    if (!currentName) return;
    deleteFileDirect(currentName);
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

  // Requirement 6 & 7: E++.zip standalone runtime download
  function triggerZipDownload() {
    try {
      EPP.downloadEppZip(editor.value);
      toast('Downloaded E++.zip (Standalone Runtime)!');
    } catch (e) {
      toast('ZIP download failed: ' + e.message, true);
    }
  }

  var btnZip = $('btnZip');
  if (btnZip) {
    btnZip.addEventListener('click', triggerZipDownload);
  }
  var btnDashZip = $('btnDashZip');
  if (btnDashZip) {
    btnDashZip.addEventListener('click', triggerZipDownload);
  }

  // Requirement 11: Interactive Tutorial
  var btnTutorial = $('btnTutorial');
  if (btnTutorial) {
    btnTutorial.addEventListener('click', function () {
      openTutorial(0);
    });
  }

  function openTutorial(step) {
    currentTutorialStep = Math.max(0, Math.min(step, TUTORIAL_LESSONS.length - 1));
    var lesson = TUTORIAL_LESSONS[currentTutorialStep];
    var dialog = $('tutorialDialog');
    if (!dialog) return;
    $('tutTitle').textContent = lesson.title;
    $('tutBadge').textContent = lesson.badge;
    $('tutSummary').textContent = lesson.summary;
    $('tutExplanation').textContent = lesson.explanation;
    $('tutCode').textContent = lesson.code;
    $('tutStepCount').textContent = 'Step ' + (currentTutorialStep + 1) + ' of ' + TUTORIAL_LESSONS.length;
    $('tutPrev').disabled = currentTutorialStep === 0;
    $('tutNext').textContent = currentTutorialStep === TUTORIAL_LESSONS.length - 1 ? 'Finish' : 'Next →';
    dialog.showModal();
  }

  var tutPrev = $('tutPrev');
  if (tutPrev) {
    tutPrev.addEventListener('click', function () {
      if (currentTutorialStep > 0) openTutorial(currentTutorialStep - 1);
    });
  }
  var tutNext = $('tutNext');
  if (tutNext) {
    tutNext.addEventListener('click', function () {
      if (currentTutorialStep < TUTORIAL_LESSONS.length - 1) {
        openTutorial(currentTutorialStep + 1);
      } else {
        $('tutorialDialog').close();
      }
    });
  }
  var tutClose = $('tutClose');
  if (tutClose) tutClose.addEventListener('click', function () { $('tutorialDialog').close(); });
  var tutTry = $('tutTry');
  if (tutTry) {
    tutTry.addEventListener('click', function () {
      var lesson = TUTORIAL_LESSONS[currentTutorialStep];
      editor.value = lesson.code;
      refreshEditor();
      setSaveStatus('Unsaved changes…', true);
      $('tutorialDialog').close();
      if (isSmallScreen()) setMobileView('editor');
      toast('Loaded tutorial step into editor. Press ▶ Run to test!');
    });
  }

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

  // Drag & drop .eppl and .eppla files onto the editor.
  $('editorWrap').addEventListener('dragover', function (e) { e.preventDefault(); });
  $('editorWrap').addEventListener('drop', function (e) {
    e.preventDefault();
    importFiles(Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []));
  });

  var fileSearch = $('fileSearch');
  if (fileSearch) fileSearch.addEventListener('input', renderFileList);

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
    if (!host) return;
    host.innerHTML = '';
    EPP.Libraries.list().forEach(function (lib) {
      var card = document.createElement('div');
      card.className = 'library-card';
      var unlocks = lib.unlocks.map(function (u) { return '<li>' + EPP.escapeHtml(u.feature) + '</li>'; }).join('');
      card.innerHTML =
        '<div class="lib-card-top">' +
          '<h3>' + EPP.escapeHtml(lib.name) + ' <span>add library "' + EPP.escapeHtml(lib.name) + '"</span></h3>' +
          '<button type="button" class="btn btn-small btn-accent lib-insert-btn">+ Insert</button>' +
        '</div>' +
        '<p>' + EPP.escapeHtml(lib.description) + '</p><ul>' + unlocks + '</ul>';

      card.querySelector('.lib-insert-btn').addEventListener('click', function () {
        var addCmd = 'add library "' + lib.name + '"\n';
        if (editor.value.indexOf(addCmd.trim()) === -1) {
          editor.value = addCmd + editor.value;
          refreshEditor();
          setSaveStatus('Unsaved changes…', true);
          toast('Inserted add library "' + lib.name + '"');
        } else {
          toast('add library "' + lib.name + '" is already in your code');
        }
      });

      host.appendChild(card);
    });
  })();

  // ------------------------------------------------------------------
  // Draw library: sprites on a canvas
  // ------------------------------------------------------------------
  var drawCard = $('drawCard');
  var drawCanvas = $('drawCanvas');
  var drawSprites = {};

  function resetDrawing() {
    drawSprites = {};
    if (drawCard) drawCard.hidden = true;
  }

  function handleSprite(event) {
    var key = String(event.name).toLowerCase();
    if (!drawSprites[key]) {
      drawSprites[key] = {
        name: event.name, x: event.x, y: event.y,
        hue: (Object.keys(drawSprites).length * 67) % 360
      };
    } else {
      drawSprites[key].x = event.x;
      drawSprites[key].y = event.y;
    }
    if (drawCard) drawCard.hidden = false;
    drawScene();
  }

  function drawScene() {
    if (!drawCanvas || !drawCanvas.getContext) return;
    var ctx = drawCanvas.getContext('2d');
    if (!ctx) return;
    var w = drawCanvas.width, h = drawCanvas.height;
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, h); ctx.stroke(); }
    for (var gy = 0; gy <= h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(w, gy + 0.5); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.beginPath(); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke();
    Object.keys(drawSprites).forEach(function (key) {
      var s = drawSprites[key];
      var cx = w / 2 + s.x, cy = h / 2 + s.y;
      ctx.fillStyle = 'hsl(' + s.hue + ', 75%, 55%)';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      var r = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, cx, cy - r - 8);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
      ctx.fillText('(' + Math.round(s.x) + ', ' + Math.round(s.y) + ')', cx, cy + r + 16);
    });
  }

  // ------------------------------------------------------------------
  // Console I/O
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
  // Lexer-based Python Runner (Requirement 1 & 3: No Pyodide, Python's own error codes)
  // ------------------------------------------------------------------
  function resetPythonRuntime() {
    pythonGlobals = {};
  }

  async function executePython(code) {
    if (!pythonAuthorized) {
      throw new EPP.LibraryError(
        'You cannot run Python code yet, because the Python library has not been added.',
        null, null,
        'Add this line above your Python code: add library "Python" — then python code "..." will work.');
    }
    if (!EPP.PythonRunner) {
      throw new Error('PythonRunner module is not loaded.');
    }
    var runner = new EPP.PythonRunner({
      output: function (line) { appendConsole(line, 'output'); },
      globals: pythonGlobals
    });
    runner.run(code);
  }

  function formatError(e) {
    if (e && typeof e.format === 'function') return e.format();
    return 'Error: ' + (e && e.message ? e.message : String(e));
  }

  function runCode() {
    if (running) return;
    if (!currentName) { toast('Create or open a file first.', true); return; }
    if (!EPP.isEpplFile(currentName)) {
      appendConsole('Only .eppl and .eppla files can be run — "' + currentName + '" is not one.', 'error');
      return;
    }

    // Requirement 5: .eppl files cannot use libraries; .eppla files are for libraries
    var hasLibs = EPP.hasLibraryUsage ? EPP.hasLibraryUsage(editor.value) : false;
    if (hasLibs && /\.eppl$/i.test(currentName) && !/\.eppla$/i.test(currentName)) {
      appendConsole('LibraryError: "' + currentName + '" is a .eppl file and cannot use libraries! In E++, .eppl is strictly for files WITHOUT libraries, and .eppla is for files WITH libraries.', 'error');
      appendConsole('Hint: Click Rename and change the extension to .eppla (for example: ' + currentName.replace(/\.eppl$/i, '.eppla') + ').', 'system');
      setRunStatus('Finished with errors', 'error');
      return;
    }

    saveCurrent(false);
    loadedLibraries = [];
    updateLibrariesStatus();
    resetDrawing();
    resetPythonRuntime();
    pythonAuthorized = false;

    consoleOutput.innerHTML = '';
    if (isSmallScreen()) setMobileView('console');

    appendConsole('—— Running ' + currentName + ' ——', 'divider');
    setRunStatus('Running…', 'running');
    btnRun.disabled = true;
    btnStop.disabled = false;

    var interpreter = new EPP.Interpreter({
      output: function (text) { appendConsole(text, 'output'); },
      input: consoleAsk,
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
      onSprite: handleSprite,
      onImageDisplay: function (info) {
        // Dev Build 5: render Base64 image as an actual <img> in the console.
        // The source may be a raw base64 string or a full data-URI.
        var src = info.source;
        if (src && !/^data:/i.test(src)) {
          // Try to detect the image type from the base64 prefix.
          // PNG starts with iVBOR, JPEG with /9j=, GIF with R0lGOD, WebP with UklGR
          var prefix = src.slice(0, 8);
          var mime = 'image/png'; // default
          if (/^\/9j=/i.test(src)) mime = 'image/jpeg';
          else if (/^R0lGOD/i.test(src)) mime = 'image/gif';
          else if (/^UklGR/i.test(src)) mime = 'image/webp';
          else if (/^iVBOR/i.test(src)) mime = 'image/png';
          src = 'data:' + mime + ';base64,' + src;
        }
        var line = document.createElement('div');
        line.className = 'console-line output';
        var label = document.createElement('span');
        label.textContent = '[Image: ' + info.name + '] ';
        line.appendChild(label);
        var img = document.createElement('img');
        img.src = src;
        img.alt = info.name;
        img.style.maxWidth = '300px';
        img.style.maxHeight = '300px';
        img.style.borderRadius = '4px';
        img.style.display = 'block';
        img.style.marginTop = '4px';
        img.onerror = function () {
          line.appendChild(document.createTextNode(' (could not decode image — invalid Base64 data)'));
        };
        line.appendChild(img);
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
      },
      onLibrary: function (name) {
        loadedLibraries.push(name);
        updateLibrariesStatus();
        if (name === 'Python') pythonAuthorized = true;
        appendConsole('Library loaded: ' + name, 'library');
      }
    });
    running = { interpreter: interpreter };

    var program;
    try {
      program = EPP.Parser.parse(editor.value, { fileName: currentName });
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
  appendConsole('You are running E++ Dev Build 5. Open a .eppl or .eppla file on the left and press Run.', 'system');
  updateDashboard();
})();
