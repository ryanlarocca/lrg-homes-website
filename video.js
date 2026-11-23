// Video slots. data-youtube="<id>": swap the thumbnail for the YouTube player on tap (YouTube only loads when someone
// presses play). data-video="<file>": play a self-hosted file. Neither set: do nothing yet.
// Play + viewing stats. Each event is sent once per page view, to the Google tag (if present) and to /api/video-event.
// No cookies and no personal data: a random session id lives in sessionStorage only.
var VT = (function () {
  var sent = {}, played = false, furthest = 0, sid = null;
  try { sid = sessionStorage.getItem('lrg-vsid'); if (!sid) { sid = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('lrg-vsid', sid); } } catch (e) { sid = Math.random().toString(36).slice(2); }
  function send(id, name, quartile) {
    var key = id + ':' + name;
    if (sent[key]) return;
    sent[key] = true;
    var payload = { video_id: id, event: name, quartile: quartile || 0, played: played, path: location.pathname, referrer: document.referrer || '', vw: window.innerWidth, sid: sid };
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
  return { watch: watch, callTap: callTap };
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
      var go = function () { var pr = el.play(); if (pr && pr.catch) pr.catch(function () {}); };
      el.preload = 'auto'; go();
    }
    var box = document.createElement('div');
    box.className = slot.className + ' playing';
    if (slot.id) box.id = slot.id;
    box.appendChild(el);
    slot.replaceWith(box);
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
