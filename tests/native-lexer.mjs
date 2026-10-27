// Verify the browser WebAssembly lexer against the same C++ lexer used by CLI.
// `make test` supplies a native probe; `npm test` also works without a compiler.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lexer = require('../js/native-lexer.js');
const hash = createHash('sha256');
for (const file of ['include/lexer.hpp', 'src/lexer.cpp', 'src/wasm_lexer.cpp']) {
  hash.update(file + '\0').update(readFileSync(path.join(root, file)));
}
assert.equal(lexer.sourceSha256, hash.digest('hex'),
  'The browser lexer is out of date. Run make wasm-lexer after editing its C++ sources.');
await lexer.ready();

const simple = lexer.tokenize('say 17.25 plus 9', 'test.enpp');
assert.deepEqual(simple.map(t => t.type), ['say', 'NUMBER', 'plus', 'NUMBER', 'EOF']);
assert.deepEqual(simple.filter(t => t.type === 'NUMBER').map(t => t.value), [17.25, 9]);
assert.equal(lexer.tokenize('say "A \\"quote\\" and Ω"')[1].value, 'A "quote" and Ω');
assert.equal(lexer.tokenize("let 'any name 473' be 2")[1].value, 'any name 473');
for (const [program, code, line, col] of [
  ['say "unterminated', 'E102', 1, 5],
  ["say ''", 'E202', 1, 5],
  ['say 1 // comment', 'E101', 1, 7],
  ['note [not closed', 'E101', 1, 1],
  ['say 1\nsay "unfinished', 'E102', 2, 5]
]) {
  assert.throws(() => lexer.tokenize(program, 'different.enpp'), e =>
    e.code === code && e.filename === 'different.enpp' && e.line === line && e.col === col);
}

// A missing binary must fail visibly; there is no silent JS-lexer fallback.
const context = vm.createContext({ TextEncoder, TextDecoder, WebAssembly, Uint8Array, DataView, Promise, Math });
context.globalThis = context;
vm.runInContext(readFileSync(path.join(root, 'js/native-lexer.js'), 'utf8'), context);
await assert.rejects(context.EPP.NativeLexer.ready(), e => e.code === 'E601');

// Fresh generated programs, not fixture names, exercise arbitrary literals,
// identifiers, numeric operators, notes, blocks and errors. The C++ probe is
// optional for npm-only users but mandatory in `make test`.
let seed = 0x1468abcd;
function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
const cases = [
  '', 'say "hello"', 'note [don\'t use # or // here]\nsay 3',
  'add library "Python"\nrun the python code:\n  print("# a Python comment")\nsay 5',
  'if 1 is 1 then say "yes"\notherwise say "no"',
  'say "unterminated', "let '' be 1", 'say 1 // no', 'note [unterminated',
  "add library \"Draw\"\ndefine 'cursor 13' as drawing sprite\n'cursor 13' move left \"12\""
];
for (let i = 0; i < 128; i++) {
  const a = random() % 100000, b = random() % 99999 + 1, n = random() % 1000000;
  const op = ['plus', 'minus', 'times', 'divided by', 'modulo'][random() % 5];
  const spaces = ' '.repeat(random() % 4 + 1);
  cases.push(`note [case ${n}: don't confuse # or //]\nlet 'v_${n}' be ${a}\nsay${spaces}'v_${n}' ${op} ${b}\nsay "run-${random()}-Ω"`);
}
function actual(program) {
  try { return { ok: true, tokens: lexer.tokenize(program) }; }
  catch (e) { return { ok: false, error: { code: e.code, message: e.reason, line: e.line, column: e.col } }; }
}
const probeIndex = process.argv.indexOf('--probe');
if (probeIndex >= 0) {
  const probe = process.argv[probeIndex + 1];
  assert.ok(probe, '--probe needs the compiled C++ lexer test executable');
  for (const program of cases) {
    const native = spawnSync(probe, [], { input: program, encoding: 'utf8' });
    assert.equal(native.status, 0, native.stderr);
    assert.deepEqual(actual(program), JSON.parse(native.stdout), 'C++/WebAssembly lexer mismatch for: ' + program);
  }
  console.log(`Native C++ and browser WebAssembly tokenization match for ${cases.length} programs.`);
} else {
  for (const program of cases) actual(program);
  console.log(`C++ WebAssembly lexer checks passed for ${cases.length} programs (run make test for native comparison).`);
}
