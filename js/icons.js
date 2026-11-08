/* E++ icon set (1.4).
 *
 * Every icon is a 24x24 stroke drawing, so buttons, the Tools list and the
 * sidebar all use the same shapes. Before this file the Studio mixed Unicode
 * glyphs with SVG: the activity rail drew vector icons, while the Tools
 * buttons and their editor showed characters such as  (U+25A4),  (U+25E5),
 *  (U+2199) and  (U+2197). Those glyphs depend on the installed font, look
 * like boxes or arrows pointing nowhere, and cannot be styled.
 *
 *   EPP.Icons.get('files')        -> '<svg ...></svg>'
 *   EPP.Icons.markup('files')     -> '<span class="epp-icon" data-icon="files"></span>'
 *   EPP.Icons.hydrate(root)       -> fills every empty .epp-icon in root
 *
 * Markup written by hand only needs the span: hydrate() fills it in.
 */
(function (global) {
  'use strict';

  // 24x24, stroked with currentColor unless the body says otherwise.
  var PATHS = {
    files: '<path d="M3 7.5h6l2 2h9A1.5 1.5 0 0 1 21.5 11v7a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9a1.5 1.5 0 0 1 .5-1.5Z"/>',
    libraries: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3-1 3 15-3 1z"/>',
    reference: '<path d="M4 5c3-1 5-1 8 1v14c-3-2-5-2-8-1zM20 5c-3-1-5-1-8 1v14c3-2 5-2 8-1z"/>',
    learn: '<path d="m3 9 9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5M21 9v7"/>',
    settings: '<path d="m10 3-.5 2.2-2 .9-2-1.2-2 3.4 1.7 1.5v2.4l-1.7 1.5 2 3.4 2-1.2 2 .9L10 21h4l.5-2.2 2-.9 2 1.2 2-3.4-1.7-1.5V9.8l1.7-1.5-2-3.4-2 1.2-2-.9L14 3z"/><circle cx="12" cy="12" r="3"/>',
    customize: '<path d="M4 7h8M16 7h4M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',

    new: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8.5 4v5h7V4"/><path d="M8.5 20v-5.5h7V20"/>',
    open: '<path d="M3 6.5h6l2 2h10v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10.5h18"/>',
    import: '<path d="M12 3.5v10.5M8 10.5l4 4 4-4"/><path d="M4 17v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V17"/>',
    export: '<path d="M12 15V4.5M8 8l4-4 4 4"/><path d="M4 17v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V17"/>',
    download: '<path d="M12 3.5v9M8.5 9.5l3.5 3.5 3.5-3.5"/><path d="M4.5 15v4.5h15V15"/><path d="M4.5 19.5h15"/>',
    rename: '<path d="M4 20l1-4L17 4l4 4L9 20z"/><path d="M14.5 6.5l3 3"/>',
    delete: '<path d="M4 7h16M9.5 7V4.5h5V7"/><path d="M6.5 7l1 12.5h9L17.5 7"/><path d="M10.5 11v5M13.5 11v5"/>',
    clear: '<path d="M11 5 4 12l6 6h4l7-7z"/><path d="M8.5 8.5l6 6"/><path d="M14 20h6"/>',
    run: '<path d="M8 4.5 19.5 12 8 19.5z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
    wrap: '<path d="M4 6h16M4 12h12a3 3 0 1 1 0 6h-3"/><path d="M4 18h5"/><path d="m15.5 15-2.5 3 2.5 3"/>',
    clearOutput: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="m7.5 10 2.5 2.5L7.5 15"/><path d="M13 15h4"/>',
    eshare: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.3 10.8 15.7 6.2M8.3 13.2l7.4 4.6"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.7"/><path d="m4 18 5.5-5.5L13 16l3-3 4.5 4.5"/>',
    keys: '<circle cx="7.5" cy="8" r="3.5"/><path d="M10 10.5 20 20.5M16.5 17l2.5-2.5M18.5 19.5l2-2"/>',
    wiki: '<path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4.5h4"/><path d="M9 12h6M9 16h4"/>',
    news: '<path d="M4 5h11v14H4z"/><path d="M15 8h5v9a2 2 0 0 1-2 2h-3"/><path d="M7 9h5M7 12h5M7 15h3"/>',
    suggest: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 1 3.5 10.8c-.6.5-.9 1.2-.9 2H9.4c0-.8-.3-1.5-.9-2A6 6 0 0 1 12 3z"/>',
    restore: '<path d="M4 10a8 8 0 1 1 2.3 6.3"/><path d="M3.5 4.5v6h6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4 4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    back: '<path d="M10 5 3.5 12 10 19"/><path d="M3.5 12H20"/>',
    list: '<path d="M4 7h16M4 12h16M4 17h10"/>'
  };

  function get(id, size) {
    var body = PATHS[id];
    if (!body) body = PATHS.files;
    var px = size ? ' width="' + size + '" height="' + size + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"' +
      px + '>' + body + '</svg>';
  }

  /** A placeholder span; hydrate() turns it into the drawing. */
  function markup(id, extraClass) {
    return '<span class="epp-icon' + (extraClass ? ' ' + extraClass : '') + '" data-icon="' + id + '" aria-hidden="true"></span>';
  }

  /** An element, for code that builds nodes instead of strings. */
  function element(id, extraClass) {
    var span = document.createElement('span');
    span.className = 'epp-icon' + (extraClass ? ' ' + extraClass : '');
    span.dataset.icon = id;
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = get(id);
    return span;
  }

  function hydrate(root) {
    if (typeof document === 'undefined') return 0;
    var scope = root || document;
    var nodes = scope.querySelectorAll ? scope.querySelectorAll('.epp-icon[data-icon]') : [];
    var filled = 0;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.firstElementChild) continue; // already drawn
      node.innerHTML = get(node.dataset.icon);
      filled += 1;
    }
    return filled;
  }

  function has(id) { return Object.prototype.hasOwnProperty.call(PATHS, id); }

  global.EPP = global.EPP || {};
  global.EPP.Icons = {
    get: get,
    markup: markup,
    element: element,
    hydrate: hydrate,
    has: has,
    ids: Object.keys(PATHS)
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { hydrate(); });
    } else {
      hydrate();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
