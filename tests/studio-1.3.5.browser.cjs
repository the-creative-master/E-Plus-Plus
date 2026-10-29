// Optional browser regression: EPP_BROWSER=/path/to/chromium npm run test:studio
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const { GalleryStore, createServer } = require('../server.js');
const candidates = [process.env.EPP_BROWSER, process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
const browserPath = candidates.find(file => file && fs.existsSync(file));
if (!browserPath) throw new Error('Set EPP_BROWSER to a Chromium or Chrome executable.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'epp-browser-135-'));
  const storePath = path.join(temp, 'shared.js');
  let store = await new GalleryStore(storePath).init();
  let server = createServer(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: browserPath, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const a = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const b = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await a.newPage();
    const visitor = await b.newPage();
    page.on('pageerror', error => errors.push('publisher: ' + error));
    visitor.on('pageerror', error => errors.push('visitor: ' + error));
    await Promise.all([page.goto(base), visitor.goto(base)]);
    await Promise.all([page.waitForFunction(() => document.querySelector('#zipRuntimeBadge').textContent.includes('C++ lexer ready')),
      visitor.waitForFunction(() => document.querySelector('#zipRuntimeBadge').textContent.includes('C++ lexer ready'))]);
    async function run(p, source, timeout = 10000) {
      await p.locator('#editor').fill(source);
      await p.locator('#btnRun').click();
      await p.waitForFunction(() => document.querySelector('#btnStop').disabled, null, { timeout });
      return p.locator('#consoleOutput').innerText();
    }

    // Starter SVGs are truly decoded, not merely nonempty strings, with no
    // off-site requests; also verify actual actor pixels on the game canvas.
    let imageRequests = [];
    page.on('request', request => { if (request.resourceType() === 'image' && !request.url().startsWith('data:')) imageRequests.push(request.url()); });
    await page.evaluate(() => loadFile('game_showcase.enppl'));
    await page.locator('#btnImage').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.pic-thumb')].length === 2 && [...document.querySelectorAll('.pic-thumb')].every(i => i.naturalWidth === 64));
    const thumbs = await page.evaluate(() => [...document.querySelectorAll('.pic-thumb')].map(img => {
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      return [...ctx.getImageData(32, 32, 1, 1).data];
    }));
    assert(thumbs.every(pixel => pixel[3] > 0), 'starter thumbnails contain visible pixels');
    assert.deepEqual(imageRequests, []);
    await page.locator('#picClose').click();
    assert((await run(page, 'add library "Game"\nset the game window to 400 by 300\ncreate the actor \'hero\'\nput the actor \'hero\' at 0 and 0\nsay "starter ready"')).includes('starter ready'));
    const heroPixel = await page.evaluate(() => [...document.querySelector('#gameCanvas').getContext('2d').getImageData(200, 150, 1, 1).data]);
    assert(heroPixel[0] > 30 && heroPixel[1] > 130 && heroPixel[2] > 180, 'the starter actor paints its blue pixels offline: ' + heroPixel);
    await page.locator('#btnImage').click();

    // A real transparent PNG with an empty OS MIME type must remain PNG and
    // transparent. A corrupt PNG is refused rather than silently linkable.
    const upload = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
      const context = canvas.getContext('2d'); context.fillStyle = '#ff0000'; context.fillRect(0, 0, 12, 24);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#picName').fill('hero');
    await page.locator('#imageFileInput').setInputFiles({ name: 'art.png', mimeType: 'image/png', buffer: Buffer.from(upload, 'base64') });
    await page.waitForFunction(() => document.querySelector('#picPreview img') && document.querySelector('#picPreview img').naturalWidth === 24);
    assert.equal(await page.locator('#picName').inputValue(), 'hero', 'upload does not silently rename an actor');
    await page.locator('#picName').fill('tester');
    await page.locator('#picLink').click();
    const program = 'add library "Game"\nset the game window to 400 by 300\ncreate the actor \'tester\'\nput the actor \'tester\' at 0 and 0\nsay "image ready"';
    assert((await run(page, program)).includes('image ready'));
    const pixel = await page.evaluate(() => [...document.querySelector('#gameCanvas').getContext('2d').getImageData(195, 150, 1, 1).data]);
    assert(pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60, 'the canvas paints uploaded red image pixels: ' + pixel);

    await page.locator('#btnImage').click();
    const emptyMime = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      c.getContext('2d').fillRect(0, 0, 8, 8);
      const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
      await pickPictureFile(new File([blob], 'transparent.png', { type: '' }));
      const image = await decodePicture(pictureDraft.data);
      const d = document.createElement('canvas'); d.width = d.height = 16; d.getContext('2d').drawImage(image, 0, 0);
      return { prefix: pictureDraft.data.slice(0, 22), alpha: d.getContext('2d').getImageData(15, 15, 1, 1).data[3] };
    });
    assert.equal(emptyMime.prefix, 'data:image/png;base64,');
    assert.equal(emptyMime.alpha, 0);
    await page.locator('#imageFileInput').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3]) });
    await page.waitForFunction(() => document.querySelector('#picNote').textContent.includes('could not decode'));
    assert(await page.locator('#picLink').isDisabled());
    const dropBubbled = await page.evaluate(async (base64) => {
      let seen = 0;
      const watch = () => seen++;
      window.addEventListener('drop', watch);
      const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([data], 'dropped.png', { type: 'image/png' }));
      document.querySelector('.pic-right').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
      await new Promise(resolve => setTimeout(resolve, 80));
      window.removeEventListener('drop', watch);
      return seen;
    }, upload);
    assert.equal(dropBubbled, 0, 'dropping in the image panel does not also import the image as a project');
    const quotaRollback = await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'epp_pictures_v1') throw new Error('quota'); return original.call(this, key, value); };
      try { return !linkPicture('quota', pictureForName('tester').data) && !pictureForName('quota'); }
      finally { Storage.prototype.setItem = original; }
    });
    assert(quotaRollback, 'an unsaved picture is not falsely reported as linked');
    await page.evaluate(() => { linkPicture('bad', 'data:image/png;base64,AQID'); refreshPicturePanel(); });
    await page.waitForFunction(() => [...document.querySelectorAll('.pic-item-meta')].some(el => el.textContent.includes('Could not load')));
    await page.locator('#picClose').click();
    assert((await run(page, 'add library "Game"\ncreate the actor \'bad\'')).includes('could not load yet'));
    // Do not include the deliberately broken test asset in the shared project.
    await page.evaluate(() => unlinkPicture('bad'));
    assert((await run(page, program)).includes('image ready'));

    // Publish a project with a picture from one isolated browser, receive and
    // run its copy in another. Treat untrusted gallery text as text, not HTML.
    await page.locator('#btnGallery').click();
    await page.locator('#galleryTitle').fill('<img src=x onerror=alert(1)>');
    await page.locator('#galleryAuthor').fill('Ada');
    await page.locator('#galleryDescription').fill('A public image project');
    await page.locator('#galleryPublish').click();
    await page.waitForFunction(() => document.querySelectorAll('.gallery-card').length === 1);
    assert.equal(await page.locator('.gallery-card img').count(), 0, 'gallery metadata cannot inject markup');
    const priorName = await visitor.evaluate(() => currentFileName);
    await visitor.locator('#editor').fill('say "Keep my draft"');
    await visitor.locator('#btnGallery').click();
    await visitor.waitForFunction(() => document.querySelectorAll('.gallery-card').length === 1);
    assert.equal(await visitor.locator('.gallery-card-title').innerText(), '<img src=x onerror=alert(1)>');
    await visitor.locator('.gallery-card button').click();
    await visitor.waitForFunction(() => document.querySelector('#galleryOverlay').style.display === 'none');
    assert.equal(await visitor.locator('#editor').inputValue(), program);
    assert.equal(await visitor.evaluate(name => files[name], priorName), 'say "Keep my draft"', 'opening a shared copy preserves the current file');
    assert.equal(await visitor.evaluate(() => !!pictureForName('tester')), true);
    assert(!(await visitor.locator('#consoleOutput').innerText()).includes('image ready'), 'opening a gallery copy does not execute it');
    assert((await run(visitor, program)).includes('image ready'));
    const sharedPixel = await visitor.evaluate(() => [...document.querySelector('#gameCanvas').getContext('2d').getImageData(195, 150, 1, 1).data]);
    assert(sharedPixel[0] > 200 && sharedPixel[1] < 60, 'the shared picture renders in a different browser');
    await b.clearCookies();
    await visitor.evaluate(() => localStorage.clear());
    await visitor.reload();
    await visitor.locator('#btnGallery').click();
    await visitor.waitForFunction(() => document.querySelectorAll('.gallery-card').length === 1);
    assert.equal(await visitor.evaluate(() => Object.keys(localStorage).some(key => /gallery|shared/i.test(key))), false, 'gallery has no localStorage cache');

    // Restart using the same on-disk shared.js; a new independent context sees it.
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    store = await new GalleryStore(storePath).init();
    server = createServer(store);
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    const fresh = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    fresh.on('pageerror', error => errors.push('fresh: ' + error));
    await fresh.goto(base);
    await fresh.locator('#btnGallery').click();
    await fresh.waitForFunction(() => document.querySelectorAll('.gallery-card').length === 1);
    await fresh.close();

    // Animated movements have intermediate frames, can be steered manually,
    // and respond to speed changes and Stop while the program is still running.
    await page.locator('#galleryClose').click();
    const animation = 'add library "Draw"\ndefine \'pencil\' as drawing sprite\nset the speed of \'pencil\' to 120\n\'pencil\' move right "120"\nsay "finished animation"';
    await page.locator('#editor').fill(animation);
    await page.locator('#btnRun').click();
    await page.waitForFunction(() => { const h = EPPStudioState().drawHost; const s = h && h.get('pencil'); return s && s.x > 8 && s.x < 100; });
    await page.locator('[data-draw-move="down"]').click();
    await page.locator('#drawSpeed').selectOption('600');
    await page.waitForFunction(() => document.querySelector('#btnStop').disabled);
    assert.deepEqual(await page.evaluate(() => { const s = EPPStudioState().drawHost.get('pencil'); return [s.x, s.y, s.speed]; }), [120, 10, 600]);
    assert((await page.locator('#consoleOutput').innerText()).includes('finished animation'));
    const longMove = 'add library "Draw"\ndefine \'slow\' as drawing sprite\nset the speed of \'slow\' to 60\n\'slow\' move right "600"\nsay "should not run"';
    await page.locator('#editor').fill(longMove);
    await page.locator('#btnRun').click();
    await page.waitForFunction(() => { const h = EPPStudioState().drawHost; return h && h.get('slow') && h.get('slow').x > 1; });
    const stopTime = Date.now();
    await page.locator('#btnStop').click();
    await page.waitForFunction(() => document.querySelector('#btnStop').disabled);
    assert(Date.now() - stopTime < 500, 'Stop interrupts movement promptly');
    const stoppedAt = await page.evaluate(() => EPPStudioState().drawHost.get('slow').x);
    await sleep(100);
    assert.equal(await page.evaluate(() => EPPStudioState().drawHost.get('slow').x), stoppedAt);
    assert(stoppedAt < 600 && !(await page.locator('#consoleOutput').innerText()).includes('should not run'));
    const instantStart = Date.now();
    assert((await run(page, 'add library "Draw"\ndefine \'p\' as drawing sprite\nset the speed of \'p\' to instant\n\'p\' move right "10000"\nsay "instant"')).includes('instant'));
    assert(Date.now() - instantStart < 1000);
    assert.equal(await page.evaluate(() => EPPStudioState().drawHost.get('p').x), 10000);
    assert((await run(page, 'add library "Draw"\ndefine \'p\' as drawing sprite\nset the speed of \'p\' to 0')).includes('E407'));
    assert((await run(page, 'say hello')).includes('E402'));
    assert((await run(page, 'add library "Colors"\nsay red "Studio color"')).includes('Studio color'));
    assert.equal(await page.locator('#consoleOutput .color-red').count(), 1, 'full Studio retains Colors');

    // The gallery fits a small screen and follows the existing modal focus rules.
    const mobile = await browser.newPage({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', error => errors.push('mobile: ' + error));
    await mobile.goto(base);
    await mobile.locator('#btnTools').click();
    await mobile.locator('#btnGallery').click();
    await mobile.waitForFunction(() => document.querySelectorAll('.gallery-card').length === 1);
    const mobileSize = await mobile.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, modal: document.querySelector('.gallery-shell').getBoundingClientRect().width }));
    assert(mobileSize.scroll <= mobileSize.width && mobileSize.modal <= mobileSize.width);
    await mobile.locator('#galleryBrowseJump').click();
    assert.equal(await mobile.evaluate(() => document.activeElement.id), 'galleryBrowseHeading');
    assert((await mobile.locator('.gallery-body').evaluate(el => el.scrollTop)) > 0, 'mobile visitors can jump to the community list');
    await mobile.keyboard.press('Escape');
    assert.equal(await mobile.locator('#galleryOverlay').isVisible(), false);
    await mobile.locator('#btnTools').click();
    await mobile.locator('#btnWiki').click();
    assert(await mobile.locator('#drawing-with-animated-sprites').count(), 'the Wiki action opens the guide on mobile');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await mobile.locator('.wiki-header .back').click();
    assert(await mobile.locator('#editor').count(), 'return from the wiki opens Studio');
    await mobile.close();

    const laptop = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await laptop.goto(base); await laptop.waitForFunction(() => document.querySelector('#zipRuntimeBadge').textContent.includes('ready'));
    await run(laptop, 'add library "Draw"\ndefine \'p\' as drawing sprite\nset the speed of \'p\' to instant\n\'p\' move right "10"');
    const clipped = await laptop.evaluate(() => {
      const pane = document.querySelector('.draw-pane').getBoundingClientRect();
      return [...document.querySelectorAll('.draw-controls select, .draw-arrows button')].some(el => {
        const r = el.getBoundingClientRect();
        return r.left < pane.left || r.right > pane.right || r.right > innerWidth;
      });
    });
    assert.equal(clipped, false, 'Draw speed and arrow controls fit in the laptop console pane');
    await laptop.close();

    // A preview iframe does not grant allow-popups. Wiki must navigate inside
    // it, return to the same project, and flush an in-flight autosave.
    const preview = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let popups = 0;
    preview.on('popup', () => popups++);
    await preview.goto(base + '/wiki.html');
    await preview.evaluate(() => {
      document.body.replaceChildren();
      const iframe = document.createElement('iframe');
      iframe.id = 'sandboxedPreview';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.src = '/';
      iframe.style.cssText = 'width: 100%; height: 850px; border: 0';
      document.body.appendChild(iframe);
    });
    const embedded = preview.frameLocator('#sandboxedPreview');
    await embedded.locator('#zipRuntimeBadge').waitFor();
    await embedded.locator('body').evaluate(async () => loadFile('welcome_1_3_5.enpp'));
    const draft = 'say "Keep this draft when I read the wiki"';
    await embedded.locator('#editor').fill(draft);
    await embedded.locator('#btnWiki').click();
    assert.equal(await embedded.locator('h1').innerText(), 'E++ 1.3.5 Wiki');
    await embedded.locator('a[href="#drawing-with-animated-sprites"]').click();
    assert.equal(await embedded.locator('body').evaluate(() => location.hash), '#drawing-with-animated-sprites', 'wiki navigation links work in the preview');
    await embedded.locator('.wiki-header .back').click();
    assert.equal(await embedded.locator('#currentFileName').innerText(), 'welcome_1_3_5.enpp');
    assert.equal(await embedded.locator('#editor').inputValue(), draft);
    assert.equal(popups, 0, 'Wiki does not require a popup');

    const immediateDraft = 'say "Save before the debounce timer"';
    await embedded.locator('#editor').evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btnWiki').click();
    }, immediateDraft);
    assert.equal(await embedded.locator('h1').innerText(), 'E++ 1.3.5 Wiki');
    await embedded.locator('.wiki-header .back').click();
    assert.equal(await embedded.locator('#currentFileName').innerText(), 'welcome_1_3_5.enpp');
    assert.equal(await embedded.locator('#editor').inputValue(), immediateDraft, 'pending edits survive a Wiki round trip');
    await preview.close();

    // Every runnable tutorial block in the README and wiki must stay valid.
    const docs = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await docs.goto(base);
    await docs.waitForFunction(() => document.querySelector('#zipRuntimeBadge').textContent.includes('ready'));
    for (const name of ['README.md', 'WIKI.md']) {
      const markdown = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
      const examples = [...markdown.matchAll(/```text\n([\s\S]*?)```/g)];
      assert(examples.length, name + ' contains tutorials');
      for (const [index, match] of examples.entries()) {
        const code = match[1];
        await docs.locator('#editor').fill(code);
        await docs.locator('#btnRun').click();
        if (code.includes('ask ')) {
          await docs.locator('#consoleInput').waitFor({ state: 'visible' });
          await docs.locator('#consoleInput').fill('Ada');
          await docs.locator('#consoleInput').press('Enter');
        }
        await docs.waitForFunction(() => document.querySelector('#btnStop').disabled, null, { timeout: 20000 });
        const output = await docs.locator('#consoleOutput').innerText();
        assert(!/\[E\d{3}\]/.test(output), `${name} example ${index + 1} failed: ${output}`);
        assert(output.includes('Finished successfully'), `${name} example ${index + 1} did not finish`);
      }
    }
    await docs.close();
    assert.deepEqual(errors, []);
    await a.close(); await b.close();
    console.log('E++ 1.3.5 browser: decoded images, real pixels, cross-browser gallery, persistence, animation, Stop, Colors and mobile checks passed.');
  } finally {
    await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await fsp.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
