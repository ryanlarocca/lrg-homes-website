/**
 * api/submit-lead.js
 * Vercel serverless endpoint — no Mac mini, no tunnels.
 *
 * On form submission:
 *   1. Sends SMS to Ryan via Twilio
 *   2. Sends confirmation email to lead via Gmail API (OAuth2)
 *   3. Logs lead to Google Sheets via Sheets API (OAuth2)
 *   4. Sends SMS to lead via Twilio (may show undelivered until A2P registration)
 *
 * Auth: OAuth2 with refresh token (info@lrghomes.com account)
 * Always returns 200 regardless of downstream failures.
 */

const { google } = require('googleapis');

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

// ─── Gmail API (OAuth2 as info@lrghomes.com) ──────────────────────────────────

function buildRawEmail({ to, from, subject, textBody }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    textBody,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendEmail({ to, subject, textBody }) {
  if (!to) {
    console.warn('[submit-lead] No email address — skipping confirmation email');
    return false;
  }

  const sender = process.env.GMAIL_SENDER || 'info@lrghomes.com';

  try {
    const auth = getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = buildRawEmail({ to, from: sender, subject, textBody });
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    console.log(`[submit-lead] Confirmation email sent to ${to}`);
    return true;
  } catch (err) {
    console.error('[submit-lead] Gmail API error:', err.message);
    return false;
  }
}

// ─── Google Sheets API (OAuth2) ───────────────────────────────────────────────

async function logToSheets({ timestamp, fullName, email, phone, address, propertyType }) {
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
      'Google Ads',
      'New Lead',
      new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }),
      propertyType || '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetTab}!A:H`,
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

// ─── Main handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  const fullName = (body.fullName || `${body.firstName || ''} ${body.lastName || ''}`.trim()).trim();
  const { email, phone, propertyAddress, address, propertyType } = body;
  const cleanAddress = (propertyAddress || address || '').trim();
  const timestamp = new Date().toISOString();

  console.log(`[submit-lead] ${timestamp} — Incoming lead:`, {
    fullName,
    email: email || '(none)',
    phone,
    address: cleanAddress || '(none)',
    propertyType: propertyType || '(none)',
  });

  if (!fullName) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return res.status(400).json({ error: 'phone is required' });
  }

  const cleanPhone = phone.trim();
  const cleanEmail = email ? email.trim() : '';
  const firstName = fullName.split(' ')[0];

  // ── 0. Fire Mac mini for AppleScript SMS (temp until Twilio A2P approved) ──
  const macMiniUrl = process.env.MAC_MINI_LEAD_WEBHOOK_URL;
  const macSecret = process.env.MAC_MINI_WEBHOOK_SECRET;
  if (macMiniUrl) {
    fetch(`${macMiniUrl}/lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'Bypass-Tunnel-Reminder': 'true',
        ...(macSecret ? { 'x-webhook-secret': macSecret } : {}),
      },
      body: JSON.stringify({ fullName, email: cleanEmail, phone: cleanPhone, address: cleanAddress, propertyType: propertyType || '' }),
    }).catch((err) => console.error('[submit-lead] Mac mini SMS error:', err.message));
  }

  // ── 1. SMS to Ryan ──────────────────────────────────────────────────────────
  const smsToRyan = sendSms(
    '+14084930632',
    `\uD83D\uDD14 NEW LEAD\nName: ${fullName}\nPhone: ${cleanPhone}\nAddress: ${cleanAddress || '(none)'}\nTime: ${timestamp}`
  ).catch((err) => {
    console.error('[submit-lead] SMS to Ryan error:', err.message);
    return false;
  });

  // ── 2. Confirmation email to lead ───────────────────────────────────────────
  const emailBody = [
    `Hey ${firstName},`,
    '',
    'Thanks for reaching out. We will be taking a look at the property and getting back to you as soon as possible.',
    '',
    'In the meantime, could you let us know when you are planning to make the move? That will help us put together the best offer for you.',
    '',
    'Feel free to reply to this email or call us anytime at +1 (408) 493-0632.',
    '',
    '\u2014 Ryan LaRocca',
    'LRG Homes',
    '+1 (408) 493-0632',
    'info@lrghomes.com',
  ].join('\n');

  const emailToLead = sendEmail({
    to: cleanEmail,
    subject: `Thanks for reaching out, ${firstName}!`,
    textBody: emailBody,
  }).catch((err) => {
    console.error('[submit-lead] Email to lead error:', err.message);
    return false;
  });

  // ── 3. Google Sheets logging ────────────────────────────────────────────────
  const sheetsLog = logToSheets({
    timestamp,
    fullName,
    email: cleanEmail,
    phone: cleanPhone,
    address: cleanAddress,
    propertyType: propertyType || '',
  }).catch((err) => {
    console.error('[submit-lead] Sheets log error:', err.message);
    return false;
  });

  // ── 4. SMS to lead ──────────────────────────────────────────────────────────
  const smsToLead = sendSms(
    cleanPhone,
    `Hey ${firstName}, thanks for reaching out to LRG Homes! We're taking a look at your property and will be in touch shortly. In the meantime, when are you planning to make the move? \u2014 Ryan +1 (408) 493-0632`
  ).catch((err) => {
    console.error('[submit-lead] SMS to lead error:', err.message);
    return false;
  });

  // Wait for all in parallel
  const [sms, emailSent, sheets, smsLead] = await Promise.all([
    smsToRyan,
    emailToLead,
    sheetsLog,
    smsToLead,
  ]);

  const results = { sms, email: emailSent, sheets, smsLead };
  console.log(`[submit-lead] ${timestamp} — Results:`, results);

  return res.status(200).json({
    success: true,
    message: 'Lead received',
    results,
  });
};
