// The IDE's front end. It never runs E++ itself: it asks the C++ server what to
// show and puts the answer on the page. Every sentence it displays is fetched
// from /api/labels, so the wording stays in data/messages.json with the rest.

(function () {
  'use strict';

  var labels = {};
  var state = { file: '', saved: '', saving: false, changed: false };

  function byId(id) { return document.getElementById(id); }

  function fill(text, values) {
    if (!values) return text || '';
    return (text || '').replace(/\{(\w+)\}/g, function (whole, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole;
    });
  }

  function say(key, values) { return fill(labels[key] || '', values); }

  function toast(text) {
    if (!text) return;
    var box = byId('toasts');
    if (!box) return;
    var note = document.createElement('p');
    note.className = 'toast';
    note.textContent = text;
    box.appendChild(note);
    setTimeout(function () { note.classList.add('gone'); }, 3600);
    setTimeout(function () { if (note.parentNode) note.parentNode.removeChild(note); }, 4300);
  }

  function setText(id, text) {
    var node = byId(id);
    if (node && typeof text === 'string') node.textContent = text;
  }

  function setHtml(id, html) {
    var node = byId(id);
    if (node && typeof html === 'string') node.innerHTML = html;
  }

  function request(route, payload) {
    return fetch('/api/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (response) {
      return response.json().catch(function () { return { ok: false, message: '' }; });
    });
  }

  // ------------------------------------------------------------------ editor

  function growEditor() {
    var code = byId('code');
    var box = byId('editor');
    if (!code || !box) return;
    code.style.height = 'auto';
    code.style.height = Math.max(260, code.scrollHeight + 2) + 'px';
    box.style.height = code.style.height;
  }

  function markState(key) { setText('editor-state', say(key)); }

  function showFileState(answer) {
    if (typeof answer.name === 'string') state.file = answer.name;
    setText('status-file', state.file || say('ui.noFile'));
    setText('editor-title', state.file || say('ui.noFile'));
    var field = byId('field-file');
    if (field) field.value = state.file;
    var form = byId('editor-form');
    if (form) form.setAttribute('data-file', state.file);
    var link = byId('download-link');
    if (link) link.setAttribute('href', '/download?file=' + encodeURIComponent(state.file));
  }

  function applyState(answer) {
    showFileState(answer);
    setHtml('highlight', answer.highlight);
    setHtml('file-list', answer.files);
    setHtml('library-cards', answer.cards);
    setText('status-count', answer.status);
  }

  function resetConsole() {
    var box = byId('console');
    if (box) box.innerHTML = '<div class="line system"></div>';
    if (box && box.firstChild) box.firstChild.textContent = say('console.empty');
    setHtml('sprite-grid', '');
    setText('status-run', '');
  }

  function refreshHighlight() {
    var code = byId('code');
    if (!code) return;
    request('highlight', { code: code.value }).then(function (answer) {
      setHtml('highlight', answer.html);
    });
  }

  function autosave() {
    var code = byId('code');
    if (!code || !state.file || state.saving) return Promise.resolve();
    if (code.value === state.saved) return Promise.resolve();
    state.saving = true;
    markState('ui.saving');
    return request('save', { file: state.file, code: code.value }).then(function (answer) {
      state.saving = false;
      if (!answer || answer.ok === false) {
        markState('ui.editState');
        toast((answer && answer.message) || say('toast.saveFailed'));
        return;
      }
      state.saved = code.value;
      state.changed = false;
      applyState(answer);
      markState('ui.saveState');
      if (answer.renamed) toast(answer.message);
    });
  }

  var highlightTimer = null;
  var saveTimer = null;

  function edited() {
    state.changed = true;
    markState('ui.editState');
    growEditor();
    clearTimeout(highlightTimer);
    clearTimeout(saveTimer);
    highlightTimer = setTimeout(refreshHighlight, 260);
    saveTimer = setTimeout(autosave, 1500);
  }

  // ----------------------------------------------------------------- running

  function answersFromBox() {
    var box = byId('answers');
    if (!box || !box.value) return [];
    return box.value.split('\n').filter(function (line) { return line.trim().length; });
  }

  function run() {
    var code = byId('code');
    if (!code) return;
    var button = byId('run-button');
    if (button) button.disabled = true;
    request('run', { file: state.file, code: code.value, answers: answersFromBox() })
      .then(function (answer) {
        if (button) button.disabled = false;
        if (!answer || typeof answer.console !== 'string') {
          toast(say('toast.runFailed'));
          return;
        }
        setHtml('console', answer.console);
        setHtml('sprite-grid', answer.grid);
        setText('status-run', answer.message);
        if (answer.code === 'no-answers') {
          var details = byId('answers-box');
          if (details) details.open = true;
          var box = byId('answers');
          if (box) box.focus();
          toast(say('console.needAnswers'));
        }
        var highlight = byId('highlight');
        if (highlight) {
          var rows = highlight.querySelectorAll('.ln');
          for (var i = 0; i < rows.length; ++i) rows[i].classList.remove('error-line');
          if (answer.line && rows.length) {
            var row = rows[Math.min(answer.line, rows.length) - 1];
            if (row) row.classList.add('error-line');
          }
        }
      })
      .catch(function () {
        if (button) button.disabled = false;
        toast(say('toast.runFailed'));
      });
  }

  // ----------------------------------------------------------------- dialogs

  function ask(title, label, hint, value) {
    var dialog = byId('prompt-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') {
      var plain = window.prompt(label, value || '');
      return Promise.resolve(plain);
    }
    return new Promise(function (resolve) {
      setText('prompt-title', title);
      setText('prompt-label', label);
      setText('prompt-hint', hint);
      setText('prompt-ok', say('ui.create'));
      setText('prompt-cancel', say('ui.cancel'));
      var input = byId('prompt-input');
      input.value = value || '';
      dialog.returnValue = '';
      dialog.addEventListener('close', function once() {
        dialog.removeEventListener('close', once);
        resolve(dialog.returnValue === 'ok' ? input.value : null);
      });
      dialog.showModal();
      input.focus();
      input.select();
    });
  }

  function wireEditor() {
    var code = byId('code');
    if (!code) return;
    state.saved = code.value;
    state.file = byId('field-file') ? byId('field-file').value : '';
    growEditor();

    code.addEventListener('input', edited);
    code.addEventListener('keydown', function (event) {
      if (event.key === 'Tab') {
        event.preventDefault();
        var start = code.selectionStart;
        var end = code.selectionEnd;
        code.value = code.value.slice(0, start) + '  ' + code.value.slice(end);
        code.selectionStart = code.selectionEnd = start + 2;
        edited();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        run();
      } else if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        autosave();
      }
    });

    var form = byId('editor-form');
    if (form) form.addEventListener('submit', function (event) { event.preventDefault(); run(); });
    var runButton = byId('run-button');
    if (runButton) runButton.addEventListener('click', function (event) { event.preventDefault(); run(); });
    var saveButton = byId('save-button');
    if (saveButton) saveButton.addEventListener('click', function (event) { event.preventDefault(); autosave(); });
  }

  function loadFile(name) {
    if (!name || name === state.file) return Promise.resolve();
    return fetch('/api/file?name=' + encodeURIComponent(name))
      .then(function (response) { return response.json(); })
      .then(function (answer) {
        if (!answer || typeof answer.code !== 'string') return;
        var code = byId('code');
        if (code) code.value = answer.code;
        state.saved = answer.code;
        state.changed = false;
        applyState(answer);
        resetConsole();
        var highlight = byId('highlight');
        if (highlight && answer.highlight) highlight.innerHTML = answer.highlight;
        markState('ui.saveState');
        growEditor();
        if (code) code.focus();
      });
  }

  function wireFiles() {
    var list = byId('file-list');
    if (list) {
      list.addEventListener('click', function (event) {
        var button = event.target.closest('.file-open');
        if (!button) return;
        var name = button.getAttribute('data-file');
        if (!name) return;
        if (state.changed) autosave().then(function () { loadFile(name); });
        else loadFile(name);
      });
    }

    var filter = byId('filter');
    if (filter) {
      filter.addEventListener('input', function () {
        var needle = filter.value.trim().toLowerCase();
        var rows = list ? list.querySelectorAll('.file-row') : [];
        for (var i = 0; i < rows.length; ++i) {
          var name = (rows[i].getAttribute('data-file') || '').toLowerCase();
          rows[i].classList.toggle('filtered', needle.length > 0 && name.indexOf(needle) === -1);
        }
      });
    }

    var newButton = byId('new-file');
    if (newButton) {
      newButton.addEventListener('click', function () {
        ask(say('ui.newPrompt'), say('files.nameLabel'), say('ui.newHint'), '').then(function (name) {
          if (!name) return;
          request('new', { name: name, code: '' }).then(function (answer) {
            if (!answer || answer.ok === false) { toast((answer && answer.message) || ''); return; }
            var code = byId('code');
            if (code) code.value = '';
            state.saved = '';
            state.changed = false;
            applyState(answer);
            resetConsole();
            markState('ui.saveState');
            toast(answer.message);
            if (code) code.focus();
          });
        });
      });
    }

    var renameButton = byId('rename-button');
    if (renameButton) {
      renameButton.addEventListener('click', function () {
        if (!state.file) { toast(say('ui.pickFile')); return; }
        ask(say('ui.renamePrompt'), say('files.renameLabel'), say('ui.renameHint'), state.file)
          .then(function (name) {
            if (!name || name === state.file) return;
            request('rename', { file: state.file, to: name }).then(function (answer) {
              if (!answer || answer.ok === false) { toast((answer && answer.message) || ''); return; }
              applyState(answer);
              toast(answer.message);
            });
          });
      });
    }

    var deleteButton = byId('delete-button');
    if (deleteButton) {
      deleteButton.addEventListener('click', function () {
        if (!state.file) { toast(say('ui.pickFile')); return; }
        var askFirst = document.documentElement.getAttribute('data-confirm') !== 'off';
        if (askFirst && !window.confirm(say('files.deleteAsk', { name: state.file }))) return;
        request('delete', { file: state.file }).then(function (answer) {
          if (!answer || answer.ok === false) { toast((answer && answer.message) || ''); return; }
          var code = byId('code');
          if (code) code.value = answer.code || '';
          state.saved = answer.code || '';
          state.changed = false;
          applyState(answer);
          resetConsole();
          markState('ui.saveState');
          growEditor();
          toast(answer.message);
        });
      });
    }

    var restore = byId('restore-examples');
    if (restore) {
      restore.addEventListener('click', function () {
        request('restore', {}).then(function (answer) {
          if (!answer || answer.ok === false) { toast((answer && answer.message) || ''); return; }
          setHtml('file-list', answer.files);
          setText('status-count', answer.status);
          toast(answer.message);
        });
      });
    }

    var cards = byId('library-cards');
    if (cards) {
      cards.addEventListener('click', function (event) {
        var button = event.target.closest('.insert-library');
        if (!button) return;
        request('insert-library', { library: button.getAttribute('data-library'), file: state.file })
          .then(function (answer) {
            if (!answer || answer.ok === false) { toast((answer && answer.message) || ''); return; }
            var code = byId('code');
            if (code) code.value = answer.code;
            state.saved = answer.code;
            state.changed = false;
            applyState(answer);
            markState('ui.saveState');
            growEditor();
            toast(answer.message);
          });
      });
    }
  }

  function wireSettings() {
    var form = document.querySelector('.settings-panel form');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var payload = {};
      var fields = form.querySelectorAll('input, select, textarea');
      for (var i = 0; i < fields.length; ++i) {
        var field = fields[i];
        if (!field.name) continue;
        payload[field.name] = field.type === 'checkbox' ? field.checked : field.value;
      }
      request('settings', payload).then(function (answer) {
        if (!answer || answer.ok === false) { toast((answer && answer.message) || ''); return; }
        var root = document.documentElement;
        root.className = answer.classes || '';
        root.style.setProperty('--code-size', (answer.codeSize || '14') + 'px');
        toast(answer.message);
      });
    });
  }

  function wireDeleteForm() {
    var form = document.querySelector('form[action="/delete"]');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      var askFirst = document.documentElement.getAttribute('data-confirm') !== 'off';
      if (!askFirst) return;
      var file = form.querySelector('input[name="file"]');
      if (!window.confirm(say('files.deleteAsk', { name: file ? file.value : '' }))) event.preventDefault();
    });
  }

  function wireLessonLinks() {
    var links = document.querySelectorAll('.lesson-panel form[action="/tutorial/open"]');
    for (var i = 0; i < links.length; ++i) {
      links[i].addEventListener('submit', function () {
        var lesson = this.querySelector('input[name="lesson"]');
        setText('editor-state', say('ui.saving'));
        if (lesson) window.localStorage.setItem('epp.lastLesson', lesson.value);
      });
    }
  }

  function boot() {
    fetch('/api/labels')
      .then(function (response) { return response.json(); })
      .then(function (answer) {
        labels = answer || {};
        wireEditor();
        wireFiles();
        wireSettings();
        wireDeleteForm();
        wireLessonLinks();
      })
      .catch(function () {
        // No labels, no fuss: the forms still post the way they always did.
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
