/* Public, server-backed E++ gallery. No project data is cached in the browser. */
(function (global) {
  'use strict';
  var EPP = global.EPP || (global.EPP = {});

  function wireGallery(options) {
    var overlay = document.getElementById('galleryOverlay');
    var button = document.getElementById('btnGallery');
    if (!overlay || !button) return;
    var list = document.getElementById('galleryList');
    var status = document.getElementById('galleryStatus');
    var title = document.getElementById('galleryTitle');
    var author = document.getElementById('galleryAuthor');
    var description = document.getElementById('galleryDescription');
    var publish = document.getElementById('galleryPublish');
    var refresh = document.getElementById('galleryRefresh');
    var sequence = 0;

    function message(text, error) {
      status.textContent = text;
      status.classList.toggle('is-error', !!error);
    }
    async function request(url, init) {
      if (global.location.protocol === 'file:') throw new Error('The gallery needs a running E++ server. Run npm start, then open the Studio from that server.');
      var response;
      try { response = await global.fetch(url, Object.assign({ cache: 'no-store' }, init || {})); }
      catch (error) { throw new Error('Cannot reach the gallery server. Run npm start or use a deployed E++ Studio.'); }
      var body;
      try { body = await response.json(); }
      catch (error) { throw new Error('This site does not provide the gallery API. Run npm start or use a deployed E++ Studio.'); }
      if (!response.ok) throw new Error(body.error || 'The gallery request failed.');
      return body;
    }
    function addText(parent, tag, className, text) {
      var element = document.createElement(tag);
      element.className = className;
      element.textContent = text;
      parent.appendChild(element);
      return element;
    }
    async function openCopy(id, control) {
      control.disabled = true;
      message('Opening a copy…');
      try {
        var result = await request('/api/gallery/' + encodeURIComponent(id));
        if (!result.project || typeof result.project.code !== 'string') throw new Error('That project is not available.');
        await options.openProject(result.project);
        options.close(overlay);
        options.notify('Opened a new copy of the shared project.');
      } catch (error) { message(error.message, true); }
      finally { control.disabled = false; }
    }
    function render(projects) {
      list.replaceChildren();
      if (!projects.length) {
        addText(list, 'p', 'gallery-empty', 'No projects here yet. Publish the first one!');
        return;
      }
      projects.forEach(function (project) {
        var card = document.createElement('article');
        card.className = 'gallery-card';
        var heading = addText(card, 'h4', 'gallery-card-title', project.title);
        heading.title = project.title;
        addText(card, 'p', 'gallery-card-meta', 'By ' + project.author + ' · ' + String(project.createdAt || '').slice(0, 10));
        if (project.description) addText(card, 'p', 'gallery-card-description', project.description);
        var control = addText(card, 'button', 'btn btn-small', 'Open a copy');
        control.type = 'button';
        control.addEventListener('click', function () { openCopy(project.id, control); });
        list.appendChild(card);
      });
    }
    async function load() {
      var current = ++sequence;
      refresh.disabled = true;
      list.setAttribute('aria-busy', 'true');
      message('Loading community projects…');
      try {
        var result = await request('/api/gallery');
        if (current !== sequence) return;
        if (!Array.isArray(result.projects)) throw new Error('The gallery server sent an invalid response.');
        render(result.projects);
        message(result.projects.length + (result.projects.length === 1 ? ' project' : ' projects') + ' available on this server.');
      } catch (error) {
        if (current !== sequence) return;
        list.replaceChildren();
        message(error.message, true);
      } finally {
        if (current === sequence) { refresh.disabled = false; list.removeAttribute('aria-busy'); }
      }
    }
    function close() { sequence++; refresh.disabled = false; options.close(overlay); }
    button.addEventListener('click', function () {
      if (!title.value.trim()) title.value = options.project().filename.replace(/\.(?:enpp|enppl)$/i, '').replace(/[_-]+/g, ' ');
      options.open(overlay, document.getElementById('galleryClose'));
      load();
    });
    document.getElementById('galleryClose').addEventListener('click', close);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && overlay.style.display !== 'none' && options.isTop(overlay)) { event.preventDefault(); close(); }
    });
    refresh.addEventListener('click', load);
    document.getElementById('galleryBrowseJump').addEventListener('click', function () {
      var heading = document.getElementById('galleryBrowseHeading');
      heading.scrollIntoView({ block: 'start' });
      heading.focus({ preventScroll: true });
    });
    document.getElementById('galleryForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      if (publish.disabled) return;
      var project = options.project();
      publish.disabled = true;
      message('Publishing this project…');
      try {
        await request('/api/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          title: title.value, author: author.value, description: description.value,
          code: project.code, pictures: project.pictures
        }) });
        options.notify('Published to the community gallery.');
        description.value = '';
        await load();
      } catch (error) { message(error.message, true); }
      finally { publish.disabled = false; }
    });
  }
  EPP.wireGallery = wireGallery;
})(typeof window !== 'undefined' ? window : globalThis);
