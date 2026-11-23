/**
 * api/video-event.js
 * Records one website video event (play, progress_25/50/75, complete, call_tap) in Supabase table
 * public.site_video_events. No cookies, no IP address stored. Always answers 204 and never throws:
 * if the table is missing or Supabase is down the event is just dropped (logged to the function console).
 */

const EVENTS = ['play', 'progress_25', 'progress_50', 'progress_75', 'complete', 'call_tap', 'error', 'blocked', 'diag'];
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|monitor|preview|curl|wget|python|node-fetch|axios|go-http/i;

function clean(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : null;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end();
    }
    const ua = String(req.headers['user-agent'] || '');
    if (!ua || BOT_RE.test(ua)) return res.status(204).end();

    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
    if (!b || typeof b !== 'object') return res.status(204).end();

    const video_id = typeof b.video_id === 'string' ? b.video_id : '';
    const event = typeof b.event === 'string' ? b.event : '';
    if (!video_id || video_id.length > 40 || !/^[a-z0-9-]+$/.test(video_id) || EVENTS.indexOf(event) === -1) {
      return res.status(204).end();
    }

    const url = process.env.LRG_SUPABASE_URL;
    const key = process.env.LRG_SUPABASE_SERVICE_KEY;
    if (!url || !key) return res.status(204).end();

    const q = Number(b.quartile);
    const vw = Number(b.vw);
    const row = {
      video_id,
      event,
      quartile: Number.isFinite(q) ? Math.max(0, Math.min(100, Math.round(q))) : null,
      played: typeof b.played === 'boolean' ? b.played : null,
      path: clean(b.path, 200),
      referrer: clean(b.referrer, 300),
      viewport_w: Number.isFinite(vw) ? Math.max(0, Math.min(10000, Math.round(vw))) : null,
      session_id: clean(b.sid, 64),
      detail: clean(b.detail, 300) || null,
      user_agent: ua.slice(0, 300),
      country: clean(String(req.headers['x-vercel-ip-country'] || ''), 2) || null,
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(`${url}/rest/v1/site_video_events`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
        signal: ctrl.signal,
      });
      if (!r.ok) console.error('[video-event] insert failed', r.status, (await r.text().catch(() => '')).slice(0, 200));
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error('[video-event]', err && err.message);
  }
  return res.status(204).end();
};
