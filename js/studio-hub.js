/* Studio Tools: searchable actions, projects and independently configurable shortcuts. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const key = 'epp_studio_shortcuts_1_4a3';
  const catalog = [
    { id: 'explorer', name: 'Explorer', icon: '▤', activity: 'files', legacy: 'explorer' },
    { id: 'libraries', name: 'Libraries', icon: '▥', activity: 'libraries', legacy: 'libraries' },
    { id: 'guide', name: 'Quick reference', icon: '▧', activity: 'guide', legacy: 'guide' },
    { id: 'learn', name: 'Learn E++', icon: '✦', target: 'btnLearn', legacy: 'learn' },
    { id: 'settings', name: 'Settings', icon: '⚙', target: 'btnSettings', legacy: 'settings' },
    { id: 'new', name: 'New file', icon: '+', target: 'btnNew' },
    { id: 'save', name: 'Save file', icon: '↓', target: 'btnSave' },
    { id: 'import', name: 'Import', icon: '↙', target: 'btnImport' },
    { id: 'export', name: 'Export', icon: '↗', target: 'btnExport' },
    { id: 'rename', name: 'Rename file', icon: '✎', target: 'btnRename' },
    { id: 'delete', name: 'Delete file', icon: '×', target: 'btnDelete' },
    { id: 'clear', name: 'Clear code', icon: '⌫', target: 'btnClear' },
    { id: 'run', name: 'Run code', icon: '▶', target: 'btnRun' },
    { id: 'stop', name: 'Stop program', icon: '■', target: 'btnStop' },
    { id: 'wrap', name: 'Wrap lines', icon: '↵', target: 'btnWrap' },
    { id: 'clearOutput', name: 'Clear output', icon: '⌧', target: 'btnClearConsole' },
    { id: 'eshare', name: 'EShare', icon: '⇧', target: 'btnGallery' },
    { id: 'image', name: 'Game images', icon: '▣', target: 'btnImage', gameOnly: true },
    { id: 'keys', name: 'Project keys', icon: '⌑', target: 'btnKeys' },
    { id: 'download', name: 'Download E++.zip', icon: '⇩', target: 'btnZip' },
    { id: 'wiki', name: 'Wiki', icon: '?', target: 'btnWiki' },
    { id: 'news', name: 'News', icon: '✳', target: 'btnNews' },
    { id: 'suggest', name: 'Suggest an idea', icon: '✧', target: 'btnSuggest' },
    { id: 'restore', name: 'Restore examples', icon: '⟳', target: 'btnRestoreExamples' }
  ];
  const essential = ['explorer', 'libraries', 'settings', 'new', 'save', 'import', 'export', 'run', 'stop', 'eshare'];
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_) {}
  function settings(item) {
    const p = preferences[item.id];
    return { sidebar: p && typeof p.sidebar === 'boolean' ? p.sidebar : true, tools: p && typeof p.tools === 'boolean' ? p.tools : true };
  }
  function save() { try { localStorage.setItem(key, JSON.stringify(preferences)); } catch (_) {} }
  function available(item) {
    const target = item.target && $(item.target);
    return !(target && (target.disabled || (item.gameOnly && target.style.display === 'none')));
  }
  function activate(item) {
    if (!available(item)) return;
    if (item.activity) {
      const control = document.querySelector('[data-activity="' + item.activity + '"]');
      if (control) control.click();
    } else if (item.target) $(item.target).click();
  }
  function makeButton(item, area) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = area === 'sidebar' ? 'activity-item hub-sidebar-item' : 'tools-feature';
    b.title = item.name; b.setAttribute('aria-label', item.name); b.dataset.hubId = item.id;
    const icon = document.createElement('span'); icon.className = 'hub-icon'; icon.textContent = item.icon; icon.setAttribute('aria-hidden', 'true');
    b.appendChild(icon);
    if (area === 'tools') { const label = document.createElement('span'); label.textContent = item.name; b.appendChild(label); }
    b.disabled = !available(item);
    b.addEventListener('click', () => activate(item));
    return b;
  }
  function renderSidebar() {
    const host = $('extraSidebar'); host.replaceChildren();
    catalog.forEach(item => {
      const enabled = settings(item).sidebar;
      if (item.legacy) {
        const node = document.querySelector('[data-component="' + item.legacy + '"]');
        if (node) node.classList.toggle('hub-disabled', !enabled);
      } else if (enabled) host.appendChild(makeButton(item, 'sidebar'));
    });
  }
  function renderTools() {
    const text = $('toolsSearch').value.trim().toLocaleLowerCase();
    const host = $('toolsFeatureList'); host.replaceChildren();
    const visible = catalog.filter(item => settings(item).tools && item.name.toLocaleLowerCase().includes(text));
    visible.forEach(item => host.appendChild(makeButton(item, 'tools')));
    $('toolsFeatureCount').textContent = visible.length;
    if (!visible.length) { const empty = document.createElement('p'); empty.className = 'tools-empty'; empty.textContent = 'No matching features.'; host.appendChild(empty); }
    const projectHost = $('toolsProjectList'); projectHost.replaceChildren();
    const projects = Object.keys(files).filter(name => name.toLocaleLowerCase().includes(text)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
    $('toolsProjectCount').textContent = projects.length;
    projects.forEach(name => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tools-project';
      const icon = document.createElement('span'); icon.className = 'tools-project-icon'; icon.textContent = 'E';
      const label = document.createElement('span'); label.textContent = name;
      button.append(icon, label);
      if (name === currentFileName) { const current = document.createElement('small'); current.textContent = 'OPEN'; button.appendChild(current); }
      button.addEventListener('click', () => loadFile(name));
      projectHost.appendChild(button);
    });
    if (!projects.length) { const empty = document.createElement('p'); empty.className = 'tools-empty'; empty.textContent = text ? 'No matching projects.' : 'No projects yet.'; projectHost.appendChild(empty); }
  }
  function renderEditor(focusId, focusArea) {
    const host = $('featureEditorList'); host.replaceChildren();
    catalog.forEach(item => {
      const row = document.createElement('div'); row.className = 'feature-edit-row';
      const title = document.createElement('span'); title.className = 'feature-edit-name'; title.textContent = item.icon + '  ' + item.name; row.appendChild(title);
      ['sidebar', 'tools'].forEach(area => {
        const label = document.createElement('label'); label.className = 'feature-check';
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = settings(item)[area];
        if (area === 'sidebar' && item.legacy) {
          const original = document.querySelector('[data-component="' + item.legacy + '"]');
          input.checked = input.checked && !!original && !original.hidden && original.parentNode === document.querySelector('.activity-bar');
        }
        input.setAttribute('aria-label', item.name + ' in ' + (area === 'sidebar' ? 'sidebar' : 'Tools'));
        input.dataset.feature = item.id; input.dataset.area = area;
        input.addEventListener('change', () => {
          const p = settings(item); p[area] = input.checked; preferences[item.id] = p;
          if (area === 'sidebar' && item.legacy && input.checked && window.EPPStudioLayout) {
            const original = document.querySelector('[data-component="' + item.legacy + '"]');
            if (original && (original.hidden || original.parentNode !== document.querySelector('.activity-bar'))) window.EPPStudioLayout.restoreSidebar(item.legacy);
          }
          if (area === 'sidebar' && item.activity && !input.checked) {
            const original = document.querySelector('[data-activity="' + item.activity + '"]');
            if (original && original.classList.contains('active')) original.click();
          }
          save(); renderSidebar(); renderTools();
        });
        label.appendChild(input); row.appendChild(label);
      });
      host.appendChild(row);
    });
    if (focusId) { const target = host.querySelector('[data-feature="' + focusId + '"][data-area="' + focusArea + '"]'); if (target) target.focus(); }
  }
  function openEditor() { if ($('featureDialog').open) return; renderEditor(); $('featureDialog').showModal(); }
  $('btnEditFeatures').addEventListener('click', openEditor);
  $('btnSidebarEdit').addEventListener('click', openEditor);
  $('featureClose').addEventListener('click', () => $('featureDialog').close());
  $('featureDone').addEventListener('click', () => $('featureDialog').close());
  $('featureLayout').addEventListener('click', () => { $('featureDialog').close(); $('openStudioEditor').click(); });
  document.querySelectorAll('[data-feature-preset]').forEach(button => button.addEventListener('click', () => {
    preferences = {};
    if (button.dataset.featurePreset === 'essential') catalog.forEach(item => { preferences[item.id] = { sidebar: essential.includes(item.id), tools: true }; });
    if (window.EPPStudioLayout) catalog.forEach(item => {
      if (item.legacy && settings(item).sidebar) {
        const original = document.querySelector('[data-component="' + item.legacy + '"]');
        if (original && (original.hidden || original.parentNode !== document.querySelector('.activity-bar'))) window.EPPStudioLayout.restoreSidebar(item.legacy);
      }
    });
    save(); renderSidebar(); renderTools(); renderEditor();
  }));
  $('toolsSearch').addEventListener('input', renderTools);
  $('toolsProjectJump').addEventListener('click', event => { event.preventDefault(); $('toolsProjectList').scrollIntoView({ block: 'nearest' }); });
  const oldSetToolsOpen = setToolsOpen;
  setToolsOpen = function (open, restoreFocus) {
    oldSetToolsOpen(open, restoreFocus);
    if (open) { $('toolsSearch').value = ''; renderTools(); }
  };
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'p') return;
    if (document.querySelector('dialog[open]') || topModal()) return;
    event.preventDefault();
    const opening = !toolsPanel.classList.contains('is-open');
    setToolsOpen(opening, !opening);
    if (opening) $('toolsSearch').focus();
  });
  // Keep Run/Stop and the contextual Game image action in sync during a run.
  catalog.forEach(item => { const node = item.target && $(item.target); if (!node || !['run', 'stop', 'image'].includes(item.id)) return; let previous = available(item); new MutationObserver(() => { const next = available(item); if (next === previous) return; previous = next; renderSidebar(); if (toolsPanel.classList.contains('is-open')) renderTools(); }).observe(node, { attributes: true, attributeFilter: ['disabled', 'style'] }); });
  renderSidebar();
})();
