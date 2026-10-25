/*
 * E++ Studio — keyboard and focus helpers for the panels that sit on top of
 * the page (tutorials, ideas, the ask dialog).
 *
 * A dialog that takes over the screen has to behave like one: focus moves into
 * it, Tab stays inside it, and closing it puts focus back where it came from.
 * Without that, the Tab key silently walks into the editor behind the panel
 * and nobody can tell where they are.
 *
 * The rules are pure functions over duck-typed elements, so the test suite can
 * check them without a browser.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  // Elements a browser puts in the Tab order by default.
  var FOCUSABLE_TAGS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];
  // Inputs that never receive focus, whatever their tag says.
  var SKIP_INPUT_TYPES = ['hidden', 'file'];

  function attr(el, name) {
    if (!el) return null;
    if (typeof el.getAttribute === 'function') return el.getAttribute(name);
    return el[name] == null ? null : String(el[name]);
  }

  /** True when Tab should stop on this element. */
  function isFocusable(el) {
    if (!el || typeof el !== 'object') return false;
    if (el.disabled) return false;
    if (el.hidden) return false;
    if (attr(el, 'aria-hidden') === 'true') return false;
    if (el.closest && el.closest('[hidden]')) return false;

    var tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' && SKIP_INPUT_TYPES.indexOf(String(el.type || 'text').toLowerCase()) !== -1) {
      return false;
    }

    if (FOCUSABLE_TAGS.indexOf(tag) !== -1) {
      // A link without href is not reachable, and a disabled button was caught
      // above; `name` is not a link at all.
      if (tag === 'A' && !attr(el, 'href')) return false;
      return true;
    }

    var index = Number(el.tabIndex);
    return isFinite(index) && index >= 0;
  }

  /** Keeps the focusable entries of `list`, in order. */
  function focusables(list) {
    if (!list || typeof list.length !== 'number') return [];
    var kept = [];
    for (var i = 0; i < list.length; i++) {
      if (isFocusable(list[i])) kept.push(list[i]);
    }
    return kept;
  }

  /**
   * Where Tab goes from `current` in a ring of `count` stops.
   * A current index of -1 means "focus is outside the ring", so forward goes
   * to the first stop and backward to the last one.
   */
  function nextIndex(count, current, shift) {
    if (!(count > 0)) return -1;
    var from = (typeof current === 'number' && current >= 0) ? current : (shift ? 0 : count - 1);
    return (from + (shift ? -1 : 1) + count) % count;
  }

  /** What to focus when a dialog opens: the first real stop inside it. */
  function firstFocusable(list) {
    var kept = focusables(list);
    return kept.length ? kept[0] : null;
  }

  EPP.A11y = {
    isFocusable: isFocusable,
    focusables: focusables,
    nextIndex: nextIndex,
    firstFocusable: firstFocusable
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { A11y: EPP.A11y };
  }
})(typeof window !== 'undefined' ? window : globalThis);
