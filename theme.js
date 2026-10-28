/* Picks the site's look before the page paints (loaded in <head>, not deferred).
 *
 *   1. ?look=night or ?look=daylight in the URL wins — for checking a look by hand.
 *      It is not remembered.
 *   2. A device set to dark mode (phone or computer) gets Night.
 *   3. Otherwise the visitor's own clock decides: Night from 7 pm to 6 am.
 *
 * Re-checked when the device switches appearance and when the tab comes back
 * into view, so a page left open across 7 pm follows along.
 */
(function () {
  var root = document.documentElement;
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function look() {
    var forced = new URLSearchParams(location.search).get('look');
    if (forced === 'night' || forced === 'daylight') return forced;
    if (dark && dark.matches) return 'night';
    var hour = new Date().getHours();
    return hour >= 19 || hour < 6 ? 'night' : 'daylight';
  }

  function apply() {
    var night = look() === 'night';
    if (night) root.setAttribute('data-theme', 'night');
    else root.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', night ? '#121311' : '#f7f4ee');
  }

  apply();
  if (dark) {
    if (dark.addEventListener) dark.addEventListener('change', apply);
    else if (dark.addListener) dark.addListener(apply);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') apply();
  });
})();
