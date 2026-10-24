/*
 * E++ community ideas.
 *
 * "Suggest a feature" is not a private inbox: every idea becomes a public
 * issue in the project's GitHub tracker, so anyone can read it, reply to it
 * and vote on it. This module is the shared, testable half of that — the URLs,
 * the idea filter and the shaping of the GitHub payload. The Studio renders
 * the result and keeps the draft in localStorage.
 *
 * Two marks identify an idea, on purpose:
 *
 *   label    `feature-request` — only posters with write access can set it
 *   title    `[Idea] …`        — anyone can set it on a public repo
 *
 * The filter accepts either, so an idea suggested by someone outside the
 * project is never invisible.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  var REPO = { owner: 'the-creative-master', name: 'E-Plus-Plus' };
  var LABEL = 'feature-request';
  var PREFIX = '[Idea]';
  var MAX_TITLE = 110;

  function encode(params) {
    return Object.keys(params)
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); })
      .join('&');
  }

  function repoUrl() {
    return 'https://github.com/' + REPO.owner + '/' + REPO.name;
  }

  /** The public list, filtered to ideas. */
  function issuesUrl() {
    return repoUrl() + '/issues?' + encode({ q: 'is:issue "' + PREFIX + '"' });
  }

  /**
   * The prefilled "new issue" page. The title always carries the `[Idea]`
   * prefix (so the idea is findable even without the label) and the first line
   * of the idea becomes the title, with the whole text as the body.
   */
  function postUrl(text) {
    var idea = String(text == null ? '' : text).trim();
    var firstLine = idea.split('\n')[0].slice(0, MAX_TITLE);
    var title = PREFIX + ' ' + (firstLine || 'what should E++ do?');
    var body = idea
      ? idea + '\n\n---\n*Posted from the E++ Studio 💡 Suggest button.*'
      : '**What should E++ do?**\n\n\n**Why would it help?**\n';
    return repoUrl() + '/issues/new?' + encode({ labels: LABEL, title: title, body: body });
  }

  /** True when an issue is a community idea, however it was posted. */
  function isIdea(issue) {
    if (!issue || issue.pull_request) return false;
    var labels = Object.prototype.toString.call(issue.labels) === '[object Array]' ? issue.labels : [];
    for (var i = 0; i < labels.length; i++) {
      var name = labels[i] && typeof labels[i] === 'object' ? labels[i].name : labels[i];
      if (String(name || '').toLowerCase() === LABEL) return true;
    }
    return String(issue.title || '').trim().toLowerCase().indexOf(PREFIX.toLowerCase()) === 0;
  }

  /** The prefix is a sorting mark, not part of the idea's name. */
  function displayTitle(title) {
    return String(title || '(no title)')
      .replace(/^\s*\[idea\]\s*/i, '')
      .trim() || '(no title)';
  }

  /** One GitHub issue -> the handful of fields the list shows. */
  function shape(issue) {
    var user = issue && issue.user;
    return {
      title: displayTitle(issue && issue.title),
      url: (issue && issue.html_url) || repoUrl() + '/issues',
      state: (issue && issue.state) || 'open',
      comments: (issue && issue.comments) || 0,
      author: (user && user.login) || '',
      date: issue && issue.created_at ? String(issue.created_at).slice(0, 10) : '',
      votes: issue && issue.reactions ? (issue.reactions['+1'] || 0) : 0
    };
  }

  /** GitHub's issue list -> ideas only, newest first as GitHub sends them. */
  function parseIssues(issues) {
    if (Object.prototype.toString.call(issues) !== '[object Array]') return [];
    var ideas = [];
    for (var i = 0; i < issues.length; i++) {
      if (isIdea(issues[i])) ideas.push(shape(issues[i]));
    }
    return ideas;
  }

  function apiUrl() {
    return 'https://api.github.com/repos/' + REPO.owner + '/' + REPO.name +
      '/issues?' + encode({ state: 'all', per_page: 50, sort: 'created', direction: 'desc' });
  }

  /**
   * Reads the public list. No key, no account, no server of our own — which
   * also means it can fail: a preview iframe or an offline browser has no
   * network at all, so the caller gets the error and falls back to its cache.
   */
  async function fetchIdeas(options) {
    var opts = options || {};
    var doFetch = opts.fetch ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (!doFetch) throw new Error('This browser cannot reach GitHub.');

    var response = await doFetch(apiUrl(), { headers: { Accept: 'application/vnd.github+json' } });
    if (!response || !response.ok) {
      throw new Error('GitHub answered with ' + ((response && response.status) || 'no status'));
    }
    return parseIssues(await response.json());
  }

  var CACHE_TTL = 6 * 60 * 60 * 1000;

  /** The last good list, if it is still fresh enough to show. */
  function fromCache(raw, now) {
    if (!raw) return null;
    var parsed;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      return null;
    }
    if (!parsed || Object.prototype.toString.call(parsed.items) !== '[object Array]') return null;
    var at = Number(parsed.at) || 0;
    if (now && at && now - at > CACHE_TTL) return null;
    return parsed.items;
  }

  function toCache(items, now) {
    return JSON.stringify({ at: now || 0, items: items || [] });
  }

  EPP.Ideas = {
    repo: REPO,
    label: LABEL,
    prefix: PREFIX,
    repoUrl: repoUrl,
    issuesUrl: issuesUrl,
    postUrl: postUrl,
    apiUrl: apiUrl,
    isIdea: isIdea,
    displayTitle: displayTitle,
    shape: shape,
    parseIssues: parseIssues,
    fetchIdeas: fetchIdeas,
    fromCache: fromCache,
    toCache: toCache
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Ideas: EPP.Ideas };
  }
})(typeof window !== 'undefined' ? window : globalThis);
