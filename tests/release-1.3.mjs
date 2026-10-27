// E++ 1.3: Studio preflight, safe editor highlighting, and the drawing host.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const diagnostics = require('../js/diagnostics.js');
const editor = require('../js/studio-editor.js');
const { DrawHost } = require('../js/draw-library.js');

function error(source, code, line) {
  try { diagnostics.validate(source, 'test.enpp'); assert.fail('Expected ' + code + ' from ' + source); }
  catch (e) {
    assert.equal(e.code, code, source);
    assert.equal(e.filename, 'test.enpp');
    if (line) assert.equal(e.line, line, source);
    assert.ok(e.col > 0 && e.reason && e.help, 'diagnostic includes location and advice');
  }
}

for (const [source, code, line] of [
  ['fheneir', 'E101', 1],
  ['say hello', 'E402', 1],
  ['say hello world', 'E402', 1],
  ['say "valid", hello', 'E402', 1],
  ["let 'name' be Ada", 'E402', 1],
  ['say "unclosed', 'E102', 1],
  ["say ''", 'E202', 1],
  ['say', 'E105', 1],
  ['otherwise say "bad"', 'E104', 1],
  ['note [unclosed', 'E101', 1],
  ['say "ok" // not a note', 'E101', 1],
  ['repeat 0 times\n  if 1 is 1 then:\n    say "x"\nend repeat', 'E106', 4],
  ['if 1 is 2 then say hello world', 'E402', 1],
  ['if 1 is 2 then let name be 1', 'E202', 1],
  ["if 1 is 2 then let 'x' be", 'E105', 1],
  ["if 1 is 2 then ask hello and save the output as 'x'", 'E402', 1],
  ['repeat 0 times\n  repeat hello times\n  end repeat\nend repeat', 'E402', 2],
  ["if 1 is 2 then:\n  let 'x' be hello\nend if", 'E402', 2],
  ['repeat 0 times\n  fheneir\nend repeat', 'E101', 2],
  ['if 1 is 1 then say "x" otherwise say "y"', 'E103', 1],
  ['say the absolute value of hello', 'E402', 1]
]) error(source, code, line);

for (const source of [
  'say "Hello, world"', 'say "https://example.com/#section"',
  'add the "Math" library\nsay the absolute value of 0 minus 42',
  'add library "Strings"\nsay "Result:", the uppercase of "Hello"',
  'add library "Random"\nsay a random number between 1 and 6',
  `add library "Random"\nlet 'lo' be 2\nlet 'hi' be 2\nsay it's a random number between 'lo' and 'hi', " done"`,
  'say "escaped \\" // is not a comment"',
  'say 1 + 2 and concat it with 2 + 3 with the separation method of "-"',
  "repeat 2 times\n  if 1 is 1 then:\n    say 'name'\n  end if\nend repeat",
  "add library \"Draw\"\ndefine 'any name' as drawing sprite\n'any name' move right \"10\""
]) assert.equal(diagnostics.validate(source, 'valid.enppl'), true, source);

const highlighted = editor.highlight('say "<img src=x onerror=alert(1)>"\nlet \'item\' be 5');
assert(!highlighted.includes('<img'), 'source cannot inject HTML into the highlight layer');
assert(highlighted.includes('&lt;img') && highlighted.includes('syn-variable'));

// Line wrapping keeps logical line numbers aligned, caches measurements, and
// never interprets source text as markup. A tiny measuring DOM is enough to
// exercise the bookkeeping without requiring a browser in the Node suite.
{
  let measurements = 0;
  class Element {
    constructor(fragment = false) { this.fragment = fragment; this.children = []; this.style = {}; this.textContent = ''; }
    setAttribute() {}
    appendChild(child) { this.children.push(...(child.fragment ? child.children : [child])); }
    getBoundingClientRect() { measurements++; return { height: this.textContent.length > 8 ? 52 : 26 }; }
    remove() {}
  }
  const layer = { style: {} };
  const doc = {
    getElementById: () => layer,
    createElement: () => new Element(),
    createDocumentFragment: () => new Element(true),
    body: { appendChild() {} }
  };
  const gutter = {
    children: [], scrollTop: 0,
    set innerHTML(html) { this.children = [...html.matchAll(/<div>(\d+)<\/div>/g)].map(() => new Element()); },
  };
  const field = { value: 'a long source line\nshort\na long source line', clientWidth: 200, scrollTop: 52, ownerDocument: doc };
  const original = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({
    paddingLeft: '10px', paddingRight: '10px', fontFamily: 'monospace', fontSize: '16px',
    fontWeight: '400', fontStyle: 'normal', lineHeight: '26px', letterSpacing: 'normal', wordSpacing: '0px', tabSize: '4'
  });
  try {
    editor.renderLineNumbers(field, gutter, true);
    assert.deepEqual(gutter.children.map(row => row.style.height), ['52px', '26px', '52px']);
    assert.equal(measurements, 2, 'duplicate lines are measured only once');
    assert.equal(layer.style.width, '200px');
    assert.equal(gutter.scrollTop, 52);
    field.value = 'a long source line\nshorter\na long source line';
    editor.renderLineNumbers(field, gutter, true);
    assert.equal(measurements, 3, 'only the changed line is remeasured');
    field.clientWidth = 180;
    editor.renderLineNumbers(field, gutter, true);
    assert.equal(measurements, 5, 'a new width invalidates cached measurements');
    editor.renderLineNumbers(field, gutter, false);
    assert.deepEqual(gutter.children.map(row => row.style.height), ['', '', '']);
    assert.equal(layer.style.width, '');
    field.clientWidth = 0;
    field.value = '<script>not markup</script>\n';
    editor.renderLineNumbers(field, gutter, true);
    assert.equal(gutter.children.length, 2, 'hidden editors still get logical line numbers');
  } finally {
    if (original === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = original;
  }
}

// A host can render against any canvas; this recording context needs no DOM.
const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true) });
const host = new DrawHost({ width: 800, height: 360, getContext: () => context });
const first = host.create('Pencil');
const second = host.create('Other cursor');
assert.notEqual(first.color, second.color);
assert.equal(host.get('pencil'), first, 'sprite names are case-insensitive');
host.move('Pencil', 'right', 40);
host.move('Other cursor', 'down', 10);
assert.deepEqual([first.x, first.y, second.x, second.y], [40, 0, 0, 10]);
assert.equal(host.strokes.length, 2);
host.setPen('Pencil', false);
host.move('pencil', 'up', 5);
assert.equal(host.strokes.length, 2, 'a lifted pen does not leave a trail');
host.setPen('Pencil', true);
host.setColor('Pencil', '#fff');
host.move('pencil', 'left', 5);
assert.equal(host.strokes.at(-1).color, '#fff');
host.clear();
assert.equal(host.strokes.length, 0);
assert.equal(host.sprites.size, 2, 'clear leaves cursors in place');
await host.flush();
host.remove('PENCIL');
assert.equal(host.sprites.size, 1);
host.reset();
assert.equal(host.sprites.size, 0);
console.log('E++ 1.3 Studio diagnostics, highlighting, wrapping, and Draw tests passed.');
