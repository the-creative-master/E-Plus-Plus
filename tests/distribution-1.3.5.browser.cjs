// Run after make zip: EPP_BROWSER=/path/to/chromium npm run test:distribution:browser
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const browserPath = [process.env.EPP_BROWSER, process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(file => file && fs.existsSync(file));
if (!browserPath) throw new Error('Set EPP_BROWSER to a Chromium or Chrome executable.');
(async () => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'epp-zip-browser-'));
  execFileSync('unzip', ['-q', path.join(root, 'E++.zip'), '-d', temp]);
  const { GalleryStore, createServer } = require(path.join(temp, 'server.js'));
  const store = await new GalleryStore(path.join(temp, 'private-data', 'shared.js')).init();
  const server = createServer(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: browserPath, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelector('#zipRuntimeBadge').textContent.includes('C++ lexer ready'));
    assert(await page.evaluate(() => window.EPP_DISTRIBUTION));
    assert.equal(await page.locator('[data-library="Colors"], #drawCanvas').count(), 0);
    assert.equal(await page.evaluate(() => availableDefaultFiles().some(file => /add\s+(?:the\s+)?"Colors"\s+library/i.test(file.content))), false);
    assert(await page.evaluate(() => availableDefaultFiles().some(file => file.name === 'release_showcase.enppl')));
    async function run(source) {
      await page.locator('#editor').fill(source);
      await page.locator('#btnRun').click();
      await page.waitForFunction(() => document.querySelector('#btnStop').disabled);
      return page.locator('#consoleOutput').innerText();
    }
    for (const name of ['Colors', 'colours', 'Draw', 'Game']) assert((await run(`add library "${name}"`)).includes('E302'), name);
    assert((await run('say red "not supported"')).includes('E302'));
    assert((await run('say hello')).includes('E402'));
    assert((await run('add library "Math"\nsay the square root of 144')).split('\n').includes('12'));
    await page.locator('#btnGallery').click();
    await page.waitForFunction(() => document.querySelector('#galleryStatus').textContent.includes('available'));
    await page.locator('#galleryClose').click();
    await page.locator('#btnWiki').click();
    assert.equal(await page.locator('h1').innerText(), 'E++ 1.3.5 Wiki');
    await page.locator('.wiki-header .back').click();
    assert.equal(await page.locator('#editor').inputValue(), 'add library "Math"\nsay the square root of 144');
    assert.deepEqual(errors, []);
    await page.close();

    const offline = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await offline.goto(pathToFileURL(path.join(temp, 'index.html')).href);
    await offline.waitForFunction(() => document.querySelector('#zipRuntimeBadge').textContent.includes('C++ lexer ready'));
    await offline.locator('#editor').fill('say 4123 plus 719');
    await offline.locator('#btnRun').click();
    await offline.waitForFunction(() => document.querySelector('#btnStop').disabled);
    assert((await offline.locator('#consoleOutput').innerText()).split('\n').includes('4842'));
    await offline.locator('#btnGallery').click();
    await offline.waitForFunction(() => document.querySelector('#galleryStatus').textContent.includes('needs a running E++ server'));
    await offline.locator('#galleryClose').click();
    await offline.locator('#btnWiki').click();
    assert.equal(await offline.locator('h1').innerText(), 'E++ 1.3.5 Wiki', 'the extracted wiki opens from file://');
    await offline.locator('.wiki-header .back').click();
    assert.equal(await offline.locator('#editor').inputValue(), 'say 4123 plus 719', 'offline wiki navigation keeps the editor draft');
    await offline.close();

    // The legacy one-file export is explicitly a pure-code subset and remains
    // independent of CDNs. Even it refuses unquoted words and all libraries.
    const { generateStandaloneHtml } = require(path.join(temp, 'js', 'standalone-generator.js'));
    const legacyPath = path.join(temp, 'legacy.html');
    await fsp.writeFile(legacyPath, generateStandaloneHtml('say 7 plus 3'));
    const legacy = await browser.newPage();
    const outside = [];
    legacy.on('request', request => { if (/^https?:/.test(request.url())) outside.push(request.url()); });
    await legacy.goto(pathToFileURL(legacyPath).href);
    await legacy.locator('#btnRun').click();
    await legacy.waitForFunction(() => document.querySelector('#btnStop').disabled);
    assert((await legacy.locator('#consoleOut').innerText()).split('\n').includes('10'));
    await legacy.locator('#editor').fill('say hello');
    await legacy.locator('#btnRun').click();
    await legacy.waitForFunction(() => document.querySelector('#btnStop').disabled);
    assert((await legacy.locator('#consoleOut').innerText()).includes('Unquoted text'));
    await legacy.locator('#editor').fill('add library "Colors"');
    await legacy.locator('#btnRun').click();
    await legacy.waitForFunction(() => document.querySelector('#btnStop').disabled);
    assert((await legacy.locator('#consoleOut').innerText()).includes('does not support libraries'));
    assert.deepEqual(outside, []);
    await legacy.close();
    console.log('Extracted E++.zip browser and legacy export: offline lexer, strict errors, Colors/Draw/Game exclusion and gallery status passed.');
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fsp.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
