#!/bin/bash
# Force update login page - clear all caches and rebuild
# Run on server: bash force-update-login.sh

set -e

cd /opt/veridion-nexus

echo "=== Step 1: Pulling latest code from git ==="
git pull origin main || git pull origin master

echo ""
echo "=== Step 2: Verifying login page has 'Sign up' text ==="
if grep -q "Sign up" dashboard/app/login/page.tsx; then
    echo "✅ Found 'Sign up' in source code"
else
    echo "❌ ERROR: 'Sign up' not found in source code!"
    echo "Current text:"
    grep -A 2 "Don't have an account" dashboard/app/login/page.tsx
    exit 1
fi

echo ""
echo "=== Step 3: Removing old dashboard container ==="
docker compose -f docker-compose.prod.yml --env-file .env stop dashboard || true
docker compose -f docker-compose.prod.yml --env-file .env rm -f dashboard || true

echo ""
echo "=== Step 4: Removing dashboard image to force rebuild ==="
docker rmi veridion-nexus-dashboard 2>/dev/null || true
docker rmi $(docker images | grep veridion-nexus.*dashboard | awk '{print $3}') 2>/dev/null || true

echo ""
echo "=== Step 5: Rebuilding dashboard WITHOUT cache ==="
docker compose -f docker-compose.prod.yml --env-file .env build --no-cache --pull dashboard

echo ""
echo "=== Step 6: Starting dashboard container ==="
docker compose -f docker-compose.prod.yml --env-file .env up -d dashboard

echo ""
echo "=== Step 7: Waiting for dashboard to start ==="
sleep 10

echo ""
echo "=== Step 8: Checking dashboard logs ==="
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=20 dashboard

echo ""
echo "=== Step 9: Testing login page ==="
curl -s http://localhost:3000/login | grep -i "sign up" && echo "✅ Found 'Sign up' in HTML" || echo "⚠️  'Sign up' not found in HTML (may be client-side rendered)"

echo ""
echo "=== Complete ==="
echo "Dashboard has been rebuilt and restarted."
echo "Please check: https://app.veridion-nexus.eu/login"
echo "If you still see old text, try:"
echo "1. Hard refresh: Ctrl+Shift+R"
echo "2. Clear browser cache"
echo "3. Try incognito mode"
