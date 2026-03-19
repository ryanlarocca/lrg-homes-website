/**
 * lib/logToSheets.js
 * Logs lead to Mac mini webhook, which calls gog to append to Google Sheets.
 * Sheet ID: 1ABI4m9aLc9FrNB7rQOk1Rqco6FE2Eg4i6nZtafQPxIE
 * Tab: Google Ads
 */

const TIMEOUT_MS = 12000;

/**
 * Log a lead to Google Sheets via Mac mini webhook.
 * @param {object} lead
 * @returns {Promise<boolean>}
 */
async function logToSheets({ fullName, email, phone, propertyAddress, propertyType }) {
  const webhookUrl = process.env.MAC_MINI_LEAD_WEBHOOK_URL;
  const secret = process.env.MAC_MINI_WEBHOOK_SECRET;

  if (!webhookUrl) {
    console.error('[logToSheets] MAC_MINI_LEAD_WEBHOOK_URL not set — skipping sheet log');
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(webhookUrl + '/lead', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-webhook-secret': secret } : {}),
      },
      body: JSON.stringify({
        fullName,
        email,
        phone,
        address: propertyAddress,
        propertyType,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[logToSheets] Webhook error (${res.status}):`, data);
      return false;
    }

    console.log(`[logToSheets] Lead logged: ${fullName} (${phone})`);
    return data.results?.sheets ?? true;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.error('[logToSheets] Webhook timed out');
    } else {
      console.error('[logToSheets] Error:', err.message);
    }
    return false;
  }
}

module.exports = { logToSheets };
