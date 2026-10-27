/*!
 * app.js
 * ---------------------------------------------------------------------------
 * Totally Not A Social Media Site - the front end.
 *
 * No login, no password, no email, no phone number, no verification.
 * Type a username and BOOM.
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var Storage = window.VideoStorage;
  var StreamPlayerCtor = window.StreamPlayer;

  var state = {
    view: "home",
    user: null,
    videoId: null,
    query: "",
    sanitize: false,
    controllers: Object.create(null),
    activeController: null,
    persona: null,
    ready: false
  };

  var dom = {};
  var observer = null;

  /* --------------------------------------------------------------- utils */

  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var paths = {
      play: "M8 5v14l11-7z",
      like: "M2 10h4v11H2zm20 1a2 2 0 0 0-2-2h-6.3l1-4.6V4.2a1.2 1.2 0 0 0-2.2-.7L8 8.4V21h9.6a2 2 0 0 0 1.9-1.4l2.3-6A2 2 0 0 0 21.9 11z",
      dislike: "M22 10h-4V2h4zm-20 3a2 2 0 0 0 2 2h6.3l-1 4.6v.2a1.2 1.2 0 0 0 2.2.7L16 15.6V3H6.4a2 2 0 0 0-1.9 1.4l-2.3 6A2 2 0 0 0 2.1 13z",
      comment: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2z",
      share: "M18 16a3 3 0 0 0-2 .8l-7-4a3 3 0 0 0 0-1.6l7-4A3 3 0 1 0 15 5l-7 4a3 3 0 0 0-2-.8A3 3 0 1 0 6 12a3 3 0 0 0 2-.8l7 4A3 3 0 0 0 15 15a3 3 0 1 0 3 1z",
      trash: "M6 7h12l-1 13H7L6 7zm3-3h6l1 2H8l1-2zM4 5h16v2H4V5z",
      upload: "M12 3l5 5h-3v7h-4V8H7l5-5zM5 18h14v3H5v-3z",
      search: "M10 4a6 6 0 1 0 3.5 10.9l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
      globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.9 9h-3.4a15 15 0 0 0-1.3-5.6A8 8 0 0 1 19.9 11zM12 4c.9 1.4 1.7 3.6 1.9 7h-3.8c.2-3.4.8-5.6 1.9-7zM4.1 13A8 8 0 0 1 12 4c-1.1 1.4-1.7 3.6-1.9 7H4.1zm0 2h3.8c.2 3.4.8 5.6 1.9 7a8 8 0 0 1-5.7-9zm7.9 9c-.9-1.4-1.7-3.6-1.9-7h3.8a8 8 0 0 1-1.9 7zm2.6-9h-3.8c-.2-3.4-.8-5.6-1.9-7a8 8 0 0 1 5.7 9z",
      bolt: "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
      shield: "M12 2l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V5l8-3z",
      users: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 3.1-6 6.6-6 3.5 0 6.4 2.7 6.4 6H2zm13.4-5.6c2.8.6 5.1 2.7 5.1 5.6h-4.8c0-2.3-.8-4.4-2.1-6.1.6-.2 1.2-.4 1.8-.5z"
    };
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", paths[name] || paths.play);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    return svg;
  }

  function timeAgo(iso) {
    var then = new Date(iso).getTime();
    if (!then) return "just now";
    var seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    var units = [
      [31536000, "year"],
      [2592000, "month"],
      [604800, "week"],
      [86400, "day"],
      [3600, "hour"],
      [60, "minute"]
    ];
    for (var i = 0; i < units.length; i++) {
      if (seconds >= units[i][0]) {
        var amount = Math.floor(seconds / units[i][0]);
        return amount + " " + units[i][1] + (amount === 1 ? "" : "s") + " ago";
      }
    }
    return seconds + "s ago";
  }

  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
    return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  function formatDuration(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var mins = Math.floor(total / 60);
    var secs = total % 60;
    var hours = Math.floor(mins / 60);
    if (hours) return hours + ":" + String(mins % 60).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
    return mins + ":" + String(secs).padStart(2, "0");
  }

  function hashCode(text) {
    var hash = 0;
    var str = String(text || "");
    for (var i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function avatarNode(name, size) {
    var node = el("span", "avatar");
    node.style.setProperty("--avatar-hue", hashCode(name) % 360);
    if (size) node.style.setProperty("--avatar-size", size);
    var initials = String(name || "?")
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("");
    node.textContent = initials || "?";
    return node;
  }

  function toast(message, kind) {
    var host = dom.toasts;
    if (!host) return;
    var node = el("div", "toast toast--" + (kind || "info"), message);
    host.appendChild(node);
    requestAnimationFrame(function () {
      node.classList.add("is-visible");
    });
    setTimeout(function () {
      node.classList.remove("is-visible");
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 350);
    }, 3600);
  }

  /* -------------------------------------------------------------- routing */

  function parseRoute() {
    var hash = String(location.hash || "").replace(/^#\/?/, "");
    var parts = hash.split("/").filter(Boolean);
    if (!parts.length) return { view: "home" };
    if (parts[0] === "video" && parts[1]) return { view: "video", id: parts[1] };
    if (parts[0] === "u" && parts[1]) return { view: "user", user: decodeURIComponent(parts[1]) };
    if (parts[0] === "trending") return { view: "trending" };
    if (parts[0] === "new") return { view: "new" };
    if (parts[0] === "top") return { view: "top" };
    if (parts[0] === "liked") return { view: "liked" };
    if (parts[0] === "mine") return { view: "mine" };
    return { view: "home" };
  }

  function navigate(hash) {
    if (location.hash === hash) {
      applyRoute();
      return;
    }
    location.hash = hash;
  }

  function applyRoute() {
    var route = parseRoute();
    state.view = route.view;
    state.user = route.user || null;
    state.videoId = route.id || null;
    renderFeed();
    highlightNav();
    if (state.videoId) {
      var node = document.querySelector('.card[data-id="' + state.videoId + '"]');
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        node.classList.add("is-flash");
        setTimeout(function () {
          node.classList.remove("is-flash");
        }, 1600);
      }
    }
  }

  function highlightNav() {
    qsa("[data-nav]").forEach(function (button) {
      var target = button.getAttribute("data-nav");
      var active = target === state.view || (state.view === "user" && target === "home");
      button.classList.toggle("is-active", active);
    });
  }

  /* ---------------------------------------------------------------- feed */

  function trendingScore(entry) {
    var created = new Date(entry.createdAt).getTime() || Date.now();
    var ageHours = Math.max(0.25, (Date.now() - created) / 3600000);
    var engagement =
      (Number(entry.likes) || 0) * 4 +
      (Number(entry.views) || 0) * 1.2 +
      (entry.comments || []).length * 3 +
      1;
    return engagement / Math.pow(ageHours + 2, 1.25);
  }

  function matchesQuery(entry, query) {
    if (!query) return true;
    var needle = query.toLowerCase();
    var haystack = [entry.title, entry.description, entry.uploader, (entry.tags || []).join(" ")]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(needle) >= 0;
  }

  function computeFeed() {
    var all = Storage.list();
    var persona = Storage.currentPersona();
    var query = state.query.trim();

    var filtered = all.filter(function (entry) {
      return matchesQuery(entry, query);
    });

    switch (state.view) {
      case "new":
        filtered.sort(function (a, b) {
          return String(b.createdAt).localeCompare(String(a.createdAt));
        });
        break;
      case "top":
        filtered.sort(function (a, b) {
          return (Number(b.likes) || 0) - (Number(a.likes) || 0);
        });
        break;
      case "liked":
        filtered = filtered.filter(function (entry) {
          return persona && Storage.reactionState(entry.id).liked;
        });
        break;
      case "mine":
        filtered = filtered.filter(function (entry) {
          return persona && entry.uploaderId === persona.id;
        });
        break;
      case "user":
        filtered = filtered.filter(function (entry) {
          return String(entry.uploader).toLowerCase() === String(state.user).toLowerCase();
        });
        break;
      case "video":
        filtered = filtered.filter(function (entry) {
          return entry.id === state.videoId;
        });
        break;
      default:
        filtered.sort(function (a, b) {
          return trendingScore(b) - trendingScore(a);
        });
    }
    return filtered;
  }

  function viewTitle(feed) {
    if (state.query) return 'Results for "' + state.query + '"';
    switch (state.view) {
      case "new":
        return "Fresh uploads";
      case "top":
        return "Most appreciated";
      case "liked":
        return "Liked by you";
      case "mine":
        return "Your channel";
      case "user":
        return "@" + state.user;
      case "video":
        return "One single video";
      default:
        return "For you";
    }
  }

  function renderFeed() {
    var feed = computeFeed();
    dom.feed.innerHTML = "";
    Object.keys(state.controllers).forEach(function (id) {
      state.controllers[id].destroy();
      delete state.controllers[id];
    });

    dom.feedTitle.textContent = viewTitle(feed);
    dom.feedCount.textContent =
      feed.length + (feed.length === 1 ? " video" : " videos") + (state.query ? " matching" : "");

    if (!feed.length) {
      dom.feed.appendChild(emptyState());
      renderStats();
      return;
    }

    feed.forEach(function (entry) {
      var controller = createCard(entry);
      state.controllers[entry.id] = controller;
      dom.feed.appendChild(controller.el);
    });

    observeCards();
    renderStats();
  }

  function emptyState() {
    var box = el("div", "empty");
    var art = el("div", "empty__art");
    art.appendChild(icon("globe"));
    box.appendChild(art);
    var title = el("h3", "empty__title", "Nothing here. Yet.");
    box.appendChild(title);
    var copy = el(
      "p",
      "empty__copy",
      state.query
        ? "No video survived the search. The censorship was thorough."
        : "No videos yet. Be the first to upload something gloriously unnecessary."
    );
    box.appendChild(copy);
    var button = el("button", "btn btn--primary");
    button.appendChild(icon("upload"));
    button.appendChild(el("span", null, "Upload a video"));
    button.addEventListener("click", openUpload);
    box.appendChild(button);
    return box;
  }

  /* ---------------------------------------------------------------- card */

  function createCard(entry) {
    var card = el("article", "card");
    card.dataset.id = entry.id;

    var media = el("div", "card__media");
    var video = el("video", "card__video");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "none");
    video.setAttribute("controls", "");
    video.controls = true;
    media.appendChild(video);

    var overlay = el("div", "card__overlay");
    var playButton = el("button", "bigplay");
    playButton.type = "button";
    playButton.setAttribute("aria-label", "Play " + entry.title);
    playButton.appendChild(icon("play"));
    overlay.appendChild(playButton);
    media.appendChild(overlay);

    var hud = el("div", "card__hud");
    var modeBadge = el("span", "hud__badge", "IDLE");
    hud.appendChild(modeBadge);
    var bufferBadge = el("span", "hud__badge hud__badge--soft", "0s buffered");
    hud.appendChild(bufferBadge);
    media.appendChild(hud);

    var durationBadge = el("span", "card__duration", formatDuration(entry.duration));
    media.appendChild(durationBadge);

    card.appendChild(media);

    var body = el("div", "card__body");

    var head = el("div", "card__head");
    var avatar = avatarNode(entry.uploader, "42px");
    var avatarLink = el("button", "card__uploader");
    avatarLink.type = "button";
    avatarLink.appendChild(avatar);
    var names = el("span", "card__names");
    names.appendChild(el("strong", "card__name", entry.uploader));
    names.appendChild(el("span", "card__meta", timeAgo(entry.createdAt) + " • " + (entry.views || 0) + " views"));
    avatarLink.appendChild(names);
    head.appendChild(avatarLink);
    body.appendChild(head);

    var title = el("h3", "card__title", entry.title);
    body.appendChild(title);

    if (entry.description) {
      body.appendChild(el("p", "card__desc", entry.description));
    }

    if ((entry.tags || []).length) {
      var tagRow = el("div", "card__tags");
      entry.tags.forEach(function (tag) {
        var chip = el("button", "chip", "#" + tag);
        chip.type = "button";
        chip.addEventListener("click", function () {
          state.query = tag;
          dom.search.value = tag;
          renderFeed();
        });
        tagRow.appendChild(chip);
      });
      body.appendChild(tagRow);
    }

    var actions = el("div", "card__actions");
    var likeBtn = actionButton("like", "Like");
    var dislikeBtn = actionButton("dislike", "Dislike");
    var commentBtn = actionButton("comment", "Comments");
    var shareBtn = actionButton("share", "Share");
    actions.appendChild(likeBtn);
    actions.appendChild(dislikeBtn);
    actions.appendChild(commentBtn);
    actions.appendChild(shareBtn);

    var persona = Storage.currentPersona();
    if (persona && entry.uploaderId === persona.id) {
      var deleteBtn = actionButton("trash", "Delete");
      deleteBtn.classList.add("action--danger");
      actions.appendChild(deleteBtn);
    }
    body.appendChild(actions);

    var comments = el("div", "card__comments");
    comments.hidden = true;
    body.appendChild(comments);

    card.appendChild(body);

    var controller = {
      entry: entry,
      el: card,
      video: video,
      overlay: overlay,
      playButton: playButton,
      hud: hud,
      modeBadge: modeBadge,
      bufferBadge: bufferBadge,
      likeBtn: likeBtn,
      dislikeBtn: dislikeBtn,
      comments: comments,
      player: null,
      preparing: null,
      prepared: false,
      viewed: false,
      destroyed: false
    };

    controller.destroy = function () {
      controller.destroyed = true;
      if (controller.player) {
        try {
          controller.player.destroy();
        } catch (err) {
          /* ignore */
        }
        controller.player = null;
      }
      if (observer) {
        try {
          observer.unobserve(card);
        } catch (err) {
          /* ignore */
        }
      }
    };

    renderComments(controller);
    renderReactionButtons(controller);
    attachCardEvents(controller);

    Storage.getPosterURL(entry.id).then(function (url) {
      if (url && !controller.destroyed) video.poster = url;
    });

    return controller;
  }

  function actionButton(name, label) {
    var button = el("button", "action");
    button.type = "button";
    button.dataset.action = name;
    button.appendChild(icon(name));
    button.appendChild(el("span", "action__label", label));
    var count = el("span", "action__count", "0");
    button.appendChild(count);
    button.setAttribute("aria-label", label);
    return button;
  }

  function setActionCount(button, value) {
    var count = button.querySelector(".action__count");
    if (count) count.textContent = compactNumber(value);
  }

  function compactNumber(value) {
    var number = Number(value) || 0;
    if (number < 1000) return String(number);
    if (number < 1000000) return (number / 1000).toFixed(number < 10000 ? 1 : 0).replace(/\.0$/, "") + "K";
    return (number / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }

  function renderReactionButtons(controller) {
    var entry = controller.entry;
    setActionCount(controller.likeBtn, entry.likes);
    setActionCount(controller.dislikeBtn, entry.dislikes);
    var comments = (entry.comments || []).length;
    var commentCount = controller.comments.parentNode.querySelector('[data-action="comment"] .action__count');
    if (commentCount) commentCount.textContent = compactNumber(comments);

    var reactions = Storage.reactionState(entry.id);
    controller.likeBtn.classList.toggle("is-active", reactions.liked);
    controller.dislikeBtn.classList.toggle("is-active", reactions.disliked);
  }

  function renderComments(controller) {
    var entry = Storage.get(controller.entry.id) || controller.entry;
    controller.entry = entry;
    controller.comments.innerHTML = "";

    var list = el("div", "comments__list");
    var comments = entry.comments || [];
    if (!comments.length) {
      list.appendChild(el("p", "comments__empty", "No comments yet. The silence is deafening."));
    } else {
      comments.forEach(function (comment) {
        var row = el("div", "comment");
        row.appendChild(avatarNode(comment.author, "28px"));
        var bubble = el("div", "comment__body");
        var meta = el("div", "comment__meta");
        meta.appendChild(el("strong", null, comment.author));
        meta.appendChild(el("span", null, timeAgo(comment.createdAt)));
        bubble.appendChild(meta);
        bubble.appendChild(el("p", null, comment.text));
        row.appendChild(bubble);
        list.appendChild(row);
      });
    }
    controller.comments.appendChild(list);

    var form = el("form", "comment__form");
    var input = el("input", "comment__input");
    input.type = "text";
    input.placeholder = "Add a comment (nobody will read it)";
    input.maxLength = 280;
    input.setAttribute("aria-label", "Add a comment");
    form.appendChild(input);
    var submit = el("button", "btn btn--ghost", "Comment");
    submit.type = "submit";
    form.appendChild(submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      var persona = Storage.currentPersona();
      var comments = (Storage.get(entry.id).comments || []).slice();
      comments.push({
        id: "c" + Date.now().toString(36),
        author: persona ? persona.name : "anonymous",
        text: text,
        createdAt: new Date().toISOString()
      });
      Storage.update(entry.id, { comments: comments });
      input.value = "";
      renderComments(controller);
      renderReactionButtons(controller);
      toast("Comment posted. A tiny algorithm is furious.", "success");
    });
    controller.comments.appendChild(form);
  }

  function attachCardEvents(controller) {
    var entry = controller.entry;
    var video = controller.video;

    var uploaderButton = controller.el.querySelector(".card__uploader");
    if (uploaderButton) {
      uploaderButton.addEventListener("click", function () {
        navigate("#/u/" + encodeURIComponent(entry.uploader));
      });
    }

    controller.playButton.addEventListener("click", function () {
      ensurePlayer(controller, true);
    });

    video.addEventListener("play", function () {
      if (!controller.player) {
        ensurePlayer(controller, true);
        return;
      }
      pauseOthers(controller);
      controller.overlay.classList.add("is-hidden");
      controller.el.classList.add("is-playing");
      bumpViews(controller);
    });

    video.addEventListener("pause", function () {
      controller.overlay.classList.remove("is-hidden");
      controller.el.classList.remove("is-playing");
    });

    video.addEventListener("ended", function () {
      controller.overlay.classList.remove("is-hidden");
      controller.el.classList.remove("is-playing");
    });

    video.addEventListener("timeupdate", function () {
      updateHud(controller);
    });

    video.addEventListener("waiting", function () {
      controller.el.classList.add("is-buffering");
    });

    video.addEventListener("playing", function () {
      controller.el.classList.remove("is-buffering");
    });

    controller.likeBtn.addEventListener("click", function () {
      react(controller, "like");
    });
    controller.dislikeBtn.addEventListener("click", function () {
      react(controller, "dislike");
    });

    var commentBtn = controller.comments.parentNode.querySelector('[data-action="comment"]');
    commentBtn.addEventListener("click", function () {
      controller.comments.hidden = !controller.comments.hidden;
      if (!controller.comments.hidden) {
        var input = controller.comments.querySelector(".comment__input");
        if (input) input.focus();
      }
    });

    var shareBtn = controller.comments.parentNode.querySelector('[data-action="share"]');
    shareBtn.addEventListener("click", function () {
      var url = location.origin + location.pathname + "#/video/" + entry.id;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () {
            toast("Link copied. It will be blocked in four countries.", "success");
          },
          function () {
            toast(url);
          }
        );
      } else {
        toast(url);
      }
    });

    var deleteBtn = controller.comments.parentNode.querySelector('[data-action="trash"]');
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function () {
        if (!window.confirm("Delete “" + entry.title + "”? This cannot be undone by anyone.")) return;
        Storage.remove(entry.id).then(function () {
          toast("Video deleted. The algorithm has forgotten it already.", "success");
          renderFeed();
        });
      });
    }
  }

  function react(controller, kind) {
    var persona = Storage.currentPersona();
    if (!persona) {
      openGate();
      return;
    }
    var result = Storage.react(controller.entry.id, kind);
    if (!result) return;
    controller.entry = Storage.get(controller.entry.id) || controller.entry;
    renderReactionButtons(controller);
    if (kind === "like" && result.liked) {
      controller.likeBtn.classList.add("is-pop");
      setTimeout(function () {
        controller.likeBtn.classList.remove("is-pop");
      }, 420);
    }
  }

  function bumpViews(controller) {
    if (controller.viewed) return;
    controller.viewed = true;
    var entry = Storage.get(controller.entry.id);
    if (!entry) return;
    Storage.update(entry.id, { views: (Number(entry.views) || 0) + 1 });
    controller.entry = Storage.get(controller.entry.id);
  }

  function pauseOthers(current) {
    Object.keys(state.controllers).forEach(function (id) {
      var controller = state.controllers[id];
      if (controller !== current && controller.video && !controller.video.paused) {
        controller.video.pause();
      }
    });
  }

  /* -------------------------------------------------------------- player */

  function ensurePlayer(controller, autoplay) {
    if (controller.destroyed) return Promise.resolve(controller);
    if (controller.player) {
      if (autoplay) startPlayback(controller);
      return Promise.resolve(controller);
    }
    if (controller.preparing) {
      return controller.preparing.then(function () {
        if (autoplay) startPlayback(controller);
        return controller;
      });
    }

    controller.overlay.classList.add("is-loading");
    controller.el.classList.add("is-buffering");
    controller.modeBadge.textContent = "LOADING";

    controller.preparing = Storage.getBlob(controller.entry.id)
      .then(function (blob) {
        if (!blob) throw new Error("missing");
        var player = new StreamPlayerCtor(controller.video, {
          chunkSeconds: 10,
          onState: function (info) {
            if (controller.destroyed) return;
            if (info.mode === "streaming") controller.modeBadge.textContent = "STREAM";
            else if (info.mode === "direct") controller.modeBadge.textContent = "DIRECT";
            updateHud(controller);
          }
        });
        controller.player = player;
        controller.blob = blob;
        return player.open(blob, {
          duration: controller.entry.duration,
          name: controller.entry.title,
          title: controller.entry.title
        });
      })
      .then(function () {
        controller.prepared = true;
        controller.overlay.classList.remove("is-loading");
        controller.el.classList.remove("is-buffering");
        updateHud(controller);
        if (autoplay) startPlayback(controller);
        return controller;
      })
      .catch(function () {
        controller.overlay.classList.remove("is-loading");
        controller.el.classList.remove("is-buffering");
        controller.modeBadge.textContent = "OFFLINE";
        toast("That video could not be found in the library.", "error");
        return controller;
      });

    return controller.preparing;
  }

  function startPlayback(controller) {
    var attempt = controller.video.play();
    if (attempt && attempt.catch) {
      attempt.catch(function () {
        controller.overlay.classList.remove("is-hidden");
      });
    }
  }

  function updateHud(controller) {
    if (controller.destroyed) return;
    if (controller.player) {
      var status = controller.player.status();
      controller.modeBadge.textContent =
        status.mode === "streaming" ? "STREAM" : status.mode === "direct" ? "DIRECT" : "IDLE";
      var ahead = Math.max(0, Math.round(status.bufferedAhead));
      controller.bufferBadge.textContent = ahead + "s buffered";
      controller.bufferBadge.classList.toggle("is-hot", ahead < 3 && !controller.video.paused);
    } else if (controller.prepared) {
      controller.bufferBadge.textContent = "ready";
    }
  }

  /** Pre-buffers the first ten seconds as soon as a card is on screen. */
  function observeCards() {
    if (observer) observer.disconnect();
    if (!("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (item) {
          var controller = state.controllers[item.target.dataset.id];
          if (!controller) return;
          if (item.isIntersecting && item.intersectionRatio > 0.45) {
            if (!controller.prepared && !controller.player) {
              ensurePlayer(controller, false);
            }
            state.activeController = controller;
          } else if (item.isIntersecting && item.intersectionRatio <= 0.2) {
            if (controller.video && !controller.video.paused) controller.video.pause();
          }
        });
      },
      { threshold: [0, 0.2, 0.45, 0.8] }
    );
    qsa(".card").forEach(function (card) {
      observer.observe(card);
    });
  }

  /* --------------------------------------------------------------- upload */

  var uploadState = {
    file: null,
    blob: null,
    duration: 0,
    width: 0,
    height: 0,
    poster: null,
    posterUrl: null
  };

  function openUpload() {
    dom.uploadModal.classList.add("is-open");
    dom.uploadModal.setAttribute("aria-hidden", "false");
    resetUpload();
    setTimeout(function () {
      dom.uploadTitle.focus();
    }, 60);
  }

  function closeUpload() {
    dom.uploadModal.classList.remove("is-open");
    dom.uploadModal.setAttribute("aria-hidden", "true");
    resetUpload();
  }

  function resetUpload() {
    uploadState.file = null;
    uploadState.blob = null;
    uploadState.duration = 0;
    uploadState.width = 0;
    uploadState.height = 0;
    uploadState.poster = null;
    if (uploadState.posterUrl) {
      URL.revokeObjectURL(uploadState.posterUrl);
      uploadState.posterUrl = null;
    }
    dom.uploadProgress.style.width = "0%";
    dom.uploadProgressWrap.hidden = true;
    dom.uploadStatus.textContent = "";
    dom.uploadPreview.hidden = true;
    dom.uploadPreviewVideo.removeAttribute("src");
    dom.uploadPreviewVideo.load();
    dom.uploadPublish.disabled = true;
    dom.uploadDrop.classList.remove("has-file");
    dom.uploadFile.value = "";
  }

  function handleFile(file) {
    if (!file) return;
    var type = file.type || "";
    var name = (file.name || "").toLowerCase();
    var looksLikeVideo = type.indexOf("video/") === 0 || /\.(mp4|m4v|webm|ogv|mov|mkv)$/.test(name);
    if (!looksLikeVideo) {
      toast("That does not look like a video. We only store videos.", "error");
      return;
    }
    uploadState.file = file;
    uploadState.blob = file;
    dom.uploadDrop.classList.add("has-file");
    dom.uploadDropLabel.textContent = file.name + " • " + formatBytes(file.size);
    dom.uploadTitle.value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 80);
    dom.uploadPublish.disabled = false;

    readVideoMetadata(file)
      .then(function (meta) {
        uploadState.duration = meta.duration;
        uploadState.width = meta.width;
        uploadState.height = meta.height;
        dom.uploadMeta.textContent =
          formatDuration(meta.duration) + " • " + meta.width + "x" + meta.height + " • " + formatBytes(file.size);
        return capturePoster(file);
      })
      .then(function (poster) {
        uploadState.poster = poster;
        if (poster) {
          uploadState.posterUrl = URL.createObjectURL(poster);
          dom.uploadPreviewVideo.poster = uploadState.posterUrl;
        }
        dom.uploadPreviewVideo.src = URL.createObjectURL(file);
        dom.uploadPreview.hidden = false;
      })
      .catch(function () {
        dom.uploadMeta.textContent = formatBytes(file.size) + " (metadata unavailable)";
        dom.uploadPreviewVideo.src = URL.createObjectURL(file);
        dom.uploadPreview.hidden = false;
      });
  }

  function readVideoMetadata(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      var done = false;
      video.onloadedmetadata = function () {
        done = true;
        var meta = {
          duration: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0
        };
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      video.onerror = function () {
        if (done) return;
        URL.revokeObjectURL(url);
        reject(new Error("metadata failed"));
      };
      video.src = url;
    });
  }

  function capturePoster(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.src = url;
      video.onloadeddata = function () {
        try {
          video.currentTime = Math.min(0.6, (video.duration || 1) / 4);
        } catch (err) {
          /* ignore */
        }
      };
      video.onseeked = function () {
        try {
          var canvas = document.createElement("canvas");
          var scale = Math.min(1, 640 / (video.videoWidth || 640));
          canvas.width = Math.max(2, Math.round((video.videoWidth || 640) * scale));
          canvas.height = Math.max(2, Math.round((video.videoHeight || 360) * scale));
          var ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            URL.revokeObjectURL(url);
            resolve(blob);
          }, "image/jpeg", 0.72);
        } catch (err) {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      video.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      setTimeout(function () {
        URL.revokeObjectURL(url);
        resolve(null);
      }, 6000);
    });
  }

  /** Generates a short animated clip so the site can be demoed with no files. */
  function generateDemoClip() {
    return new Promise(function (resolve, reject) {
      if (!window.MediaRecorder) {
        reject(new Error("MediaRecorder is not supported in this browser."));
        return;
      }
      var canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      var ctx = canvas.getContext("2d");
      var stream = canvas.captureStream(30);
      var types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
      var mime = types.find(function (type) {
        return MediaRecorder.isTypeSupported(type);
      });
      var recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      var chunks = [];
      recorder.ondataavailable = function (event) {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      recorder.onstop = function () {
        var blob = new Blob(chunks, { type: "video/webm" });
        if (!blob.size) {
          reject(new Error("The demo clip came out empty."));
          return;
        }
        resolve(blob);
      };
      var start = performance.now();
      var duration = 6000;
      function frame(now) {
        var t = (now - start) / 1000;
        var gradient = ctx.createLinearGradient(0, 0, 640, 360);
        gradient.addColorStop(0, "hsl(" + (t * 40) % 360 + " 80% 55%)");
        gradient.addColorStop(1, "hsl(" + ((t * 40) % 360 + 120) + " 80% 45%)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        for (var i = 0; i < 7; i++) {
          var x = (i * 97 + t * 120) % 700 - 30;
          var y = 60 + i * 34 + Math.sin(t * 2 + i) * 18;
          ctx.beginPath();
          ctx.arc(x, y, 26, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#fff";
        ctx.font = "700 34px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("TOTALLY NOT A SOCIAL MEDIA SITE", 320, 190);
        ctx.font = "500 20px system-ui, sans-serif";
        ctx.fillText("demo clip • " + t.toFixed(1) + "s", 320, 226);
        if (t < duration) {
          requestAnimationFrame(frame);
        } else {
          recorder.stop();
          stream.getTracks().forEach(function (track) {
            track.stop();
          });
        }
      }
      recorder.start();
      requestAnimationFrame(frame);
    });
  }

  function publishUpload() {
    if (!uploadState.blob) return;
    var persona = Storage.currentPersona();
    if (!persona) {
      openGate();
      return;
    }
    var title = dom.uploadTitle.value.trim() || "Untitled upload";
    var description = dom.uploadDesc.value.trim();
    var tags = dom.uploadTags.value.trim();
    dom.uploadPublish.disabled = true;
    dom.uploadProgressWrap.hidden = false;
    dom.uploadStatus.textContent = "Reading the video...";
    dom.uploadProgress.style.width = "18%";

    var steps = [
      { at: 120, text: "Storing payload in videostorage.js..." },
      { at: 260, text: "Writing the catalogue entry..." },
      { at: 380, text: "Asking 0 moderators for approval..." }
    ];
    var timers = steps.map(function (step) {
      return setTimeout(function () {
        dom.uploadStatus.textContent = step.text;
        dom.uploadProgress.style.width = step.at + "%";
      }, step.at);
    });

    Storage.save({
      blob: uploadState.blob,
      posterBlob: uploadState.poster,
      title: title,
      description: description,
      tags: tags,
      uploader: persona.name,
      uploaderId: persona.id,
      duration: uploadState.duration,
      width: uploadState.width,
      height: uploadState.height,
      mime: uploadState.blob.type
    })
      .then(function (entry) {
        timers.forEach(clearTimeout);
        dom.uploadProgress.style.width = "100%";
        dom.uploadStatus.textContent = "Published. The feed has been notified.";
        setTimeout(function () {
          closeUpload();
          state.query = "";
          dom.search.value = "";
          navigate("#/u/" + encodeURIComponent(persona.name));
          renderFeed();
          var node = document.querySelector('.card[data-id="' + entry.id + '"]');
          if (node) {
            node.scrollIntoView({ behavior: "smooth", block: "center" });
            node.classList.add("is-flash");
            setTimeout(function () {
              node.classList.remove("is-flash");
            }, 1800);
          }
        }, 700);
      })
      .catch(function (err) {
        timers.forEach(clearTimeout);
        dom.uploadPublish.disabled = false;
        dom.uploadStatus.textContent = "Upload failed: " + (err && err.message ? err.message : err);
        toast("Upload failed. The algorithm apologises.", "error");
      });
  }

  /* ----------------------------------------------------------------- gate */

  function randomUsername() {
    var adjectives = ["Anonymous", "Definitely", "Probably", "Sort Of", "Barely", "Secretly", "Mildly"];
    var nouns = ["Otter", "Compiler", "Dialect", "Semicolon", "Bandwidth", "Pixel", "Router", "Capybara"];
    var pick = function (list) {
      return list[Math.floor(Math.random() * list.length)];
    };
    return (
      pick(adjectives) +
      "_" +
      pick(nouns) +
      "_" +
      Math.floor(Math.random() * 900 + 100)
    );
  }

  function openGate() {
    dom.gate.classList.add("is-open");
    dom.gate.setAttribute("aria-hidden", "false");
    dom.gateName.value = "";
    dom.gateError.textContent = "";
    setTimeout(function () {
      dom.gateName.focus();
    }, 80);
  }

  function closeGate() {
    dom.gate.classList.remove("is-open");
    dom.gate.setAttribute("aria-hidden", "true");
  }

  function submitGate(event) {
    if (event) event.preventDefault();
    var name = dom.gateName.value.trim();
    if (!name) {
      dom.gateError.textContent = "A name is required. It is the only thing we ask for.";
      return;
    }
    if (name.length < 2) {
      dom.gateError.textContent = "Two characters minimum. Blame the character limit.";
      return;
    }
    var persona = Storage.createPersona(name);
    if (!persona) {
      dom.gateError.textContent = "That name did not stick. Try another one.";
      return;
    }
    closeGate();
    state.persona = persona;
    renderIdentity();
    toast("Welcome, " + persona.name + ". No account was created - there was nothing to create.", "success");
    renderFeed();
  }

  /* ------------------------------------------------------------- identity */

  function renderIdentity() {
    var persona = Storage.currentPersona();
    state.persona = persona;
    dom.identity.innerHTML = "";
    if (!persona) {
      var ghost = el("button", "identity");
      ghost.type = "button";
      ghost.appendChild(avatarNode("?", "32px"));
      ghost.appendChild(el("span", "identity__name", "Choose a name"));
      ghost.addEventListener("click", openGate);
      dom.identity.appendChild(ghost);
      return;
    }
    var button = el("button", "identity");
    button.type = "button";
    button.setAttribute("aria-haspopup", "true");
    button.appendChild(avatarNode(persona.name, "32px"));
    var nameWrap = el("span", "identity__name");
    nameWrap.appendChild(el("strong", null, persona.name));
    nameWrap.appendChild(el("span", null, "switch persona"));
    button.appendChild(nameWrap);
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleIdentityMenu();
    });
    dom.identity.appendChild(button);
  }

  function toggleIdentityMenu() {
    var menu = dom.identityMenu;
    var open = menu.classList.toggle("is-open");
    menu.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      renderIdentityMenu();
      document.addEventListener("click", closeIdentityMenuOnOutside, true);
    } else {
      document.removeEventListener("click", closeIdentityMenuOnOutside, true);
    }
  }

  function closeIdentityMenuOnOutside(event) {
    if (!dom.identityMenu.contains(event.target) && !dom.identity.contains(event.target)) {
      dom.identityMenu.classList.remove("is-open");
      dom.identityMenu.setAttribute("aria-hidden", "true");
      document.removeEventListener("click", closeIdentityMenuOnOutside, true);
    }
  }

  function renderIdentityMenu() {
    var menu = dom.identityMenu;
    menu.innerHTML = "";
    var personas = Storage.personas().list;
    var heading = el("p", "menu__heading", "Personas");
    menu.appendChild(heading);

    personas.forEach(function (persona) {
      var row = el("button", "menu__row");
      row.type = "button";
      row.appendChild(avatarNode(persona.name, "30px"));
      row.appendChild(el("span", "menu__label", persona.name));
      if (persona.id === Storage.personas().current) {
        row.appendChild(el("span", "menu__check", "active"));
      }
      row.addEventListener("click", function () {
        Storage.setCurrentPersona(persona.id);
        dom.identityMenu.classList.remove("is-open");
        renderIdentity();
        renderFeed();
        toast("Now posting as " + persona.name + ".", "success");
      });
      menu.appendChild(row);
    });

    if (personas.length > 1) {
      var forget = el("button", "menu__row menu__row--danger");
      forget.type = "button";
      forget.appendChild(el("span", "menu__label", "Forget this persona"));
      forget.addEventListener("click", function () {
        var current = Storage.currentPersona();
        Storage.forgetPersona(current.id);
        dom.identityMenu.classList.remove("is-open");
        renderIdentity();
        renderFeed();
      });
      menu.appendChild(forget);
    }

    var form = el("form", "menu__form");
    var input = el("input", "menu__input");
    input.type = "text";
    input.placeholder = "new name, no password";
    input.maxLength = 24;
    form.appendChild(input);
    var button = el("button", "btn btn--primary btn--small", "BOOM");
    button.type = "submit";
    form.appendChild(button);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = input.value.trim();
      if (!name) return;
      Storage.createPersona(name);
      dom.identityMenu.classList.remove("is-open");
      renderIdentity();
      renderFeed();
      toast("New persona: " + name + ". Still no password.", "success");
    });
    menu.appendChild(form);
  }

  /* ----------------------------------------------------------------- rail */

  var JURISDICTIONS = [
    { name: "Bureaucratistan", state: "blocked", note: "the ministry dislikes memes" },
    { name: "The People's Republic of Wi-Fi", state: "limited", note: "videos load at 144p" },
    { name: "North Freedonia", state: "blocked", note: "likes are considered propaganda" },
    { name: "The Republic of Cat Videos", state: "allowed", note: "we are the only social network" },
    { name: "Isolated Island State", state: "allowed", note: "no internet since 2011" },
    { name: "Tyrannia", state: "blocked", note: "uploads need a ministry stamp" },
    { name: "Freezone", state: "allowed", note: "the last free corner of the net" },
    { name: "Sand dunes of Amastan", state: "limited", note: "satellite only" }
  ];

  function renderAvailability() {
    dom.availability.innerHTML = "";
    JURISDICTIONS.forEach(function (place) {
      var row = el("li", "place place--" + place.state);
      var badge = el("span", "place__badge", place.state.toUpperCase());
      row.appendChild(badge);
      var body = el("div", "place__body");
      body.appendChild(el("strong", null, place.name));
      body.appendChild(el("span", null, place.note));
      row.appendChild(body);
      row.addEventListener("click", function () {
        toast("Our lawyers in " + place.name + " have been notified. (They do not exist.)");
      });
      dom.availability.appendChild(row);
    });
  }

  function renderStats() {
    var usage = Storage.usage();
    dom.statVideos.textContent = String(usage.videos);
    dom.statViews.textContent = compactNumber(usage.views);
    dom.statLikes.textContent = compactNumber(usage.likes);
    dom.statStorage.textContent = formatBytes(usage.bytes);
    dom.statBackend.textContent =
      usage.backend === "indexeddb" ? "IndexedDB (fast lane)" : "localStorage (slow lane)";
  }

  /* ----------------------------------------------------------------- boot */

  function bindEvents() {
    dom.search.addEventListener("input", function () {
      state.query = dom.search.value;
      renderFeed();
    });

    dom.uploadBtn.addEventListener("click", openUpload);
    dom.uploadClose.addEventListener("click", closeUpload);
    dom.uploadModal.addEventListener("click", function (event) {
      if (event.target === dom.uploadModal) closeUpload();
    });

    dom.uploadFile.addEventListener("change", function () {
      if (dom.uploadFile.files && dom.uploadFile.files[0]) handleFile(dom.uploadFile.files[0]);
    });

    dom.uploadDrop.addEventListener("click", function () {
      dom.uploadFile.click();
    });

    dom.uploadDrop.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        dom.uploadFile.click();
      }
    });

    ["dragenter", "dragover"].forEach(function (type) {
      dom.uploadDrop.addEventListener(type, function (event) {
        event.preventDefault();
        dom.uploadDrop.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach(function (type) {
      dom.uploadDrop.addEventListener(type, function (event) {
        event.preventDefault();
        dom.uploadDrop.classList.remove("is-dragging");
      });
    });
    dom.uploadDrop.addEventListener("drop", function (event) {
      var files = event.dataTransfer && event.dataTransfer.files;
      if (files && files[0]) handleFile(files[0]);
    });

    dom.uploadPublish.addEventListener("click", publishUpload);

    dom.uploadDemo.addEventListener("click", function () {
      dom.uploadDemo.disabled = true;
      dom.uploadStatus.textContent = "Recording a six second demo clip...";
      generateDemoClip()
        .then(function (blob) {
          var file = new File([blob], "demo-clip.webm", { type: blob.type });
          handleFile(file);
          dom.uploadStatus.textContent = "Demo clip ready. Publish it or upload your own.";
        })
        .catch(function (err) {
          dom.uploadStatus.textContent = "Could not record a demo clip: " + err.message;
        })
        .then(function () {
          dom.uploadDemo.disabled = false;
        });
    });

    dom.gateForm.addEventListener("submit", submitGate);
    dom.gateRandom.addEventListener("click", function () {
      dom.gateName.value = randomUsername();
      dom.gateName.focus();
    });
    dom.gate.addEventListener("click", function (event) {
      if (event.target === dom.gate) closeGate();
    });

    dom.themeToggle.addEventListener("click", function () {
      var root = document.documentElement;
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("tnasm.theme", next);
      } catch (err) {
        /* ignore */
      }
    });

    dom.sanitizeToggle.addEventListener("click", function () {
      state.sanitize = !state.sanitize;
      document.body.classList.toggle("is-sanitized", state.sanitize);
      dom.sanitizeToggle.setAttribute("aria-pressed", state.sanitize ? "true" : "false");
      toast(
        state.sanitize
          ? "Sanitised mode on. Thumbnails need a content passport now."
          : "Sanitised mode off. Back to questionable content.",
        "success"
      );
    });

    qsa("[data-nav]").forEach(function (button) {
      button.addEventListener("click", function () {
        navigate("#/" + (button.getAttribute("data-nav") === "home" ? "" : button.getAttribute("data-nav")));
      });
    });

    dom.aboutBtn.addEventListener("click", function () {
      dom.aboutModal.classList.add("is-open");
      dom.aboutModal.setAttribute("aria-hidden", "false");
    });
    dom.aboutClose.addEventListener("click", function () {
      dom.aboutModal.classList.remove("is-open");
      dom.aboutModal.setAttribute("aria-hidden", "true");
    });
    dom.aboutModal.addEventListener("click", function (event) {
      if (event.target === dom.aboutModal) {
        dom.aboutModal.classList.remove("is-open");
        dom.aboutModal.setAttribute("aria-hidden", "true");
      }
    });

    window.addEventListener("hashchange", applyRoute);

    document.addEventListener("keydown", function (event) {
      var tag = (event.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || event.target.isContentEditable;
      if (event.key === "Escape") {
        closeUpload();
        dom.gate.classList.remove("is-open");
        dom.aboutModal.classList.remove("is-open");
        return;
      }
      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        dom.search.focus();
      } else if (event.key === "u" || event.key === "U") {
        event.preventDefault();
        openUpload();
      }
    });

    // Drop a video anywhere on the page to upload it.
    document.addEventListener("dragover", function (event) {
      event.preventDefault();
    });
    document.addEventListener("drop", function (event) {
      if (!event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
      event.preventDefault();
      openUpload();
      handleFile(event.dataTransfer.files[0]);
    });
  }

  function cacheDom() {
    dom.gate = qs("#gate");
    dom.gateForm = qs("#gate-form");
    dom.gateName = qs("#gate-name");
    dom.gateError = qs("#gate-error");
    dom.gateRandom = qs("#gate-random");

    dom.uploadModal = qs("#upload-modal");
    dom.uploadClose = qs("#upload-close");
    dom.uploadDrop = qs("#upload-drop");
    dom.uploadDropLabel = qs("#upload-drop-label");
    dom.uploadFile = qs("#upload-file");
    dom.uploadTitle = qs("#upload-title");
    dom.uploadDesc = qs("#upload-desc");
    dom.uploadTags = qs("#upload-tags");
    dom.uploadMeta = qs("#upload-meta");
    dom.uploadPreview = qs("#upload-preview");
    dom.uploadPreviewVideo = qs("#upload-preview-video");
    dom.uploadPublish = qs("#upload-publish");
    dom.uploadProgress = qs("#upload-progress");
    dom.uploadProgressWrap = qs("#upload-progress-wrap");
    dom.uploadStatus = qs("#upload-status");
    dom.uploadDemo = qs("#upload-demo");

    dom.search = qs("#search");
    dom.uploadBtn = qs("#upload-btn");
    dom.identity = qs("#identity");
    dom.identityMenu = qs("#identity-menu");
    dom.themeToggle = qs("#theme-toggle");
    dom.sanitizeToggle = qs("#sanitize-toggle");
    dom.aboutBtn = qs("#about-btn");
    dom.aboutClose = qs("#about-close");
    dom.aboutModal = qs("#about-modal");
    dom.feed = qs("#feed");
    dom.feedTitle = qs("#feed-title");
    dom.feedCount = qs("#feed-count");
    dom.availability = qs("#availability");
    dom.toasts = qs("#toasts");

    dom.statVideos = qs("#stat-videos");
    dom.statViews = qs("#stat-views");
    dom.statLikes = qs("#stat-likes");
    dom.statStorage = qs("#stat-storage");
    dom.statBackend = qs("#stat-backend");
  }

  function applyStoredTheme() {
    var theme = "dark";
    try {
      theme = localStorage.getItem("tnasm.theme") || "dark";
    } catch (err) {
      /* ignore */
    }
    document.documentElement.setAttribute("data-theme", theme);
  }

  function init() {
    cacheDom();
    applyStoredTheme();
    bindEvents();
    renderAvailability();

    Storage.init().then(function () {
      state.ready = true;
      renderIdentity();
      applyRoute();
      renderStats();
      if (!Storage.currentPersona()) {
        openGate();
      }
      if (!Storage.list().length) {
        toast("No videos yet. Upload one - or record a demo clip - and start the feed.", "info");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
