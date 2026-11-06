/* E++ 1.4rc1 Studio appearance and launcher layout. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const OPTIONS_KEY = 'epp_studio_appearance_1_4a2';
  const LAYOUT_KEY = 'epp_studio_layout_1_4a2';
  const names = { explorer: 'Explorer', libraries: 'Libraries', guide: 'Quick reference', learn: 'Learn E++', settings: 'Settings', run: 'Run', stop: 'Stop', rename: 'Rename', delete: 'Delete file', wrap: 'Wrap lines' };
  const presets = {
    default: { home: ['run', 'stop', 'rename', 'delete', 'wrap'], rail: ['explorer', 'libraries', 'guide', 'learn', 'settings'], top: [], hidden: [] },
    focused: { home: ['run', 'stop'], rail: ['explorer', 'settings'], top: [], hidden: ['libraries', 'guide', 'learn', 'rename', 'delete', 'wrap'] },
    top: { home: ['run', 'stop', 'rename', 'delete', 'wrap'], rail: [], top: ['explorer', 'libraries', 'guide', 'learn', 'settings'], hidden: [] }
  };
  const colors = [
    ['Lavender', '#b7a4ff'], ['Violet', '#a78bfa'], ['Orchid', '#d88cf2'], ['Rose', '#f28fb0'],
    ['Coral', '#ff9b8e'], ['Amber', '#eebd77'], ['Lime', '#afd787'], ['Mint', '#83dcb7'],
    ['Teal', '#70d5d0'], ['Sky', '#83c9f4'], ['Blue', '#8eaafc'], ['Silver', '#bbc6dd']
  ];
  const nodes = {}, homes = {};
  document.querySelectorAll('[data-component]').forEach(node => {
    const id = node.dataset.component;
    nodes[id] = node;
    if (presets.default.home.includes(id)) { const marker = document.createComment('home:' + id); node.after(marker); homes[id] = marker; }
  });
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  const saved = read(OPTIONS_KEY) || {};
  const options = { fontSize: [12, 14, 16, 18].includes(saved.fontSize) ? saved.fontSize : 14, lineNumbers: typeof saved.lineNumbers === 'boolean' ? saved.lineNumbers : true, animations: typeof saved.animations === 'boolean' ? saved.animations : true, terminalMode: saved.terminalMode === true };
  let terminalPendingAsk = null;
  // Keep one full Studio evaluator for the lifetime of Terminal mode so variables,
  // declared libraries, sprites, actors and running state persist across submissions.
  let terminalEvaluator = null;
  const terminalCommands = {
    help: 'E++ Terminal runs the full Studio E++ evaluator. Enter any E++ statement or program here; press Enter to continue an open block, use Shift+Enter for a manual newline, and Ctrl+Enter to run immediately. All Studio libraries, including Draw and Game, are supported. Utilities: commands, dir, clear, ver, help, exit. Escape returns to Settings.',
    commands: 'Full E++ source is accepted (not a shell-only whitelist): say/tell, define/let/set, increase/decrease, ask, if/otherwise/end if, repeat/end repeat, while/end while, loopback, note, add library, Python blocks, Draw sprites and pen/movement commands, Game actors and controls, Keyboard, waits, files, images, math, random, strings, time, colors, console, and system statements. Add the needed library with add library "Name". Use Shift+Enter to enter multiline blocks. See Quick Reference for exact statement forms.',
    dir: ' E++ workspace\n\n<DIR>  assets\n<DIR>  css\n<DIR>  examples\n<DIR>  include\n<DIR>  js\n<DIR>  src\n<DIR>  tests\n<DIR>  tools\n        E++.zip\n        LANGUAGE.md\n        README.md\n        WIKI.md\n        hello.enpp',
    ver: 'E++ Studio [Version 1.4rc1]'
  };
  function terminalWrite(text) {
    const output = $('terminalModeOutput');
    output.textContent += String(text) + '\n';
    output.scrollTop = output.scrollHeight;
  }
  function terminalHasOpenBlocks(source) {
    const lines = source.split(/\r?\n/);
    const pythonStart = lines.findIndex(line => /^(?:run\s+)?(?:the\s+)?python\s+code\s*:\s*$/i.test(line.trim()));
    if (pythonStart >= 0) {
      const eppStart = /^(?:say|tell|let|define|ask|add|note|run|if|otherwise)\b/i;
      const closesPython = lines.slice(pythonStart + 1).some(line =>
        line.trim() && !/^[ \t]/.test(line) && eppStart.test(line.trim()));
      if (!closesPython) return true;
    }
    const stack = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || /^note\b/i.test(line)) continue;
      if (/^end\s+(repeat|while|if)\b/i.test(line)) {
        const close = line.match(/^end\s+(repeat|while|if)\b/i)[1].toLowerCase();
        if (stack[stack.length - 1] === close) stack.pop();
        continue;
      }
      if (/^repeat\b/i.test(line) && /\btimes\s*:?[\s]*$/i.test(line)) stack.push('repeat');
      else if (/^while\b/i.test(line) && /\bdo\s*:?[\s]*$/i.test(line)) stack.push('while');
      else if (/^if\b/i.test(line) && /\bthen\s*:?[\s]*$/i.test(line)) stack.push('if');
    }
    return stack.length > 0;
  }
  function resizeTerminalInput() {
    const input = $('terminalModeExitInput');
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, window.innerHeight * 0.35) + 'px';
  }
  function resetTerminal() {
    $('terminalModeOutput').textContent = 'C:\\E++> dir\n' + terminalCommands.dir + '\n\n';
  }
  function applyOptions() {
    document.documentElement.style.setProperty('--editor-font-size', options.fontSize + 'px');
    document.body.classList.toggle('no-line-numbers', !options.lineNumbers);
    $('editorFontSize').value = String(options.fontSize);
    $('showLineNumbers').checked = options.lineNumbers;
    $('studioAnimations').checked = options.animations;
    $('terminalMode').checked = options.terminalMode;
    document.documentElement.classList.toggle('terminal-mode', options.terminalMode);
    $('terminalModeScreen').hidden = !options.terminalMode;
    document.documentElement.classList.toggle('studio-motion-off', !options.animations);
    if (options.terminalMode) {
      resetTerminal();
      requestAnimationFrame(() => $('terminalModeExitInput').focus());
    }
    requestAnimationFrame(updateLineNumbers);
  }
  function paintPalette() {
    const selected = $('accentColor').value.toLowerCase();
    if (!$('themePalette').children.length) colors.forEach(([label, color]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'theme-swatch';
      button.style.setProperty('--swatch', color);
      button.dataset.color = color;
      button.title = label; button.setAttribute('aria-label', label);
      button.addEventListener('click', () => {
        $('accentColor').value = color;
        $('accentColor').dispatchEvent(new Event('input', { bubbles: true }));
      });
      $('themePalette').appendChild(button);
    });
    $('themePalette').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(selected === button.dataset.color)));
  }
  $('accentColor').addEventListener('input', paintPalette);
  $('editorFontSize').addEventListener('change', event => { options.fontSize = Number(event.target.value); applyOptions(); save(OPTIONS_KEY, options); });
  $('studioAnimations').addEventListener('change', event => { options.animations = event.target.checked; applyOptions(); save(OPTIONS_KEY, options); });
  $('terminalMode').addEventListener('change', event => {
    options.terminalMode = event.target.checked;
    if (options.terminalMode) {
      const settings = $('settingsDialog');
      if (settings && settings.open && typeof settings.close === 'function') settings.close();
    }
    applyOptions(); save(OPTIONS_KEY, options);
  });
  $('terminalModeScreen').addEventListener('click', () => $('terminalModeExitInput').focus());
  $('terminalModeExitInput').addEventListener('input', resizeTerminalInput);
  $('terminalModeExitInput').addEventListener('keydown', async event => {
    if (event.key !== 'Enter') return;
    const input = event.currentTarget;
    if (event.shiftKey) return; // Shift+Enter always inserts a newline.
    if (!event.ctrlKey && !event.metaKey && terminalHasOpenBlocks(input.value)) {
      event.preventDefault();
      const start = input.selectionStart;
      input.setRangeText('\n', start, input.selectionEnd, 'end');
      resizeTerminalInput();
      return;
    }
    event.preventDefault();
    const command = input.value.trim();
    const normalized = command.toLowerCase();
    input.value = '';
    resizeTerminalInput();
    if (terminalPendingAsk) {
      const answer = terminalPendingAsk; terminalPendingAsk = null;
      $('terminalModePrompt').textContent = 'C:\\E++>';
      answer(command);
      return;
    }
    if (!command) return;
    if (normalized === 'clear' || normalized === 'cls') {
      $('terminalModeOutput').textContent = '';
      return;
    }
    terminalWrite('C:\\E++> ' + command);
    if (normalized === 'exit') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(terminalCommands, normalized)) {
      terminalWrite(terminalCommands[normalized]); terminalWrite(''); return;
    }

    // Use the same unrestricted evaluator as Studio. Keep its state between
    // submissions so variables and added libraries remain available; multiline
    // programs can be entered with Shift+Enter.
    if (!terminalEvaluator) terminalEvaluator = new EppEvaluator();
    const evaluator = terminalEvaluator;
    try {
      await evaluator.run(command, text => terminalWrite(text), prompt => new Promise(resolve => {
        terminalWrite('? ' + prompt);
        $('terminalModePrompt').textContent = '?';
        terminalPendingAsk = resolve;
        input.focus();
      }));
    } catch (error) {
      terminalWrite((error.code ? error.code + ': ' : '') + (error.reason || error.message || String(error)));
      if (error.help) terminalWrite('Help: ' + error.help);
    } finally {
      $('terminalModePrompt').textContent = 'C:\\E++>';
      input.focus();
    }
  });
  document.addEventListener('keydown', event => {
    if (!options.terminalMode || event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation();
    if (terminalPendingAsk) { const answer = terminalPendingAsk; terminalPendingAsk = null; answer(''); }
    if (terminalEvaluator) terminalEvaluator.cancel();
    terminalEvaluator = null;
    if (activeEvaluator && typeof activeEvaluator.cancel === 'function') activeEvaluator.cancel();
    options.terminalMode = false;
    applyOptions(); save(OPTIONS_KEY, options);
    $('settingsDialog').showModal();
    $('terminalMode').focus();
  }, true);
  $('showLineNumbers').addEventListener('change', event => { options.lineNumbers = event.target.checked; applyOptions(); save(OPTIONS_KEY, options); });
  $('settingsWrap').addEventListener('change', event => {
    if ($('btnWrap').getAttribute('aria-pressed') !== String(event.target.checked)) $('btnWrap').click();
  });
  $('btnWrap').addEventListener('click', () => { $('settingsWrap').checked = $('btnWrap').getAttribute('aria-pressed') === 'true'; });
  $('settingsWrap').checked = $('btnWrap').getAttribute('aria-pressed') === 'true';
  $('resetAppearance').addEventListener('click', () => {
    options.fontSize = 14; options.lineNumbers = true; options.animations = true; options.terminalMode = false;
    $('accentColor').value = '#b7a4ff';
    $('accentColor').dispatchEvent(new Event('input', { bubbles: true }));
    if ($('btnWrap').getAttribute('aria-pressed') === 'true') $('btnWrap').click();
    applyOptions(); save(OPTIONS_KEY, options);
    showToast('Appearance reset. Your layout and files were kept.');
  });
  $('btnSettingsMenu').addEventListener('click', () => $('btnSettings').click());
  paintPalette(); applyOptions();

  function clonePreset(name) { return JSON.parse(JSON.stringify(presets[name])); }
  function validLayout(layout) {
    if (!layout || !['home', 'rail', 'top', 'hidden'].every(k => Array.isArray(layout[k]))) return false;
    const all = [].concat(layout.home, layout.rail, layout.top, layout.hidden);
    return all.length === Object.keys(names).length && new Set(all).size === all.length && all.every(id => Object.hasOwn(names, id)) && layout.home.every(id => !!homes[id]);
  }
  let layout = read(LAYOUT_KEY);
  if (!validLayout(layout)) layout = clonePreset('default');
  const rail = document.querySelector('.activity-bar');
  const top = $('launcherTop');
  const parking = document.createElement('div'); parking.hidden = true; document.body.appendChild(parking);
  function applyLayout() {
    layout.home.forEach(id => { nodes[id].hidden = false; nodes[id].classList.remove('launcher-moved'); homes[id].parentNode.insertBefore(nodes[id], homes[id]); });
    layout.rail.forEach(id => { nodes[id].hidden = false; nodes[id].classList.toggle('launcher-moved', !!homes[id]); rail.insertBefore(nodes[id], $('extraSidebar')); });
    layout.top.forEach(id => { nodes[id].hidden = false; nodes[id].classList.toggle('launcher-moved', !!homes[id]); top.appendChild(nodes[id]); });
    layout.hidden.forEach(id => { nodes[id].hidden = true; parking.appendChild(nodes[id]); });
    if (!layout.rail.length) rail.classList.add('empty'); else rail.classList.remove('empty');
    // An open explorer must not remain stranded if its shortcut is removed.
    const active = document.querySelector('[data-activity].active');
    if (active && active.hidden) { active.classList.remove('active'); active.setAttribute('aria-expanded', 'false'); $('mainLayout').classList.remove('explorer-open'); }
    save(LAYOUT_KEY, layout);
    requestAnimationFrame(updateLineNumbers);
  }
  function move(id, zone, before) {
    if (!Object.hasOwn(names, id) || !Object.hasOwn(layout, zone) || (zone === 'home' && (!homes[id] || layout.home.includes(id)))) return;
    for (const key of ['home', 'rail', 'top', 'hidden']) layout[key] = layout[key].filter(item => item !== id);
    const at = before ? layout[zone].indexOf(before) : -1;
    layout[zone].splice(at < 0 ? layout[zone].length : at, 0, id);
    applyLayout(); renderZones();
    $('layoutStatus').textContent = names[id] + ' moved to ' + ({home: 'Original position', rail: 'Activity bar', top: 'Top bar', hidden: 'Removed'})[zone] + '.';
  }
  function renderZones() {
    ['home', 'rail', 'top', 'hidden'].forEach(zone => {
      const container = document.querySelector('.layout-dropzone[data-zone="' + zone + '"]');
      container.replaceChildren();
      layout[zone].forEach((id, index) => {
        const tile = document.createElement('div'); tile.className = 'layout-tile'; tile.draggable = true; tile.dataset.id = id;
        const handle = document.createElement('span'); handle.className = 'layout-handle'; handle.textContent = '⠿'; handle.setAttribute('aria-hidden', 'true');
        const title = document.createElement('strong'); title.textContent = names[id];
        const select = document.createElement('select'); select.setAttribute('aria-label', 'Move ' + names[id] + ' to');
        (homes[id] ? [['home', 'Original'], ['rail', 'Activity bar'], ['top', 'Top bar'], ['hidden', 'Removed']] : [['rail', 'Activity bar'], ['top', 'Top bar'], ['hidden', 'Removed']]).forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.appendChild(option); });
        select.value = zone; select.addEventListener('change', () => { move(id, select.value); const next = document.querySelector('.layout-tile[data-id="' + id + '"] select'); if (next) next.focus(); });
        const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.className = 'layout-order'; up.disabled = zone === 'home' || index === 0; up.setAttribute('aria-label', 'Move ' + names[id] + ' up');
        up.addEventListener('click', () => { move(id, zone, layout[zone][index - 1]); const next = document.querySelector('.layout-tile[data-id="' + id + '"] select'); if (next) next.focus(); });
        const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.className = 'layout-order'; down.disabled = zone === 'home' || index === layout[zone].length - 1; down.setAttribute('aria-label', 'Move ' + names[id] + ' down');
        down.addEventListener('click', () => { move(id, zone, layout[zone][index + 2]); const next = document.querySelector('.layout-tile[data-id="' + id + '"] select'); if (next) next.focus(); });
        tile.append(handle, title, select, up, down);
        tile.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; });
        tile.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
        tile.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); const source = e.dataTransfer.getData('text/plain'); if (source !== id) move(source, zone, id); });
        container.appendChild(tile);
      });
    });
  }
  document.querySelectorAll('.layout-dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    zone.addEventListener('drop', e => { e.preventDefault(); move(e.dataTransfer.getData('text/plain'), zone.dataset.zone); });
  });
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    layout = clonePreset(button.dataset.preset); applyLayout(); renderZones(); $('layoutStatus').textContent = button.textContent + ' preset applied.';
  }));
  $('openStudioEditor').addEventListener('click', () => { $('settingsDialog').close(); renderZones(); $('layoutDialog').showModal(); });
  $('layoutClose').addEventListener('click', () => $('layoutDialog').close());
  $('layoutDone').addEventListener('click', () => $('layoutDialog').close());
  // Allow the shortcut visibility editor to restore a launcher that an older
  // layout moved to the top bar or removed entirely.
  window.EPPStudioLayout = {
    restoreSidebar: function (id) {
      if (!Object.hasOwn(names, id)) return;
      ['home', 'rail', 'top', 'hidden'].forEach(zone => { layout[zone] = layout[zone].filter(item => item !== id); });
      layout.rail.push(id); applyLayout();
    }
  };
  applyLayout();
})();
