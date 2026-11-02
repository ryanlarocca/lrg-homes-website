/**
 * api/submit-lead.js
 * Vercel serverless endpoint for the lrghomes.com contact form.
 *
 * Website leads are call-first (Ryan, 2026-11-02). Mission Control owns
 * everything after the submit — the lead row, the mailing-list match, the
 * Telegram alert with a Call button, the "I'll call you in a few minutes"
 * text (texts-OK only), the confirmation email, and the call reminders.
 * This endpoint:
 *   1. Hands the lead to Mission Control (POST /api/leads/website-form,
 *      x-website-secret = WEBSITE_FORM_SECRET).
 *   2. Logs the lead to Google Sheets (unchanged).
 *   3. Only if Mission Control is unreachable: writes the lead to Supabase
 *      itself and texts Ryan's cell so nobody is lost.
 *
 * Before 2026-11-02 this file texted its alert to the Office — Info line,
 * which Mission Control drops as one of our own numbers — so website leads
 * reached nobody.
 *
 * Auth for Sheets: OAuth2 with refresh token (info@lrghomes.com account).
 * Always returns 200 regardless of downstream failures.
 */

const { google } = require('googleapis');

const ABOUT_LABELS = { sell: 'Sell a property', deal: 'Bring a deal', other: 'Something else' };

// ─── Google OAuth2 Client ─────────────────────────────────────────────────────

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN');
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

// ─── Twilio SMS ───────────────────────────────────────────────────────────────

async function sendSms(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.warn('[submit-lead] Twilio credentials missing — skipping SMS');
    return false;
  }

  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) {
    console.warn(`[submit-lead] Invalid phone number for SMS: ${to}`);
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: normalizedTo, From: from, Body: body });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
    },
    body: params.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[submit-lead] Twilio error:', data.message || response.status);
    return false;
  }
  console.log(`[submit-lead] SMS sent to ${normalizedTo} — SID: ${data.sid}`);
  return true;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 7) return `+${digits}`;
  return null;
}

// ─── Google Sheets API (OAuth2) ───────────────────────────────────────────────

async function logToSheets({ fullName, email, phone, address, notes, source }) {
  const sheetId = process.env.LEAD_SHEET_ID;
  const sheetTab = process.env.LEAD_SHEET_TAB || 'Google Ads';

  if (!sheetId) {
    console.warn('[submit-lead] LEAD_SHEET_ID not set — skipping Sheets');
    return false;
  }

  try {
    const auth = getOAuth2Client();
    const sheets = google.sheets({ version: 'v4', auth });

    // Match sheet headers: Name | Email | Phone | Property Address | Source | Status | Last Contact Date | Notes
    const row = [
      fullName,
      email,
      phone,
      address,
      source,
      'New Lead',
      new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }),
      notes || '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${sheetTab}'!A:H`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    console.log('[submit-lead] Lead logged to Google Sheets');
    return true;
  } catch (err) {
    console.error('[submit-lead] Sheets API error:', err.message);
    return false;
  }
}

// ─── Supabase (CRMS leads table) ──────────────────────────────────────────────

async function logToSupabase({ fullName, email, phone, address, about, message, smsConsent }) {
  const url = process.env.LRG_SUPABASE_URL;
  const key = process.env.LRG_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.warn('[submit-lead] Supabase credentials missing — skipping CRMS log');
    return false;
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    console.warn(`[submit-lead] Invalid phone for Supabase: ${phone}`);
    return false;
  }

  const row = {
    name: fullName || null,
    email: email || null,
    caller_phone: normalizedPhone,
    property_address: address || null,
    // "Website" is the label Mission Control shows; source_type "website" is
    // the bucket (lib/leads.ts in mission-control). The old "Google Ads" /
    // google_ads values stay on historical rows only.
    source: 'Website',
    source_type: 'website',
    lead_type: 'form',
    // The Website line — the form is the lead talking (inbound), and the
    // card's Call / text buttons resolve to the line they know.
    twilio_number: '+16506703914',
    status: 'new',
    sms_consent: smsConsent,
    // Mission Control's 5-minute sweep picks this up and runs the call
    // reminders even though its intake route never saw the lead.
    website_ladder: about === 'sell' ? 'calling' : null,
    message: [`[Website form · ${ABOUT_LABELS[about] || about}]`, message].filter(Boolean).join(' '),
  };
  try {
    const response = await fetch(`${url}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[submit-lead] Supabase insert failed ${response.status}: ${errText}`);
      return false;
    }
    console.log('[submit-lead] Lead logged to Supabase CRMS (fallback)');
    return true;
  } catch (err) {
    console.error('[submit-lead] Supabase error:', err.message);
    return false;
  }
}

// ─── Mission Control hand-off ─────────────────────────────────────────────────

const MC_BASE = 'https://mission-control-three-chi.vercel.app';

async function sendToMissionControl(payload) {
  const secret = (process.env.WEBSITE_FORM_SECRET || '').trim();
  if (!secret) {
    console.error('[submit-lead] WEBSITE_FORM_SECRET not set — cannot reach Mission Control');
    return false;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${MC_BASE}/api/leads/website-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-website-secret': secret },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[submit-lead] Mission Control ${res.status}:`, json.error || '');
      return false;
    }
    console.log('[submit-lead] Mission Control took the lead:', JSON.stringify(json));
    return true;
  } catch (err) {
    console.error('[submit-lead] Mission Control unreachable:', err.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  const fullName = (body.fullName || `${body.firstName || ''} ${body.lastName || ''}`.trim()).trim();
  const { email, phone, propertyAddress, address, propertyType } = body;
  const cleanAddress = (propertyAddress || address || '').trim();
  const about = ABOUT_LABELS[body.about] ? body.about : 'sell';
  const aboutLabel = ABOUT_LABELS[about];
  const message = String(body.message || propertyType || '').trim().slice(0, 1000);
  const smsConsent = body.smsConsent === true || body.smsConsent === 'on' || body.smsConsent === 'true';
  const leadSource = 'Website';
  const timestamp = new Date().toISOString();

  console.log(`[submit-lead] ${timestamp} — Incoming lead:`, {
    fullName,
    email: email || '(none)',
    phone,
    address: cleanAddress || '(none)',
    about,
    smsConsent,
    message: message || '(none)',
  });

  if (!fullName) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return res.status(400).json({ error: 'phone is required' });
  }

  // Bot defense — honeypot + timing. Return 200 so bots think it worked.
  const honeypot = (body.fax_number || '').trim();
  const elapsed = parseInt(body._t, 10);
  // Fail-closed: missing or non-numeric _t is treated as 0ms (reject).
  if (honeypot || !Number.isFinite(elapsed) || elapsed < 3000) {
    console.warn(`[submit-lead] Bot rejected — honeypot:"${honeypot}" elapsed:${elapsed}ms name:"${fullName}"`);
    return res.status(200).json({ success: true, message: 'Lead received' });
  }

  const cleanPhone = phone.trim();
  const cleanEmail = email ? email.trim() : '';

  // ── 1. Mission Control (alert, texts, email, call reminders) + Sheets ────
  const [mc, sheets] = await Promise.all([
    sendToMissionControl({
      fullName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      about,
      message,
      smsConsent,
    }),
    logToSheets({
      fullName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      notes: [aboutLabel, message].filter(Boolean).join(' — '),
      source: leadSource,
    }).catch((err) => {
      console.error('[submit-lead] Sheets log error:', err.message);
      return false;
    }),
  ]);

  // ── 2. Fallback — Mission Control didn't take it: save the lead and text
  // Ryan's cell (never the office line: Mission Control drops texts from
  // our own numbers, which is how website leads went missing).
  let supabase = null;
  let ryanSms = null;
  if (!mc) {
    supabase = await logToSupabase({
      fullName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      about,
      message,
      smsConsent,
    }).catch((err) => {
      console.error('[submit-lead] Supabase log error:', err.message);
      return false;
    });
    ryanSms = await sendSms(
      '+14085006293',
      [
        `⚠️ WEBSITE LEAD — Mission Control didn't respond, call them yourself`,
        `${fullName} · ${cleanPhone}`,
        cleanAddress || null,
        message ? `"${message.slice(0, 200)}"` : null,
        `Saved to CRMS: ${supabase ? 'yes' : 'NO'}`,
      ].filter(Boolean).join('\n')
    ).catch((err) => {
      console.error('[submit-lead] SMS to Ryan error:', err.message);
      return false;
    });
  }

  const results = { missionControl: mc, sheets, supabase, ryanSms };
  console.log(`[submit-lead] ${timestamp} — Results:`, results);

  return res.status(200).json({
    success: true,
    message: 'Lead received',
    results,
  });
};
