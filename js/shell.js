/*
 * E++ Shell engine (Dev Build 6.1.2).
 *
 * Project Humanizer — the IDE's interface is NOT hardbaked in index.html.
 * index.html ships an empty <div id="appRoot"></div>; this module builds the
 * whole chrome (top bar, dashboard, sidebar, editor, console, drawing, status
 * bar, footer and the dialogs) from the UI manifest (ui/manifest.json, with
 * the generated js/ui-shell.js as the offline fallback).
 *
 * Every label, button, panel, hint and placeholder in the IDE comes from that
 * manifest. Element ids stay stable because js/ide.js looks its controls up by
 * id — the manifest is validated against them at build time.
 *
 * Elements are created with createElement/setAttribute/textContent only, so a
 * manifest can never inject markup.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});
  var EPPNS = 'http://www.w3.org/1999/xhtml';

  var MANIFEST_URL = 'ui/manifest.json';
  var FORMAT = 'eplusplus-ui-manifest';

  /**
   * Ids js/ide.js needs to exist. The build tool and the tests check these
   * against the manifest, so a typo in the manifest is caught immediately
   * instead of leaving a dead button.
   */
  var REQUIRED_IDS = [
    'saveStatus', 'btnSave', 'btnExport', 'btnImport', 'btnZip', 'btnSettings', 'btnTutorial', 'importInput',
    'btnStop', 'btnRun', 'dashBanner', 'dashFile', 'dashType', 'dashLibs', 'dashLines',
    'fileCountBadge', 'consoleBadge', 'sidebar', 'btnNew', 'fileSearch', 'fileList', 'noFiles',
    'btnRestoreExamples', 'librariesPanel', 'libraryList', 'helpPanel', 'quickReference',
    'workspace', 'editorCard', 'currentTab', 'currentFileName', 'btnRename', 'btnDelete',
    'editorWrap', 'lineNumberInner', 'highlightCode', 'editor',
    'statusFile', 'statusCursor', 'statusLines', 'statusLibraries', 'statusRun',
    'consoleCard', 'consoleHint', 'btnClearConsole', 'consoleOutput', 'consoleInputForm',
    'consoleInputPrompt', 'consoleInput', 'drawCard', 'drawCanvas',
    'tutorialDialog', 'tutBadge', 'tutTitle', 'tutClose', 'tutSource', 'tutLessonList',
    'tutSummary', 'tutExplanation', 'tutTry', 'tutCode', 'tutStepCount', 'tutPrev', 'tutNext',
    'tutResetPack', 'tutSaveLesson', 'tutExportPack', 'tutImportPack', 'tutPackInput',
    'settingsDialog', 'settingsTitle', 'settingsSub', 'settingsClose', 'settingsGroups',
    'settingsSchemaNote', 'settingsDone',
    'fileDialog', 'fileDialogForm', 'fileDialogTitle', 'fileDialogLabel', 'fileDialogInput',
    'fileDialogError', 'fileDialogCancel', 'fileDialogConfirm', 'toast'
  ];

  // ------------------------------------------------------------------
  // Tiny DOM helpers (no innerHTML anywhere)
  // ------------------------------------------------------------------
  function el(doc, tag, attrs, text) {
    var node = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        var value = attrs[name];
        if (value === undefined || value === null || value === false) return;
        if (value === true) node.setAttribute(name, '');
        else node.setAttribute(name, String(value));
      });
    }
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function text(doc, value) {
    return doc.createTextNode(value === undefined || value === null ? '' : String(value));
  }

  function button(doc, spec, baseClass) {
    var attrs = { id: spec.id, type: 'button' };
    attrs['class'] = spec.className || baseClass || 'btn';
    if (spec.title) attrs.title = spec.title;
    if (spec.ariaLabel) attrs['aria-label'] = spec.ariaLabel;
    if (spec.disabled) attrs.disabled = true;
    return el(doc, 'button', attrs, spec.label);
  }

  function or(value, fallback) {
    return value === undefined || value === null || value === '' ? fallback : value;
  }

  // ------------------------------------------------------------------
  // Section builders — the IDE's structure, filled with manifest data.
  // ------------------------------------------------------------------
  function buildTopbar(doc, manifest) {
    var topbar = manifest.topbar || {};
    var brand = topbar.brand || {};
    var header = el(doc, 'header', { 'class': 'topbar' });

    var brandWrap = el(doc, 'div', { 'class': 'brand' });
    var logo = el(doc, 'div', { 'class': 'logo', 'aria-hidden': 'true' });
    logo.appendChild(text(doc, or(brand.logo && brand.logo.main, 'E')));
    logo.appendChild(el(doc, 'span', null, or(brand.logo && brand.logo.accent, '++')));
    brandWrap.appendChild(logo);

    var brandText = el(doc, 'div', { 'class': 'brand-text' });
    var h1 = el(doc, 'h1', null, or(brand.title, '') + ' ');
    if (brand.badge && brand.badge.text) {
      h1.appendChild(el(doc, 'span', { 'class': 'build-badge', title: brand.badge.title }, brand.badge.text));
    }
    brandText.appendChild(h1);
    if (brand.tagline) brandText.appendChild(el(doc, 'p', null, brand.tagline));
    brandWrap.appendChild(brandText);
    header.appendChild(brandWrap);

    var actions = el(doc, 'div', { 'class': 'top-actions' });
    if (topbar.status && topbar.status.id) {
      actions.appendChild(el(doc, 'span', { id: topbar.status.id, 'class': 'save-status', role: topbar.status.role || 'status' }, topbar.status.text));
    }
    (topbar.actionGroups || []).forEach(function (group) {
      var wrap = el(doc, 'div', { 'class': or(group.className, 'action-group') });
      (group.buttons || []).forEach(function (spec) {
        if (spec.divider) { wrap.appendChild(el(doc, 'span', { 'class': 'action-divider', 'aria-hidden': 'true' })); return; }
        wrap.appendChild(button(doc, spec));
      });
      (group.inputs || []).forEach(function (spec) {
        var attrs = { id: spec.id, type: or(spec.type, 'text') };
        if (spec.accept) attrs.accept = spec.accept;
        if (spec.multiple) attrs.multiple = true;
        if (spec.hidden) attrs.hidden = true;
        if (spec.placeholder) attrs.placeholder = spec.placeholder;
        wrap.appendChild(el(doc, 'input', attrs));
      });
      actions.appendChild(wrap);
    });
    header.appendChild(actions);
    return header;
  }

  function buildDashboard(doc, manifest) {
    var spec = manifest.dashboard;
    if (!spec) return null;
    var banner = el(doc, 'div', { 'class': 'dash-banner', id: spec.id, 'aria-label': spec.ariaLabel });
    (spec.stats || []).forEach(function (stat) {
      var wrap = el(doc, 'div', { 'class': 'dash-stat' });
      if (stat.label) wrap.appendChild(el(doc, 'span', { 'class': 'dash-label' }, stat.label));
      if (stat.pill) {
        wrap.appendChild(el(doc, 'span', { id: stat.id, 'class': 'dash-badge-pill ' + stat.pill }, or(stat.value, '')));
      } else {
        wrap.appendChild(el(doc, 'span', { id: stat.id, 'class': 'dash-val' }, or(stat.value, '')));
      }
      banner.appendChild(wrap);
    });
    if (spec.badge) {
      var box = el(doc, 'div', { 'class': 'dash-stat dash-stat-build' });
      box.appendChild(el(doc, 'span', { 'class': 'dash-badge-pill ' + or(spec.badge.className, 'badge-version') }, spec.badge.text));
      banner.appendChild(box);
    }
    return banner;
  }

  function buildMobileNav(doc, manifest) {
    var spec = manifest.mobileNav;
    if (!spec || !spec.buttons) return null;
    var nav = el(doc, 'nav', { 'class': 'mobile-view-nav', 'aria-label': spec.ariaLabel });
    spec.buttons.forEach(function (spec2) {
      var attrs = {
        'class': 'mobile-view-btn' + (spec2.active ? ' active' : ''),
        type: 'button',
        'data-mobile-view': spec2.view,
        'aria-pressed': spec2.active ? 'true' : 'false'
      };
      if (spec2.controls) attrs['aria-controls'] = spec2.controls;
      var btn = el(doc, 'button', attrs);
      btn.appendChild(el(doc, 'span', { 'class': 'mobile-view-icon', 'aria-hidden': 'true' }, spec2.icon));
      btn.appendChild(el(doc, 'span', null, spec2.label));
      if (spec2.badgeId) {
        var badgeAttrs = { id: spec2.badgeId, 'class': 'mobile-badge', hidden: true };
        if (spec2.badgeAlert) badgeAttrs['class'] = 'mobile-badge mobile-badge-alert';
        if (spec2.badgeLabel) badgeAttrs['aria-label'] = spec2.badgeLabel;
        btn.appendChild(el(doc, 'span', badgeAttrs, spec2.badgeText));
      }
      nav.appendChild(btn);
    });
    return nav;
  }

  function buildSidebar(doc, manifest) {
    var spec = manifest.sidebar;
    if (!spec) return null;
    var files = spec.files || {};
    var aside = el(doc, 'aside', { 'class': 'sidebar', id: spec.id, 'aria-label': spec.ariaLabel });

    var head = el(doc, 'div', { 'class': 'sidebar-head' });
    var h2 = el(doc, 'h2', null, or(files.title, '') + ' ');
    if (files.subtitle) h2.appendChild(el(doc, 'span', { 'class': 'head-sub' }, files.subtitle));
    head.appendChild(h2);
    if (files.newButton) head.appendChild(button(doc, files.newButton, 'btn btn-small btn-accent'));
    aside.appendChild(head);

    if (files.search) {
      aside.appendChild(el(doc, 'input', {
        id: files.search.id, 'class': 'file-search', type: 'search',
        placeholder: files.search.placeholder, 'aria-label': files.search.ariaLabel
      }));
    }
    aside.appendChild(el(doc, 'ul', { id: files.listId, 'class': 'file-list' }));
    var empty = el(doc, 'p', { id: files.emptyId, 'class': 'no-files', hidden: true }, files.empty);
    if (files.emptyHint) {
      empty.appendChild(el(doc, 'br'));
      empty.appendChild(text(doc, files.emptyHint));
    }
    aside.appendChild(empty);

    if (files.restoreButton) {
      var actions = el(doc, 'div', { 'class': 'sidebar-actions' });
      actions.appendChild(button(doc, files.restoreButton, 'btn btn-small'));
      aside.appendChild(actions);
    }

    (spec.sections || []).forEach(function (section) {
      var details = el(doc, 'details', { 'class': 'side-section', id: section.id });
      if (section.open) details.setAttribute('open', '');
      var summary = el(doc, 'summary', null, or(section.title, '') + ' ');
      if (section.subtitle) summary.appendChild(el(doc, 'span', { 'class': 'head-sub' }, section.subtitle));
      details.appendChild(summary);
      if (section.note) {
        var note = el(doc, 'p', { 'class': 'panel-note' }, section.note);
        if (section.noteCode) {
          note.appendChild(el(doc, 'br'));
          note.appendChild(el(doc, 'code', null, section.noteCode));
        }
        details.appendChild(note);
      }
      if (section.hostId) details.appendChild(el(doc, 'div', { id: section.hostId }));
      if (section.code !== undefined) {
        details.appendChild(el(doc, 'pre', { id: section.codeId }, section.code));
      }
      aside.appendChild(details);
    });
    return aside;
  }

  function statusbarItem(doc, spec) {
    if (spec.spacer) return el(doc, 'span', { 'class': 'status-spacer' });
    if (spec.separator) {
      var extra = spec.optional ? ' status-optional' : (spec.linesItem ? ' status-lines-item' : '');
      return el(doc, 'span', { 'class': 'status-sep' + extra }, '·');
    }
    var attrs = { id: spec.id };
    var classes = [];
    if (spec.className) classes.push(spec.className);
    if (spec.optional) classes.push('status-optional');
    if (spec.linesItem) classes.push('status-lines-item');
    if (classes.length) attrs['class'] = classes.join(' ');
    return el(doc, 'span', attrs, spec.text);
  }

  function buildWorkspace(doc, manifest) {
    var spec = manifest.workspace;
    if (!spec) return null;
    var section = el(doc, 'section', { 'class': 'workspace', id: spec.id });

    var editorSpec = spec.editor || {};
    var card = el(doc, 'div', { 'class': 'editor-card', id: editorSpec.id });
    var editorHead = el(doc, 'div', { 'class': 'editor-head' });
    var tab = el(doc, 'div', { 'class': 'tab', id: editorSpec.tabId });
    tab.appendChild(el(doc, 'span', { 'class': 'tab-dot', 'aria-hidden': 'true' }));
    tab.appendChild(el(doc, 'span', { id: editorSpec.fileNameId }, editorSpec.fileName));
    editorHead.appendChild(tab);
    var headActions = el(doc, 'div', { 'class': 'editor-head-actions' });
    (editorSpec.actions || []).forEach(function (action) { headActions.appendChild(button(doc, action, 'btn btn-small')); });
    editorHead.appendChild(headActions);
    card.appendChild(editorHead);

    var wrap = el(doc, 'div', { 'class': 'editor-wrap', id: editorSpec.wrapId });
    var numbers = el(doc, 'div', { 'class': 'line-numbers', 'aria-hidden': 'true' });
    numbers.appendChild(el(doc, 'div', { id: editorSpec.lineNumberId }, '1'));
    wrap.appendChild(numbers);
    var codeArea = el(doc, 'div', { 'class': 'code-area' });
    var highlight = el(doc, 'pre', { 'class': 'highlight-layer', 'aria-hidden': 'true' });
    highlight.appendChild(el(doc, 'code', { id: editorSpec.highlightId }));
    codeArea.appendChild(highlight);
    codeArea.appendChild(el(doc, 'textarea', {
      id: editorSpec.textareaId, 'aria-label': editorSpec.ariaLabel,
      spellcheck: 'false', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
      placeholder: editorSpec.placeholder
    }));
    wrap.appendChild(codeArea);
    card.appendChild(wrap);

    var bar = el(doc, 'div', { 'class': 'statusbar' });
    (spec.statusbar || []).forEach(function (item) { bar.appendChild(statusbarItem(doc, item)); });
    card.appendChild(bar);
    section.appendChild(card);

    var consoleSpec = spec.console || {};
    var consoleCard = el(doc, 'div', { 'class': 'console-card', id: consoleSpec.id });
    var consoleHead = el(doc, 'div', { 'class': 'console-head' });
    consoleHead.appendChild(el(doc, 'h2', null, consoleSpec.title));
    if (consoleSpec.hint) consoleHead.appendChild(el(doc, 'span', { id: consoleSpec.hintId, 'class': 'console-hint' }, consoleSpec.hint));
    if (consoleSpec.clearButton) consoleHead.appendChild(button(doc, consoleSpec.clearButton, 'btn btn-small'));
    consoleCard.appendChild(consoleHead);
    consoleCard.appendChild(el(doc, 'div', { id: consoleSpec.outputId, 'class': 'console-output', 'aria-live': 'polite' }));
    var form = el(doc, 'form', { id: consoleSpec.formId, 'class': 'console-input', hidden: true });
    form.appendChild(el(doc, 'span', { 'class': 'console-input-prompt', id: consoleSpec.promptId }));
    form.appendChild(el(doc, 'input', { id: consoleSpec.inputId, type: 'text', autocomplete: 'off', 'aria-label': consoleSpec.inputLabel }));
    form.appendChild(el(doc, 'button', { 'class': 'btn btn-small btn-accent', type: 'submit' }, consoleSpec.submitLabel));
    consoleCard.appendChild(form);
    section.appendChild(consoleCard);

    var drawSpec = spec.drawing;
    if (drawSpec) {
      var drawCard = el(doc, 'div', { 'class': 'draw-card', id: drawSpec.id, hidden: true });
      var drawHead = el(doc, 'div', { 'class': 'console-head' });
      drawHead.appendChild(el(doc, 'h2', null, drawSpec.title));
      if (drawSpec.hint) drawHead.appendChild(el(doc, 'span', { 'class': 'console-hint' }, drawSpec.hint));
      drawCard.appendChild(drawHead);
      drawCard.appendChild(el(doc, 'canvas', {
        id: drawSpec.canvasId, width: drawSpec.width, height: drawSpec.height
      }, drawSpec.fallback));
      section.appendChild(drawCard);
    }
    return section;
  }

  function buildFooter(doc, manifest) {
    var spec = manifest.footer;
    if (!spec) return null;
    var footer = el(doc, 'footer', { 'class': 'footer' });

    var left = el(doc, 'span');
    if (spec.left) {
      left.appendChild(el(doc, 'strong', null, spec.left.text));
      if (spec.left.rest) left.appendChild(text(doc, spec.left.rest));
      (spec.left.codes || []).forEach(function (codeText, index) {
        left.appendChild(el(doc, 'code', null, codeText));
        left.appendChild(text(doc, index === 0 ? or(spec.left.codesJoin, ' ') : or(spec.left.codesTail, '')));
      });
    }
    footer.appendChild(left);

    if (spec.shortcuts) {
      var right = el(doc, 'span');
      right.appendChild(text(doc, or(spec.shortcuts.label, '') + ' '));
      (spec.shortcuts.keys || []).forEach(function (key, index) {
        if (index > 0) right.appendChild(text(doc, '+'));
        right.appendChild(el(doc, 'kbd', null, key));
      });
      right.appendChild(text(doc, or(spec.shortcuts.between, ' ')));
      (spec.shortcuts.middleKeys || []).forEach(function (key, index) {
        if (index > 0) right.appendChild(text(doc, '+'));
        right.appendChild(el(doc, 'kbd', null, key));
      });
      right.appendChild(text(doc, or(spec.shortcuts.tail, '')));
      footer.appendChild(right);
    }
    return footer;
  }

  function buildTutorialDialog(doc, spec) {
    var dialog = el(doc, 'dialog', { id: spec.id, 'class': 'tutorial-dialog' });
    var head = el(doc, 'div', { 'class': 'tutorial-head' });
    var titleWrap = el(doc, 'div', { 'class': 'tutorial-title-wrap' });
    titleWrap.appendChild(el(doc, 'span', { id: spec.badgeId, 'class': 'tutorial-badge' }, spec.badge));
    titleWrap.appendChild(el(doc, 'h2', { id: spec.titleId }, spec.title));
    head.appendChild(titleWrap);
    head.appendChild(el(doc, 'button', { id: spec.closeId, 'class': 'btn-close', type: 'button', 'aria-label': spec.closeLabel }, '×'));
    dialog.appendChild(head);
    dialog.appendChild(el(doc, 'p', { id: spec.sourceId, 'class': 'tutorial-source' }, spec.source));

    var main = el(doc, 'div', { 'class': 'tutorial-main' });
    main.appendChild(el(doc, 'nav', { 'class': 'tutorial-lessons', id: spec.lessonListId, 'aria-label': spec.lessonListLabel }));
    var body = el(doc, 'div', { 'class': 'tutorial-body' });
    body.appendChild(el(doc, 'p', { id: spec.summaryId, 'class': 'tutorial-summary' }));
    body.appendChild(el(doc, 'p', { id: spec.explanationId, 'class': 'tutorial-explanation' }));
    var codeBox = el(doc, 'div', { 'class': 'tutorial-code-box' });
    var codeHead = el(doc, 'div', { 'class': 'code-box-header' });
    codeHead.appendChild(el(doc, 'span', null, spec.codeBoxTitle));
    codeHead.appendChild(button(doc, spec.tryButton, 'btn btn-small btn-accent'));
    codeBox.appendChild(codeHead);
    codeBox.appendChild(el(doc, 'pre', { id: spec.codeId, 'class': 'tutorial-code' }));
    body.appendChild(codeBox);
    main.appendChild(body);
    dialog.appendChild(main);

    var foot = el(doc, 'div', { 'class': 'tutorial-foot' });
    foot.appendChild(el(doc, 'span', { id: spec.stepId, 'class': 'tutorial-steps' }, spec.stepText));
    var nav = el(doc, 'div', { 'class': 'tutorial-nav-buttons' });
    (spec.nav || []).forEach(function (item) { nav.appendChild(button(doc, item, 'btn btn-small')); });
    foot.appendChild(nav);
    dialog.appendChild(foot);

    var tools = spec.tools || {};
    var toolBar = el(doc, 'div', { 'class': 'tutorial-tools' });
    if (tools.label) toolBar.appendChild(el(doc, 'span', { 'class': 'tutorial-tools-label' }, tools.label));
    (tools.buttons || []).forEach(function (item) { toolBar.appendChild(button(doc, item, 'btn btn-small')); });
    if (tools.input) {
      toolBar.appendChild(el(doc, 'input', { id: tools.input.id, type: tools.input.type, accept: tools.input.accept, hidden: true }));
    }
    var toolNote = el(doc, 'span', { 'class': 'tutorial-tools-note' }, or(tools.notePrefix, ''));
    if (tools.noteCode) toolNote.appendChild(el(doc, 'code', null, tools.noteCode));
    if (tools.noteSuffix) toolNote.appendChild(text(doc, tools.noteSuffix));
    toolBar.appendChild(toolNote);
    dialog.appendChild(toolBar);
    return dialog;
  }

  function buildSettingsDialog(doc, spec) {
    var dialog = el(doc, 'dialog', { id: spec.id, 'class': 'settings-dialog' });
    var head = el(doc, 'div', { 'class': 'settings-head' });
    var headText = el(doc, 'div');
    headText.appendChild(el(doc, 'h2', { id: spec.titleId }, spec.title));
    headText.appendChild(el(doc, 'p', { 'class': 'settings-sub', id: spec.subtitleId }, spec.subtitle));
    head.appendChild(headText);
    head.appendChild(el(doc, 'button', { id: spec.closeId, 'class': 'btn-close', type: 'button', 'aria-label': spec.closeLabel }, '×'));
    dialog.appendChild(head);

    // Rendered later from the settings schema — the host ships empty.
    dialog.appendChild(el(doc, 'div', { 'class': 'settings-body', id: spec.groupsId }));

    var foot = el(doc, 'div', { 'class': 'settings-foot' });
    foot.appendChild(el(doc, 'span', { 'class': 'settings-note', id: spec.noteId }, spec.note));
    foot.appendChild(button(doc, spec.doneButton, 'btn btn-small btn-accent'));
    dialog.appendChild(foot);
    return dialog;
  }

  function buildFileDialog(doc, spec) {
    var dialog = el(doc, 'dialog', { id: spec.id, 'class': 'file-dialog' });
    var form = el(doc, 'form', { method: 'dialog', id: spec.formId });
    form.appendChild(el(doc, 'h2', { id: spec.titleId }, spec.title));
    form.appendChild(el(doc, 'label', { for: spec.inputId, id: spec.labelId }, spec.label));
    form.appendChild(el(doc, 'input', { id: spec.inputId, type: 'text', placeholder: spec.placeholder, autocomplete: 'off' }));
    form.appendChild(el(doc, 'p', { id: spec.errorId, 'class': 'dialog-error', role: 'alert' }));
    var actions = el(doc, 'div', { 'class': 'dialog-actions' });
    actions.appendChild(button(doc, spec.cancelButton));
    actions.appendChild(button(doc, spec.confirmButton));
    form.appendChild(actions);
    dialog.appendChild(form);
    return dialog;
  }

  /** Builds every node described by the manifest. */
  function build(manifest, doc) {
    doc = doc || global.document;
    var root = doc.createDocumentFragment();
    var topbar = buildTopbar(doc, manifest);
    if (topbar) root.appendChild(topbar);
    var dashboard = buildDashboard(doc, manifest);
    if (dashboard) root.appendChild(dashboard);
    var mobileNav = buildMobileNav(doc, manifest);
    if (mobileNav) root.appendChild(mobileNav);

    var layout = el(doc, 'main', { 'class': 'layout' });
    var sidebar = buildSidebar(doc, manifest);
    if (sidebar) layout.appendChild(sidebar);
    var workspace = buildWorkspace(doc, manifest);
    if (workspace) layout.appendChild(workspace);
    root.appendChild(layout);

    var footer = buildFooter(doc, manifest);
    if (footer) root.appendChild(footer);

    var dialogs = manifest.dialogs || {};
    if (dialogs.tutorial) root.appendChild(buildTutorialDialog(doc, dialogs.tutorial));
    if (dialogs.settings) root.appendChild(buildSettingsDialog(doc, dialogs.settings));
    if (dialogs.file) root.appendChild(buildFileDialog(doc, dialogs.file));
    if (manifest.toast) root.appendChild(el(doc, 'div', { id: manifest.toast.id, 'class': 'toast', role: manifest.toast.role, hidden: true }));
    return root;
  }

  /** Replaces the page with the manifest's interface. */
  function render(manifest, doc) {
    doc = doc || global.document;
    if (!doc || !doc.body) return null;
    var host = doc.getElementById('appRoot');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'appRoot';
      doc.body.insertBefore(host, doc.body.firstChild);
    }
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(build(manifest, doc));
    applyDocument(manifest, doc);
    return host;
  }

  /** Title, description and body attributes are manifest data too. */
  function applyDocument(manifest, doc) {
    doc = doc || global.document;
    if (!doc) return;
    var spec = manifest.document || {};
    if (spec.title) doc.title = spec.title;
    if (spec.description) {
      var meta = doc.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', spec.description);
    }
    Object.keys(spec.bodyAttributes || {}).forEach(function (name) {
      doc.body.setAttribute(name, String(spec.bodyAttributes[name]));
    });
  }

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------
  function validate(manifest) {
    var problems = [];
    if (!manifest || typeof manifest !== 'object') return ['The UI manifest is not an object.'];
    if (manifest.format !== FORMAT) problems.push('Expected format "' + FORMAT + '".');
    ['document', 'topbar', 'sidebar', 'workspace', 'dialogs'].forEach(function (section) {
      if (!manifest[section]) problems.push('The manifest is missing its "' + section + '" section.');
    });
    var seen = {};
    // Element ids are written either as "id": "..." or as a "...Id" field
    // ("titleId", "hostId", …); both must be present exactly once.
    (function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      Object.keys(node).forEach(function (key) {
        var value = node[key];
        if ((key === 'id' || /Id$/.test(key)) && typeof value === 'string' && value) {
          if (seen[value]) problems.push('The id "' + value + '" is used twice.');
          seen[value] = true;
          return;
        }
        walk(value);
      });
    })(manifest);
    REQUIRED_IDS.forEach(function (id) {
      if (!seen[id]) problems.push('The manifest does not create the required element id "' + id + '".');
    });
    return problems;
  }

  function bundledManifest() {
    return EPP.UiShell || null;
  }

  function parseManifest(text) {
    if (typeof text !== 'string') return { ok: false, error: 'A UI manifest must be JSON text.' };
    var value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'That UI manifest is not valid JSON: ' + e.message };
    }
    var problems = validate(value);
    if (problems.length) return { ok: false, error: problems.join('\n'), problems: problems };
    return { ok: true, manifest: value };
  }

  function canFetch() {
    if (typeof global.fetch !== 'function') return false;
    var loc = global.location;
    if (!loc || !loc.protocol) return false;
    return loc.protocol === 'http:' || loc.protocol === 'https:';
  }

  function fetchManifest(options) {
    options = options || {};
    if (options.loadRemote === false || !canFetch()) return Promise.resolve(null);
    var url = options.url || MANIFEST_URL;
    return global.fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response || !response.ok) return null;
      return response.text();
    }).then(function (body) {
      if (!body) return null;
      var parsed = parseManifest(body);
      if (!parsed.ok) return { error: url + ' could not be loaded: ' + parsed.error };
      return parsed.manifest;
    }).catch(function () {
      return null;
    });
  }

  /** A cheap fingerprint so a changed manifest.json is noticed. */
  function signature(manifest) {
    var json = JSON.stringify(manifest || {});
    var hash = 0;
    for (var i = 0; i < json.length; i += 1) {
      hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0;
    }
    return String(hash);
  }

  /**
   * Renders the bundled manifest straight away (so js/ide.js, which runs next,
   * always finds its elements), then checks ui/manifest.json in the background.
   * If the served manifest differs, the page reloads once so the edited UI is
   * used — editing the manifest never requires touching code or rebuilding.
   */
  function boot(options) {
    options = options || {};
    var doc = options.document || global.document;
    var bundled = bundledManifest();
    if (!bundled) return Promise.resolve({ manifest: null, source: 'none', warnings: ['The bundled UI manifest is missing.'] });
    render(bundled, doc);
    var reloadKey = 'eplusplus.ui.reloaded';
    return fetchManifest(options).then(function (fetched) {
      if (!fetched || fetched.error || signature(fetched) === signature(bundled)) {
        return {
          manifest: bundled,
          source: fetched && !fetched.error ? MANIFEST_URL : 'bundled manifest (js/ui-shell.js)',
          warnings: fetched && fetched.error ? [fetched.error] : []
        };
      }
      var store = null;
      try { store = global.sessionStorage; } catch (e) { store = null; }
      var already = false;
      try { already = !!(store && store.getItem(reloadKey)); } catch (e) { already = false; }
      if (!already) {
        try { store.setItem(reloadKey, signature(fetched)); } catch (e) { /* ignore */ }
        EPP.Shell.reload();
      }
      return { manifest: fetched, source: MANIFEST_URL, warnings: [], reloaded: true };
    });
  }

  /** Renders the interface as soon as the script loads, so js/ide.js — which
   *  runs next — always finds its elements. Set EPP.Shell.autorun = false to
   *  take over (the tests do that). */
  function autorun() {
    if (!global.document || !global.document.body) return null;
    if (global.EPP && global.EPP.Shell && global.EPP.Shell.autorun === false) return null;
    return boot();
  }

  EPP.Shell = {
    MANIFEST_URL: MANIFEST_URL,
    autorun: true,
    lastBoot: null,
    FORMAT: FORMAT,
    REQUIRED_IDS: REQUIRED_IDS,
    boot: boot,
    render: render,
    build: build,
    validate: validate,
    parseManifest: parseManifest,
    bundledManifest: bundledManifest,
    signature: signature,
    element: el,
    /** Reloading is indirect so a host page (or a test) can take it over. */
    reload: function () {
      if (global.location && typeof global.location.reload === 'function') global.location.reload();
    }
  };

  EPP.Shell.lastBoot = autorun();
})(typeof globalThis !== 'undefined' ? globalThis : this);
