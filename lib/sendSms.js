/**
 * lib/sendSms.js
 * Sends SMS to Ryan (property owner) via Twilio REST API.
 * Notifies of a new lead with name, phone, and address.
 */

const TIMEOUT_MS = 10000;

/**
 * Send an SMS to Ryan via Twilio.
 * @param {object} lead - Lead details
 * @param {string} lead.fullName - Lead's full name
 * @param {string} lead.phone - Lead's phone number
 * @param {string} [lead.address] - Property address
 * @returns {Promise<boolean>} true if sent successfully, false otherwise
 */
async function sendSms({ fullName, phone, address } = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+18557636014';
  const toNumber = process.env.RYAN_PHONE || '+14084930632';

  if (!accountSid || !authToken) {
    console.error('[sendSms] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set — skipping SMS');
    return false;
  }

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const message = [
    '🔔 NEW LEAD',
    `Name: ${fullName || 'Unknown'}`,
    `Phone: ${phone || 'N/A'}`,
    address ? `Address: ${address}` : null,
    `Time: ${timestamp}`,
  ].filter(Boolean).join('\n');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const body = new URLSearchParams({
    To: toNumber,
    From: fromNumber,
    Body: message,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    console.log(`[sendSms] Sending Twilio SMS for lead: ${fullName} (${phone})`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[sendSms] Twilio error (${res.status}):`, data.message || data.code);
      return false;
    }

    console.log(`[sendSms] SMS sent via Twilio. SID: ${data.sid}`);
    return true;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.error('[sendSms] Twilio request timed out after 10s');
    } else {
      console.error('[sendSms] Error:', err.message);
    }
    return false;
  }
}

module.exports = { sendSms };
