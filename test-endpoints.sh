#!/usr/bin/env bash
# test-endpoints.sh
# Quick curl tests to verify each component works independently.
# Run locally or from any machine that can reach the endpoints.

set -euo pipefail

# ─── CONFIG ──────────────────────────────────────────────────────────────────
VERCEL_URL="${VERCEL_URL:-https://lrghomes.com}"          # your deployed URL
MAC_WEBHOOK_URL="${MAC_MINI_WEBHOOK_URL:-http://localhost:3001/send-sms}"
MAC_SECRET="${MAC_MINI_WEBHOOK_SECRET:-changeme}"
# ─────────────────────────────────────────────────────────────────────────────

echo "=== TEST 1: Mac mini webhook server health check ==="
curl -s "${MAC_WEBHOOK_URL%/send-sms}" | python3 -m json.tool || echo "(server may not be running)"
echo ""

echo "=== TEST 2: Mac mini webhook — send test SMS ==="
curl -s -X POST "${MAC_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: ${MAC_SECRET}" \
  -d '{"phone":"+14085550000","message":"Test SMS from webhook server."}' | python3 -m json.tool
echo ""

echo "=== TEST 3: Mac mini webhook — reject bad secret ==="
curl -s -X POST "${MAC_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: wrong-secret" \
  -d '{"phone":"+14085550000","message":"Should fail."}' | python3 -m json.tool
echo ""

echo "=== TEST 4: Vercel /api/submit-lead — valid lead ==="
curl -s -X POST "${VERCEL_URL}/api/submit-lead" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Smith",
    "email": "john@example.com",
    "phone": "+14085550000",
    "propertyAddress": "123 Main St, San Jose, CA"
  }' | python3 -m json.tool
echo ""

echo "=== TEST 5: Vercel /api/submit-lead — missing phone (should 400) ==="
curl -s -X POST "${VERCEL_URL}/api/submit-lead" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"John Smith"}' | python3 -m json.tool
echo ""

echo "=== TEST 6: Vercel /api/submit-lead — missing name (should 400) ==="
curl -s -X POST "${VERCEL_URL}/api/submit-lead" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+14085550000"}' | python3 -m json.tool
echo ""

echo "=== TEST 7: Vercel /api/submit-lead — no email (SMS + Sheets only) ==="
curl -s -X POST "${VERCEL_URL}/api/submit-lead" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "phone": "+14085550001"
  }' | python3 -m json.tool
echo ""

echo "All tests complete."
