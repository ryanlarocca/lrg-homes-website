/**
 * scripts/lead-webhook-server.js
 * Mac mini webhook — handles SMS ONLY via AppleScript.
 * Email and Sheets are handled directly by Vercel (no duplication).
 */

const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3002;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'LRG Homes Lead Webhook' });
});

app.post('/lead', async (req, res) => {
  const timestamp = new Date().toISOString();

  if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
    console.warn(`[${timestamp}] Unauthorized`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { fullName, email, phone, address, propertyType } = req.body || {};
  console.log(`[${timestamp}] New lead (SMS only):`, { fullName, phone });

  const results = { sms: false, leadSms: false };

  // SMS to Ryan
  try {
    const smsBody = `🔔 NEW LEAD\nName: ${fullName || 'Unknown'}\nPhone: ${phone || 'N/A'}\nAddress: ${address || 'N/A'}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`;
    const escaped = smsBody.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const script = `tell application "Messages"\nset s to 1st service whose service type is SMS\nsend "${escaped}" to buddy "+14084930632" of s\nend tell`;
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 15000 });
    console.log(`[${timestamp}] SMS to Ryan sent`);
    results.sms = true;
  } catch (err) {
    console.error(`[${timestamp}] SMS to Ryan error:`, err.message);
  }

  // SMS to lead
  if (phone) {
    try {
      const firstName = (fullName || 'there').trim().split(' ')[0];
      const leadMsg = `Hey ${firstName}, thanks for reaching out to LRG Homes! We're taking a look at your property and will be in touch shortly. In the meantime, when are you planning to make the move? — Ryan +1 (408) 493-0632`;
      const escapedLead = leadMsg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const cleanPhone = phone.replace(/\D/g, '');
      const e164 = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;
      const leadScript = `tell application "Messages"\nset s to 1st service whose service type is SMS\nsend "${escapedLead}" to buddy "${e164}" of s\nend tell`;
      await execAsync(`osascript -e '${leadScript.replace(/'/g, "'\\''")}'`, { timeout: 15000 });
      console.log(`[${timestamp}] SMS to lead sent`);
      results.leadSms = true;
    } catch (err) {
      console.error(`[${timestamp}] SMS to lead error:`, err.message);
    }
  }

  res.json({ success: true, results });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`[lead-webhook] Running on port ${PORT} — SMS only`);
});
