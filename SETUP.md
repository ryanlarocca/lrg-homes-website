# LRG Homes Lead Capture — Setup & Operations

## Architecture

```
[lrghomes-landing.vercel.app] → form submit
    ↓
[Vercel API: /api/submit-lead]
    ├── Twilio REST API → SMS to Ryan (+14084930632) ⚠️ requires account upgrade
    └── Mac mini webhook (localhost:3002 → loca.lt tunnel)
            ├── gog sheets append → Google Sheets (Lead Tracker / Google Ads tab)
            └── gog gmail send → Confirmation email to lead
```

## Live URLs

- **Landing page:** https://www.lrghomes.com
- **API endpoint:** https://www.lrghomes.com/api/submit-lead
- **Google Sheet:** https://docs.google.com/spreadsheets/d/1ABI4m9aLc9FrNB7rQOk1Rqco6FE2Eg4i6nZtafQPxIE

## Local Services (Mac Mini)

Two LaunchAgents run permanently (auto-restart on reboot):

| Service | Plist | Port |
|---------|-------|------|
| Lead webhook server | `com.lrghomes.lead-webhook.plist` | 3002 |
| Localtunnel (expose webhook) | `com.lrghomes.lead-tunnel.plist` | loca.lt |

### Check status
```bash
launchctl list | grep lrghomes
curl http://localhost:3002/
```

### Restart services
```bash
launchctl unload ~/Library/LaunchAgents/com.lrghomes.lead-webhook.plist
launchctl load ~/Library/LaunchAgents/com.lrghomes.lead-webhook.plist
```

## Vercel Environment Variables

| Variable | Value |
|----------|-------|
| `TWILIO_ACCOUNT_SID` | ACcf5c1949... |
| `TWILIO_AUTH_TOKEN` | 657c2210... |
| `TWILIO_FROM_NUMBER` | +18557636014 |
| `RYAN_PHONE` | +14084930632 |
| `MAC_MINI_LEAD_WEBHOOK_URL` | https://lrghomes-leads.loca.lt |
| `MAC_MINI_WEBHOOK_SECRET` | lrghomes-webhook-2024 |

## ⚠️ ACTION REQUIRED: Twilio Trial Upgrade

**SMS to Ryan is blocked** because the Twilio account is on a trial plan.
Trial accounts can only send SMS to pre-verified numbers.

**To fix:**
1. Go to https://www.twilio.com/console
2. Upgrade to a paid plan (~$15 to load balance)
3. SMS to +14084930632 will immediately start working

**Current Twilio phone number:** +18557636014 (855-763-6014)

## Testing

```bash
# Test the full pipeline
curl -X POST https://www.lrghomes.com/api/submit-lead \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test Person",
    "email": "ryan@lrghomes.com",
    "phone": "4085559999",
    "propertyAddress": "123 Test St, San Jose, CA",
    "propertyType": "Single Family"
  }'

# Expected: {"success":true,"results":{"sms":true,"sheets":true,"email":true}}
# (sms=false until Twilio upgraded)
```

## Log Files

```bash
tail -f ~/.openclaw/workspace/lrg-homes-website/logs/lead-webhook.log
tail -f ~/.openclaw/workspace/lrg-homes-website/logs/lead-tunnel.log
```
