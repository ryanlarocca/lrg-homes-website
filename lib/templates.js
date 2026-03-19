/**
 * lib/templates.js
 * Message templates for SMS and email responses
 */

/**
 * Build the SMS message for a new lead.
 * @param {string} fullName - Lead's full name
 * @returns {string} Formatted SMS string (~190 chars)
 */
function buildSmsMessage(fullName) {
  const firstName = fullName.trim().split(' ')[0];
  return `Hey ${firstName}! Thanks for requesting your quote from LRG Homes. Are you planning to make a move in the very near future? Reply here or call +14084930632.`;
}

/**
 * Build the HTML email body for a new lead.
 * @param {string} fullName - Lead's full name
 * @returns {string} HTML email body
 */
function buildEmailBody(fullName) {
  const firstName = fullName.trim().split(' ')[0];
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #222; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a1a; color: #c9a84c; padding: 20px; border-radius: 8px 8px 0 0; }
    .body { background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; }
    .footer { margin-top: 20px; font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h2 style="margin:0;">LRGHomes</h2>
  </div>
  <div class="body">
    <p>Hi ${firstName},</p>
    <p>Thanks for filling out the form. We're reviewing your information now and we'll be right with you soon.</p>
    <p>Reply to this email or call <strong>+1 (408) 493-0632</strong> if you have any questions.</p>
    <p>— LRG Homes Team</p>
  </div>
  <div class="footer">
    <p>LRG Homes LLC · Bay Area, California · <a href="mailto:info@lrghomes.com">info@lrghomes.com</a></p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Build the plain-text email body (fallback).
 * @param {string} fullName - Lead's full name
 * @returns {string} Plain text email body
 */
function buildEmailText(fullName) {
  const firstName = fullName.trim().split(' ')[0];
  return [
    `Hi ${firstName},`,
    '',
    "Thanks for filling out the form. We're reviewing your information now and we'll be right with you soon.",
    '',
    'Reply to this email or call +1 (408) 493-0632 if you have any questions.',
    '',
    '— LRG Homes Team',
  ].join('\n');
}

module.exports = { buildSmsMessage, buildEmailBody, buildEmailText };
