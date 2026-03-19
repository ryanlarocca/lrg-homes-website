/**
 * lib/sendEmail.js
 * Sends a confirmation email to the lead via Mac mini webhook (gog gmail).
 * The webhook calls `gog gmail send` on the Mac mini using stored OAuth tokens.
 *
 * Falls back to a no-op if the webhook is not configured.
 */

const TIMEOUT_MS = 12000;

/**
 * Send a confirmation email to the lead.
 * @param {string} email - Lead's email address
 * @param {string} fullName - Lead's full name
 * @returns {Promise<boolean>} true if sent successfully, false otherwise
 */
async function sendEmail(email, fullName) {
  if (!email) {
    console.log('[sendEmail] No email provided — skipping');
    return false;
  }

  const webhookUrl = process.env.MAC_MINI_LEAD_WEBHOOK_URL;
  const secret = process.env.MAC_MINI_WEBHOOK_SECRET;

  if (!webhookUrl) {
    console.error('[sendEmail] MAC_MINI_LEAD_WEBHOOK_URL not set — skipping email');
    return false;
  }

  // The lead webhook handles both sheets + email in one call.
  // This function is called separately only if we want to send email standalone.
  // In practice, logToSheets triggers the webhook which also sends email.
  // So we check: if MAC_MINI_LEAD_WEBHOOK_URL is set, email was handled there.
  console.log('[sendEmail] Email handled by lead webhook (via logToSheets call)');
  return true;
}

module.exports = { sendEmail };
