// Video slots. data-youtube="<id>": swap the thumbnail for the YouTube player on tap (YouTube only loads when someone
// presses play). data-video="<file>": play a self-hosted file. Neither set: do nothing yet.
// Play + viewing stats. Each event is sent once per page view, to the Google tag (if present) and to /api/video-event.
// No cookies and no personal data: a random session id lives in sessionStorage only.
var VT = (function () {
  var sent = {}, played = false, furthest = 0, sid = null;
  try { sid = sessionStorage.getItem('lrg-vsid'); if (!sid) { sid = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('lrg-vsid', sid); } } catch (e) { sid = Math.random().toString(36).slice(2); }
  function send(id, name, quartile, detail) {
    var key = id + ':' + name + (name === 'diag' || name === 'blocked' || name === 'error' ? ':' + (detail || '').slice(0, 24) : '');
    if (sent[key]) return;
    sent[key] = true;
    var payload = { video_id: id, event: name, quartile: quartile || 0, played: played, path: location.pathname, referrer: document.referrer || '', vw: window.innerWidth, sid: sid, detail: detail || '' };
    try { if (typeof window.gtag === 'function') window.gtag('event', 'video_' + name, { video_id: id, quartile: payload.quartile, played: played }); } catch (e) {}
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon && navigator.sendBeacon('/api/video-event', new Blob([body], { type: 'application/json' }))) return;
      fetch('/api/video-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  function watch(id, el) {
    el.addEventListener('play', function () { if (!played) { played = true; send(id, 'play', 0); } });
    el.addEventListener('timeupdate', function () {
      if (!el.duration) return;
      var p = el.currentTime / el.duration;
      [[0.25, 25], [0.5, 50], [0.75, 75]].forEach(function (q) {
        if (p >= q[0] && p < q[0] + 0.2) { if (q[1] > furthest) furthest = q[1]; send(id, 'progress_' + q[1], q[1]); }
      });
    });
    el.addEventListener('ended', function () { furthest = 100; send(id, 'complete', 100); });
  }
  function callTap(id) { send(id, 'call_tap', furthest); }
  function note(id, name, code, detail) { send(id, name, code, detail); }   // 'error' (media error code) / 'blocked' (the phone refused to start it)
  return { watch: watch, callTap: callTap, note: note };
})();
document.querySelectorAll('[data-video-call]').forEach(function (a) {
  a.addEventListener('click', function () { VT.callTap(a.getAttribute('data-video-call')); });
});

// Video slots. data-youtube="<id>": swap the thumbnail for the YouTube player on tap (YouTube only loads when someone
// presses play). data-video="<file>": play a self-hosted file (data-video-small = 720p copy for phones; data-captions =
// a WebVTT file, off until the viewer turns CC on). Neither set: do nothing yet.
document.querySelectorAll('.video-slot[data-youtube], .video-slot[data-video]').forEach(function (slot) {
  slot.addEventListener('click', function (e) {
    var yt = slot.getAttribute('data-youtube'), src = slot.getAttribute('data-video');
    if (!yt && !src) { e.preventDefault(); return; }
    e.preventDefault();
    var el;
    if (yt) {
      el = document.createElement('iframe');
      el.src = 'https://www.youtube.com/embed/' + yt + '?autoplay=1&rel=0&playsinline=1';
      el.title = slot.getAttribute('aria-label') || 'Video';
      el.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      el.allowFullscreen = true;
    } else {
      var small = slot.getAttribute('data-video-small');
      var dpr = window.devicePixelRatio || 1;
      if (small && window.innerWidth * Math.min(dpr, 2) <= 1100) src = small;
      el = document.createElement('video');
      el.controls = true; el.playsInline = true; el.setAttribute('playsinline', '');
      var poster = slot.getAttribute('data-poster'); if (poster) el.poster = poster;
      el.src = src;
      var caps = slot.getAttribute('data-captions');
      if (caps) {
        var tr = document.createElement('track');
        tr.kind = 'captions'; tr.srclang = 'en'; tr.label = 'English'; tr.src = caps;
        el.appendChild(tr);
      }
      var vid = slot.getAttribute('data-video-id');
      if (vid) VT.watch(vid, el);
      el.preload = 'auto';
      if (vid) el.addEventListener('error', function () { VT.note(vid, 'error', (el.error && el.error.code) || 0); });
    }
    var box = document.createElement('div');
    box.className = slot.className + ' playing';
    if (slot.id) box.id = slot.id;
    box.appendChild(el);
    slot.replaceWith(box);
    // Start playback only once the player is on the page, still inside the tap. iPhones (Low Power Mode above all) refuse a
    // play() made on an element that is not in the document yet and show a crossed-out play button instead.
    if (el.tagName === 'VIDEO') {
      var pr = el.play();
      if (pr && pr.catch) pr.catch(function () { if (vid) VT.note(vid, 'blocked', 0); });
    }
  });
});
// Chapter buttons on a video page: jump the player to that moment. ?t=<seconds> in the URL does the same on load.
function seekPlayer(id, t, play) {
  var f = document.getElementById(id);
  if (!f) return;
  if (f.tagName === 'VIDEO') {
    var go = function () { f.currentTime = t; if (play) f.play(); };
    if (f.readyState >= 1) go(); else f.addEventListener('loadedmetadata', go, { once: true });
  } else {
    f.src = f.src.split('?')[0] + '?rel=0&playsinline=1&autoplay=1&start=' + t;
  }
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
document.querySelectorAll('[data-seek]').forEach(function (b) {
  b.addEventListener('click', function () { seekPlayer(b.getAttribute('data-player'), +b.getAttribute('data-seek'), true); });
});
(function () {
  var t = +(new URLSearchParams(location.search).get('t') || 0);
  if (t > 0) seekPlayer('player', t, false);
})();

// A player that is already in the page (.video-slot.has-player): the cover is a button; a tap hides it, shows the
// native controls and starts the video inside that same tap. If the phone refuses, the native play button is there.
document.querySelectorAll('.video-slot.has-player').forEach(function (slot) {
  var v = slot.querySelector('video'), cover = slot.querySelector('.slot-cover'), id = slot.getAttribute('data-video-id');
  if (!v) return;
  function state() { return 'net' + v.networkState + ' ready' + v.readyState + ' src:' + (v.currentSrc || '').split('/').pop(); }
  if (id) {
    VT.watch(id, v);
    v.addEventListener('error', function () { VT.note(id, 'error', (v.error && v.error.code) || 0, ((v.error && v.error.message) || '') + ' ' + state()); });
    var srcs = v.querySelectorAll('source');
    if (srcs.length) srcs[srcs.length - 1].addEventListener('error', function () { VT.note(id, 'error', 0, 'no playable source ' + state()); rescue(); });
  }
  // Some phones refuse the file when the built-in media loader asks for it, although the page itself can fetch it.
  // Rescue: fetch the small copy ourselves and hand the player the bytes. Also reports what the phone says it can play.
  var rescued = false;
  function rescue() {
    if (rescued) return; rescued = true;
    var small = (srcs[0] && srcs[0].getAttribute('src')) || '';
    var can = '';
    try { can = 'mp4:' + v.canPlayType('video/mp4') + ' avc:' + v.canPlayType('video/mp4; codecs="avc1.64001f, mp4a.40.2"') + ' base:' + v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'); } catch (e) {}
    if (!small || !window.fetch) { if (id) VT.note(id, 'diag', 0, can + ' no-fetch'); return; }
    fetch(small).then(function (r) {
      var info = can + ' http:' + r.status + ' type:' + (r.headers.get('content-type') || '') + ' redir:' + r.redirected;
      return r.blob().then(function (bl) {
        if (id) VT.note(id, 'diag', 0, info + ' bytes:' + bl.size);
        if (!r.ok || bl.size < 100000) return;
        Array.prototype.forEach.call(v.querySelectorAll('source'), function (x) { x.remove(); });
        v.src = URL.createObjectURL(bl);
        v.load();
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function (err) { if (id) VT.note(id, 'blocked', 1, 'after rescue ' + ((err && err.name) || '') + ' ' + state()); });
      });
    }).catch(function (err) { if (id) VT.note(id, 'diag', 0, can + ' fetch-failed ' + ((err && err.message) || '')); });
  }
  function start() {
    slot.classList.add('playing');
    v.controls = true;
    var pr = v.play();
    if (pr && pr.catch) pr.catch(function (err) { if (id) VT.note(id, 'blocked', 0, ((err && err.name) || '') + ' ' + state()); });
  }
  if (cover) cover.addEventListener('click', start);
});
