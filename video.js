// Video slots. data-youtube="<id>": swap the thumbnail for the YouTube player on tap (YouTube only loads when someone
// presses play). data-video="<file>": play a self-hosted file. Neither set: do nothing yet.
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
      el = document.createElement('video');
      el.src = src; el.controls = true; el.autoplay = true; el.playsInline = true;
    }
    var box = document.createElement('div');
    box.className = slot.className + ' playing';
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
