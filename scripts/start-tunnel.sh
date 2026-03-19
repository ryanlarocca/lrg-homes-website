#!/bin/bash
# start-tunnel.sh
# Starts localtunnel to expose the lead webhook server publicly
# Run this once after system startup or whenever the tunnel dies

# Wait for webhook server to be ready
for i in {1..10}; do
  if curl -s http://localhost:3002/ > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Start localtunnel
exec /opt/homebrew/bin/lt --port 3002 --subdomain lrghomes-lead 2>&1
