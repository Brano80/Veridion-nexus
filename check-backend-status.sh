#!/bin/bash
# Quick diagnostic script for 502 errors
# Run on server: bash check-backend-status.sh

echo "=== Checking Docker containers ==="
cd /opt/veridion-nexus
docker compose -f docker-compose.prod.yml --env-file .env ps

echo ""
echo "=== Checking API health ==="
curl -f http://localhost:8080/health || echo "❌ API not responding on port 8080"

echo ""
echo "=== Checking API logs (last 20 lines) ==="
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=20 api

echo ""
echo "=== Checking Caddy status ==="
sudo systemctl status caddy --no-pager -l | head -20

echo ""
echo "=== Checking if port 8080 is listening ==="
sudo netstat -tlnp | grep 8080 || echo "❌ Port 8080 not listening"
