#!/bin/bash
# Restart dashboard and verify login page text
# Run on server: bash restart-and-verify.sh

set -e

cd /opt/veridion-nexus

echo "=== Step 1: Rebuilding dashboard (no cache) ==="
docker compose -f docker-compose.prod.yml --env-file .env build --no-cache dashboard

echo ""
echo "=== Step 2: Restarting dashboard container ==="
docker compose -f docker-compose.prod.yml --env-file .env up -d dashboard

echo ""
echo "=== Step 3: Waiting for dashboard to be ready ==="
sleep 5

echo ""
echo "=== Step 4: Checking dashboard container status ==="
docker compose -f docker-compose.prod.yml --env-file .env ps dashboard

echo ""
echo "=== Step 5: Checking dashboard logs (last 10 lines) ==="
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=10 dashboard

echo ""
echo "=== Step 6: Verifying login page source code ==="
echo "Checking if 'Sign up' text exists in container..."
docker compose -f docker-compose.prod.yml --env-file .env exec dashboard grep -r "Sign up" /app/dashboard/app/login/ 2>/dev/null || echo "⚠️  Could not find 'Sign up' in container (this is normal if Next.js is compiled)"

echo ""
echo "=== Step 7: Testing login page endpoint ==="
curl -s http://localhost:3000/login | grep -i "sign up" && echo "✅ Found 'Sign up' in HTML" || echo "⚠️  'Sign up' not found in HTML (may be client-side rendered)"

echo ""
echo "=== Verification complete ==="
echo "Dashboard should be restarted. Please check:"
echo "1. Hard refresh browser: Ctrl+Shift+R"
echo "2. Check: https://app.veridion-nexus.eu/login"
echo "3. Look for: 'Don't have an account? Sign up'"
