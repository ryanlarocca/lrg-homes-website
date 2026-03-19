/**
 * scripts/sms-webhook-server.js
 * Standalone Mac mini webhook server.
 * Receives POST /send-sms from Vercel and sends iMessage via AppleScript.
 *
 * Run:
 *   cd ~/scripts
 *   npm install express body-parser
 *   node sms-webhook-server.js
 *
 * Then expose publicly:
 *   ngrok http 3001
 *   # Copy the HTTPS URL → set MAC_MINI_WEBHOOK_URL in Vercel
 */

const express = require('express');
const bodyParser = require('body-parser');
const { execFile } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('[sms-webhook] ERROR: WEBHOOK_SECRET env var is not set!');
  console.error('[sms-webhook] Run: WEBHOOK_SECRET=your-secret-here node sms-webhook-server.js');
  process.exit(1);
}

app.use(bodyParser.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'LRG Homes SMS Webhook' });
});

// SMS endpoint
app.post('/send-sms', (req, res) => {
  const timestamp = new Date().toISOString();

  // Auth check
  const providedSecret = req.headers['x-webhook-secret'];
  if (!providedSecret || providedSecret !== WEBHOOK_SECRET) {
    console.warn(`[${timestamp}] /send-sms — 401 Unauthorized (bad or missing secret)`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { phone, message } = req.body || {};

  // Validate inputs
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    console.warn(`[${timestamp}] /send-sms — 400 Missing phone`);
    return res.status(400).json({ success: false, error: 'phone is required' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    console.warn(`[${timestamp}] /send-sms — 400 Missing message`);
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  // Sanitize inputs to prevent shell injection
  const cleanPhone = phone.trim().replace(/[^0-9+\-() ]/g, '');
  const cleanMessage = message.trim().replace(/"/g, '\\"'); // escape double quotes

  console.log(`[${timestamp}] /send-sms — Sending to ${cleanPhone}: "${cleanMessage.substring(0, 60)}..."`);

  // Path to AppleScript — resolve relative to this file's directory
  const scptPath = path.join(__dirname, 'send-imessage.scpt');

  execFile('osascript', [scptPath, cleanPhone, cleanMessage], { timeout: 15000 }, (err, stdout, stderr) => {
    if (err) {
      console.error(`[${timestamp}] /send-sms — AppleScript error:`, err.message);
      if (stderr) console.error(`[${timestamp}] stderr:`, stderr);
      return res.status(500).json({ success: false, error: err.message });
    }

    if (stdout) console.log(`[${timestamp}] /send-sms — stdout:`, stdout.trim());
    console.log(`[${timestamp}] /send-sms — SMS sent successfully to ${cleanPhone}`);
    res.json({ success: true });
  });
});

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`[sms-webhook] Server running on port ${PORT}`);
  console.log(`[sms-webhook] POST http://localhost:${PORT}/send-sms`);
  console.log(`[sms-webhook] Remember to expose via ngrok: ngrok http ${PORT}`);
});
