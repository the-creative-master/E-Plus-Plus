// Optional real-browser checks: EPP_BROWSER=/path/to/chromium npm run test:studio
// They run arbitrary programs and prove Studio consumes C++ lexer token values.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const candidates = [process.env.EPP_BROWSER, process.env.CHROME_BIN,
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
const browserPath = candidates.find(file => file && fs.existsSync(file));
if (!browserPath) throw new Error('Set EPP_BROWSER to a Chromium or Chrome executable.');

const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.zip': 'application/zip' };
const server = http.createServer((req, res) => {
  // The lexer is embedded, so running a program must not depend on the ZIP.
  if (req.url === '/epp_language.zip') { res.writeHead(404).end(); return; }
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (_) { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: browserPath, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#zipRuntimeBadge').innerText.includes('C++ lexer ready'));
    await page.evaluate(() => {
      window.__nativeTokenize = EPP.NativeLexer.tokenize;
      window.__lexedPrograms = [];
      EPP.NativeLexer.tokenize = function (source, filename) {
        window.__lexedPrograms.push(source);
        return window.__nativeTokenize(source, filename);
      };
    });
    async function run(program) {
      await page.locator('.mobile-view-btn[data-view="editor"]').click();
      await page.locator('#editor').fill(program);
      await page.locator('#btnRun').click();
      await page.waitForFunction(() => document.querySelector('#btnStop').disabled);
      return page.locator('#consoleOutput').innerText();
    }
    let seed = 0x79a0cb31;
    function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
    for (let i = 0; i < 16; i++) {
      const a = random() % 10000, b = random() % 40 + 1, c = random() % 1000, name = 'v' + random();
      const program = `let '${name}' be ${a}\nsay '${name}' times ${b} plus ${c}`;
      const output = await run(program);
      assert(output.split('\n').includes(String(a * b + c)), output);
      assert(await page.evaluate(source => window.__lexedPrograms.includes(source), program), 'the full source reached the C++ lexer');
    }
    // Change a returned token in the test only. A changed result demonstrates
    // the evaluator consumes lexer data rather than merely calling the lexer.
    await page.evaluate(() => {
      EPP.NativeLexer.tokenize = function (source, filename) {
        const tokens = window.__nativeTokenize(source, filename);
        if (source === '328147 plus 29') tokens[0].value += 100;
        return tokens;
      };
    });
    assert((await run('say 328147 plus 29')).split('\n').includes('328276'));
    await page.evaluate(() => { EPP.NativeLexer.tokenize = window.__nativeTokenize; });
    assert((await run('say 328147 plus 29')).split('\n').includes('328176'));
    assert((await run('say "unfinished')).includes('E102'));
    assert((await run('say hello')).includes('E402'));
    assert((await run('fheneir')).includes('E101'));

    const draw = await run('add library "Draw"\ndefine \'surprise cursor\' as drawing sprite\n\'surprise cursor\' move right "37"\nsay "done"');
    assert(draw.split('\n').includes('done'), draw);
    assert.equal(await page.evaluate(() => EPPStudioState().drawHost.get('surprise cursor').x), 37);

    // Never silently use a JS fallback when the C++ module is unavailable.
    await page.evaluate(() => {
      window.__nativeReady = EPP.NativeLexer.ready;
      EPP.NativeLexer.ready = () => Promise.reject({ code: 'E601', name: 'C++ Lexer Unavailable', filename: 'lexer', line: 1, col: 1, sourceLine: '', reason: 'test unavailable', help: 'restore lexer' });
    });
    const failed = await run('say "must not execute"');
    assert(failed.includes('E601') && !failed.includes('Finished successfully'), failed);
    await page.evaluate(() => { EPP.NativeLexer.ready = window.__nativeReady; });
    assert.deepEqual(errors, []);
    await page.close();

    // Also remove the actual compiled script, rather than only simulating a
    // readiness failure, to verify missing assets cannot trigger a fallback.
    const missing = await browser.newPage();
    await missing.route('**/js/native-lexer-wasm.js', route => route.abort());
    await missing.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
    await missing.waitForFunction(() => document.querySelector('#zipRuntimeBadge').innerText.includes('unavailable'));
    await missing.locator('#editor').fill('say 982731');
    await missing.locator('#btnRun').click();
    await missing.waitForFunction(() => document.querySelector('#btnStop').disabled);
    const missingOutput = await missing.locator('#consoleOutput').innerText();
    assert(missingOutput.includes('E601') && !missingOutput.includes('Finished successfully'), missingOutput);
    await missing.close();

    // `file://` must load the same compiled lexer without fetching a ZIP.
    const offline = await browser.newPage();
    await offline.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
    await offline.waitForFunction(() => document.querySelector('#zipRuntimeBadge').innerText.includes('C++ lexer ready'));
    await offline.locator('#editor').fill('say 4123 plus 719');
    await offline.locator('#btnRun').click();
    await offline.waitForFunction(() => document.querySelector('#btnStop').disabled);
    assert((await offline.locator('#consoleOutput').innerText()).split('\n').includes('4842'));
    await offline.close();
    console.log('Studio executes generated programs using the C++ lexer; offline, failure, and Draw checks passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
