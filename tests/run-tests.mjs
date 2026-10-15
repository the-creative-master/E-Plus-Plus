/**
 * Headless test-suite for the E++ language core.
 * Loads the exact same browser scripts the IDE uses (in index.html order)
 * into a VM context, then exercises lexer -> parser -> AST -> interpreter,
 * the library system and the .eppl file store.
 *
 * Run: npm test   (or: node tests/run-tests.mjs)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ console, setTimeout, clearTimeout, Promise, Math, JSON, Date, Map, Set, Error, Number, String, Array, Object, RegExp, Blob: undefined });
context.window = undefined; // language core falls back to globalThis in the VM

for (const file of ['errors.js', 'lexer.js', 'ast.js', 'libraries.js', 'parser.js', 'interpreter.js', 'files.js', 'highlight.js']) {
  vm.runInContext(readFileSync(join(root, 'js', file), 'utf8'), context, { filename: file });
}
const EPP = context.EPP;
assert.ok(EPP && EPP.Lexer && EPP.Parser && EPP.Interpreter, 'E++ core loaded');

let passed = 0;
function ok(name) { passed += 1; console.log('  ✓ ' + name); }

async function run(source, options = {}) {
  const output = [];
  const answers = [...(options.answers || [])];
  const interpreter = await EPP.run(source, {
    output: (t) => output.push(t),
    input: async () => answers.shift() ?? '',
    delay: async () => {},
  });
  return { output, interpreter };
}

async function expectError(name, source, pattern, options) {
  try {
    await run(source, options);
  } catch (e) {
    assert.match(e.format ? e.format() : e.message, pattern, name);
    ok(name + '  ->  ' + (e.format ? e.format().split('\n')[0] : e.message));
    return;
  }
  assert.fail(name + ': expected an error but the program ran');
}

console.log('Lexer');
{
  const tokens = EPP.Lexer.tokenize('Define name as Adonis.\nsay \'name\'');
  const types = tokens.map((t) => t.type);
  assert.ok(types.includes('STRING') === false);
  assert.ok(types.includes('VARIABLE'));
  assert.ok(types.includes('PERIOD'));
  assert.ok(types.includes('NEWLINE'));
  ok('tokenizes strings, variables, periods and newlines');
  assert.throws(() => EPP.Lexer.tokenize('say "unterminated'), /never ends/);
  ok('unterminated string is a LexError');
}

console.log('Parser / AST');
{
  const ast = EPP.Parser.parse('Define x as 1 plus 2.');
  assert.equal(ast.type, 'Program');
  assert.equal(ast.body[0].type, 'Define');
  assert.equal(ast.body[0].value.type, 'Binary');
  ok('builds AST nodes for Define + maths');
}

console.log('Interpreter: basics from the spec');
{
  const { output } = await run('Define name as Adonis.\nsay "Hello " plus \'name\' plus "!"');
  assert.deepEqual([...output], ['Hello Adonis!']);
  ok('Define, bare-word values and say with plus concatenation');
}
{
  const { output } = await run('say 1 plus 1\nsay "1 plus 1"');
  assert.deepEqual([...output], ['2', '1 plus 1']);
  ok('bare maths evaluates, quoted text stays literal');
}
{
  const { output } = await run('ask "What is your name?" and save answer as name\nsay "Hi " plus \'name\'', { answers: ['Sam'] });
  assert.deepEqual([...output], ['Hi Sam']);
  ok('ask ... and save answer as ...');
}
{
  const right = await run('ask "5 plus 6?" and save answer as output\nif output is equal to 11 then say "Correct!" otherwise say "Wrong!"', { answers: ['11'] });
  const wrong = await run('ask "5 plus 6?" and save answer as output\nif output is equal to 11 then say "Correct!" otherwise say "Wrong!"', { answers: ['9'] });
  assert.deepEqual([...right.output], ['Correct!']);
  assert.deepEqual([...wrong.output], ['Wrong!']);
  ok('if ... is equal to ... then ... otherwise ... (typed numbers compare as numbers)');
}
{
  const { output } = await run('Define count as 3.\nrepeat 3 times\n  say \'count\'\n  Set count to \'count\' minus 1.\nend repeat\nsay "Blast off!"');
  assert.deepEqual([...output], ['3', '2', '1', 'Blast off!']);
  ok('repeat/end repeat, Set, block if support');
}
{
  const { output } = await run('Define n as 0.\nwhile \'n\' is less than 3 do\n  Set n to \'n\' plus 1.\nend while\nsay \'n\'');
  assert.deepEqual([...output], ['3']);
  ok('while loops with is less than');
}
{
  const { output } = await run('if 2 is greater than 1 then\n  say "big"\notherwise say "small"\nend if');
  assert.deepEqual([...output], ['big']);
  ok('block if with an inline otherwise still closes with end if');
}

console.log('Interpreter: maths precedence & strings');
{
  const { output } = await run('say 2 plus 3 times 4\nsay (2 plus 3) times 4\nsay 10 minus 4 minus 3');
  assert.deepEqual([...output], ['14', '20', '3']);
  ok('precedence: times before plus, parentheses, left associativity');
}

console.log('Libraries');
{
  const { output, interpreter } = await run(
    'library "Math" add\n' +
    'display 1 divided by 2 as fraction\n' +
    'display 1 divided by 2 as decimal\n' +
    'display 1 divided by 3 as fraction\n' +
    'say 50 percent of 200\n' +
    'say square root of 16\n' +
    'say 2 power of 3'
  );
  assert.deepEqual([...output], ['1/2', '0.5', '1/3', '100', '4', '8']);
  assert.ok(interpreter.loadedLibraries.has('Math'));
  ok('Math library: divided by, as fraction/decimal, percent of, square root of, power of');
}
await expectError('using Math features without the library is a LibraryError', 'say square root of 16', /Math library/);
await expectError('divided by is gated by the Math library too', 'say 1 divided by 2', /Math library/);
await expectError('unknown libraries are rejected', 'library "Everything" add', /no library called/);
{
  const { output } = await run('library "Text" add\nsay uppercase of "hello"\nsay length of "hello"');
  assert.deepEqual([...output], ['HELLO', '5']);
  ok('Text library unlocks its functions only after being added');
}
await expectError('Text functions without Text library fail', 'say uppercase of "hello"', /Text library/);

console.log('Errors');
await expectError('undefined variable is a RuntimeError with a hint', 'say \'missing\'', /has not been defined/);
await expectError('division by zero is reported', 'library "Math" add\nsay 1 divided by 0 as decimal', /Division by zero/);
await expectError('unterminated if block is a ParseError', 'if 1 is equal to 1 then\n  say "x"', /never ends/);
await expectError('nonsense statements are ParseErrors', 'frobnicate the wizzle', /do not understand/);

console.log('.eppl file system');
{
  const store = new EPP.EpplFileStore(new EPP.MemoryStorage());
  assert.equal(EPP.isEpplFile('a.eppl'), true);
  assert.equal(EPP.isEpplFile('a.txt'), false);
  assert.equal(EPP.validateEpplFileName('quiz'), 'quiz.eppl');
  assert.throws(() => EPP.validateEpplFileName('quiz.txt'), /only works with .eppl/);
  store.createFile('demo', 'say "hi"');
  assert.equal(store.getFile('demo.eppl').content, 'say "hi"');
  store.saveFile('demo.eppl', 'say "bye"');
  assert.equal(store.getFile('demo.eppl').content, 'say "bye"');
  store.renameFile('demo.eppl', 'renamed');
  assert.ok(store.exists('renamed.eppl'));
  assert.throws(() => store.importText('evil.js', 'alert(1)'), /only opens .eppl/);
  assert.equal(store.importText('ok.eppl', 'say 1').name, 'ok.eppl');
  store.deleteFile('renamed.eppl');
  assert.equal(store.exists('renamed.eppl'), false);
  ok('create/save/rename/delete + .eppl-only validation');
}

console.log('Syntax highlighting');
{
  const html = EPP.highlight('say "Hello" plus \'name\'');
  assert.match(html, /tok-keyword/);
  assert.match(html, /tok-string/);
  assert.match(html, /tok-variable/);
  assert.match(html, /tok-operator/);
  ok('lexer-driven highlighting emits token classes');
}

console.log('\nAll ' + passed + ' E++ test groups passed.');
