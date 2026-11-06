/**
 * A small CSS cascade resolver, used by tests to ask "what value wins here?"
 *
 * It exists because eyeballing a stylesheet is how 1.4rc1 shipped a phone
 * layout that kept an 84px desktop-rail gutter: a later `@media all` block
 * with `!important` beat the phone block, and nothing in the test suite
 * modelled specificity or source order.
 *
 *   resolve(cssText, { width, height }) -> { layoutColumns: '...', ... }
 *
 * Scope: the flat, single-class/at-rule selectors used in this project. It
 * understands media queries, !important, specificity and source order, and
 * descendant/child combinators well enough to answer questions like
 * "does `.layout` still have a rail column on a 390px screen?".
 */

const PROPS = [
  'grid-template-columns', 'grid-template-rows', 'display', 'padding', 'gap',
  'flex-direction', 'min-height', 'height', 'width', 'overflow', 'order'
];

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Split a stylesheet into { cond, sel, decls } respecting nesting. */
export function parse(css) {
  const rules = [];
  const text = stripComments(css);

  function walk(chunk, cond) {
    let i = 0;
    let start = 0;
    while (i < chunk.length) {
      if (chunk[i] === '{') {
        const head = chunk.slice(start, i).trim();
        let depth = 1;
        let j = i + 1;
        while (j < chunk.length && depth > 0) {
          if (chunk[j] === '{') depth++;
          else if (chunk[j] === '}') depth--;
          j++;
        }
        const body = chunk.slice(i + 1, j - 1);
        if (head.startsWith('@media')) walk(body, mergeCond(cond, head.slice(6).trim()));
        else if (head.startsWith('@supports') || head.startsWith('@layer')) walk(body, cond);
        else if (head.startsWith('@')) { /* @keyframes, @font-face: not cascadeable here */ }
        else if (head) rules.push({ cond, sel: head, body });
        i = j;
        start = j;
      } else i++;
    }
  }

  walk(text, null);
  return rules;
}

function mergeCond(a, b) {
  if (!a) return b;
  return a + ' and ' + b;
}

function mediaMatches(cond, width, height) {
  if (!cond) return true;
  return splitTopLevel(cond).some((part) => {
    let ok = true;
    const each = (re, test) => {
      const m = part.match(re);
      if (m) ok = ok && test(Number(m[1]));
    };
    each(/max-width:\s*(\d+)px/, (v) => width <= v);
    each(/min-width:\s*(\d+)px/, (v) => width >= v);
    each(/max-height:\s*(\d+)px/, (v) => height <= v);
    each(/min-height:\s*(\d+)px/, (v) => height >= v);
    if (/orientation:\s*landscape/.test(part) && width < height) ok = false;
    if (/orientation:\s*portrait/.test(part) && width > height) ok = false;
    return ok;
  });
}

/** Split a media query list on commas that are not inside parentheses. */
function splitTopLevel(list) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Specificity of a simple selector: [ids, classes/attrs/pseudo, elements]. */
export function specificity(selector) {
  const sel = selector.replace(/::?[a-z-]+\([^)]*\)/gi, ' ').replace(/\[[^\]]*\]/g, ' [] ');
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const classes = (sel.match(/\.[\w-]+|\[\]|:(?!not)[\w-]+/g) || []).length;
  const elements = (sel.match(/(?:^|[\s>+~])([a-z][\w-]*)/g) || []).length;
  return [ids, classes, elements];
}

function compareSpec(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Does `selector` pick an element described by `el`?
 * el = { tag, classes: [], attrs: { name: value }, parents: [ ...same shape ] }
 * Only the last compound (the subject) and its ancestors are checked.
 */
export function selectorMatches(selector, el) {
  // Normalise combinators so "a>b" and "a > b" tokenise the same way.
  const parts = selector.replace(/\s*([>+~])\s*/g, ' $1 ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;

  let i = parts.length - 1;
  let current = parts[i--];
  if (current === '>' || current === '+' || current === '~') return false;
  if (!compoundMatches(current, el)) return false;

  let node = el;
  let combinator = ' ';
  while (i >= 0) {
    let token = parts[i--];
    if (token === '>' || token === '+' || token === '~') {
      combinator = token;
      token = parts[i--];
    }
    if (!token) break;

    if (combinator === '>') {
      node = node.parents && node.parents[0];
      if (!node || !compoundMatches(token, node)) return false;
    } else {
      // A descendant may be any ancestor, not just the immediate one:
      // `body[x] .workspace > .editor-card` skips the .layout in between.
      let ancestor = node.parents && node.parents[0];
      let found = null;
      while (ancestor) {
        if (compoundMatches(token, ancestor)) { found = ancestor; break; }
        ancestor = ancestor.parents && ancestor.parents[0];
      }
      if (!found) return false;
      node = found;
    }
    combinator = ' ';
  }
  return true;
}

export function compoundMatches(compound, el) {
  if (!el) return false;
  const tag = compound.match(/^([a-z][\w-]*)/i);
  if (tag && el.tag && tag[1].toLowerCase() !== el.tag.toLowerCase()) return false;
  // #id must match the element's id, or every id rule would apply everywhere.
  for (const id of compound.match(/#([\w-]+)/g) || []) {
    if (String((el.attrs || {}).id || '') !== id.slice(1)) return false;
  }
  for (const cls of compound.match(/\.([\w-]+)/g) || []) {
    if (!(el.classes || []).includes(cls.slice(1))) return false;
  }
  const attrRe = /\[([\w-]+)(?:=(['"]?)([^'"\]]*)\2)?\]/g;
  let attrHit;
  while ((attrHit = attrRe.exec(compound))) {
    const attr = attrHit[1];
    const value = attrHit[2] ? attrHit[3] : undefined;

    const actual = (el.attrs || {})[attr];
    if (actual === undefined) return false;
    if (value !== undefined && String(actual) !== value) return false;
  }
  if (/:disabled/.test(compound) && !(el.attrs || {}).disabled) return false;
  if (/:hover|:focus|:active/.test(compound)) return false; // not a static state
  return true;
}

/** Which rule wins `prop` for `el` at this viewport? */
export function winner(rules, el, prop, viewport) {
  let best = null;
  rules.forEach((rule, index) => {
    if (!mediaMatches(rule.cond, viewport.width, viewport.height)) return;
    for (const raw of rule.sel.split(',')) {
      const sel = raw.trim();
      if (!sel || !selectorMatches(sel, el)) continue;
      const decl = rule.body.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;}]+)', 'i'));
      if (!decl) continue;
      const rawValue = decl[1];
      const value = rawValue.replace(/\s*!important\s*$/i, '').trim();
      const important = /!important/i.test(rawValue) ? 1 : 0;
      const spec = specificity(sel);
      const candidate = { value, important, spec, index, sel, cond: rule.cond };
      if (!best) { best = candidate; return; }
      if (candidate.important !== best.important) {
        if (candidate.important > best.important) best = candidate;
        return;
      }
      const cmp = compareSpec(candidate.spec, best.spec);
      if (cmp > 0 || (cmp === 0 && candidate.index >= best.index)) best = candidate;
    }
  });
  return best;
}

/** Convenience: resolve a set of properties for one element. */
export function resolve(css, el, viewport, props = PROPS) {
  const rules = parse(css);
  const out = {};
  for (const prop of props) {
    const w = winner(rules, el, prop, viewport);
    if (w) out[prop] = w;
  }
  return out;
}

/** The Studio shell's element tree, as the cascade sees it. */
export function studioTree(view = 'editor') {
  const body = { tag: 'body', classes: [], attrs: { 'data-mobile-view': view }, parents: [] };
  const html = { tag: 'html', classes: [], attrs: {}, parents: [] };
  body.parents = [html];
  const layout = { tag: 'main', classes: ['layout'], attrs: { id: 'mainLayout' }, parents: [body] };
  const rail = { tag: 'nav', classes: ['activity-bar'], attrs: {}, parents: [layout] };
  const sidebar = { tag: 'aside', classes: ['sidebar'], attrs: { id: 'sidebar' }, parents: [layout] };
  const workspace = { tag: 'div', classes: ['workspace'], attrs: { id: 'workspace' }, parents: [layout] };
  const editorCard = { tag: 'section', classes: ['editor-card'], attrs: { id: 'editorCard' }, parents: [workspace] };
  const consoleCard = { tag: 'section', classes: ['console-card'], attrs: { id: 'consoleCard' }, parents: [workspace] };
  const mobileNav = { tag: 'nav', classes: ['mobile-view-nav'], attrs: {}, parents: [body] };
  const bottomBar = { tag: 'div', classes: ['bottom-bar'], attrs: {}, parents: [body] };
  const eyebrow = { tag: 'div', classes: ['workspace-eyebrow'], attrs: {}, parents: [editorCard] };
  return { html, body, layout, rail, sidebar, workspace, editorCard, consoleCard, mobileNav, bottomBar, eyebrow };
}
