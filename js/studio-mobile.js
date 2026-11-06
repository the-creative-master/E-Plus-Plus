/* E++ Studio phone navigation (1.4rc1).
 *
 * Below 900px the Studio shows one panel at a time: Files, Code or Output.
 * The choice lives on <body data-mobile-view="...">, and css/studio.css keys
 * its panel rules off that same attribute. The two must agree - 1.4rc1 shipped
 * with the buttons setting `data-view` while the CSS (and js/ide.js, which is
 * the legacy IDE and is not loaded here) used `data-mobile-view`, so nothing
 * switched and the editor was crushed into a sliver.
 *
 * The core is a pure function so it can be tested without a browser:
 *   EPP.Mobile.apply(view, { body, buttons }) -> the view that was applied
 */
(function (global) {
  'use strict';

  var VIEWS = ['files', 'editor', 'console'];

  function normalise(view) {
    if (view === 'code') return 'editor';
    if (view === 'files' || view === 'editor' || view === 'console') return view;
    return 'editor';
  }

  /**
   * Apply a view to a body element and its buttons.
   * Anything with classList/getAttribute/setAttribute will do, which keeps
   * this testable in Node with plain objects.
   */
  function apply(view, parts) {
    var next = normalise(view);
    var body = parts && parts.body;
    var buttons = (parts && parts.buttons) || [];
    if (body && body.setAttribute) body.setAttribute('data-mobile-view', next);
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var selected = button.getAttribute('data-mobile-view') === next;
      if (button.classList) button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
    return next;
  }

  function read(doc) {
    var body = doc && doc.body;
    return normalise(body && body.getAttribute ? body.getAttribute('data-mobile-view') : 'editor');
  }

  function init(doc) {
    doc = doc || global.document;
    if (!doc || init.done) return init;
    init.done = true;

    var body = doc.body;
    var panes = Array.prototype.slice.call(doc.querySelectorAll('.mobile-view-btn[data-mobile-view]'));
    var dialogs = Array.prototype.slice.call(doc.querySelectorAll('.mobile-view-btn[data-action]'));

    function setView(view) {
      var applied = apply(view, { body: body, buttons: panes });
      if (applied === 'editor') {
        var lines = doc.getElementById('statusLines');
        void lines;
        // The editor was hidden while the view changed; line heights are only
        // measurable once it is back in the layout.
        if (global.requestAnimationFrame) global.requestAnimationFrame(function () {
          try { global.dispatchEvent(new global.Event('resize')); } catch (_) {}
        });
      }
      return applied;
    }

    panes.forEach(function (button) {
      button.addEventListener('click', function () {
        setView(button.getAttribute('data-mobile-view'));
      });
    });

    // Learn and Settings live on the desktop rail, which phones do not show.
    dialogs.forEach(function (button) {
      button.addEventListener('click', function () {
        var target = doc.getElementById(button.getAttribute('data-action'));
        if (target) target.click();
      });
    });

    // Nobody taps Run to stare at the code: on a phone the output is a
    // separate panel, so follow the run into it.
    var runButton = doc.getElementById('btnRun');
    if (runButton) {
      runButton.addEventListener('click', function () {
        if (global.matchMedia && global.matchMedia('(max-width: 900px)').matches) setView('console');
      });
    }

    // Start from the markup if it names a view, otherwise Code.
    setView(read(doc));

    var api = { setView: setView, view: function () { return read(doc); } };
    global.EPP = global.EPP || {};
    global.EPP.Mobile = api;
    return true;
  }

  global.EPP = global.EPP || {};
  global.EPP.Mobile = global.EPP.Mobile || { apply: apply, read: read, init: init, views: VIEWS.slice() };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(document); });
    } else {
      init(document);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
