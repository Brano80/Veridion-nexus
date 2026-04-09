# Deploy Veridion Nexus to production
# 1. Pushes latest code to origin
# 2. SSHs to server and runs deploy.sh (which applies scripts/seed_demo.sql idempotently after health check)
#
# Prerequisites:
#   - Set $env:DEPLOY_HOST, or copy deploy.local.ps1.example → deploy.local.ps1 (gitignored)
#   - SSH key configured for passwordless login
#
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

$localDeploy = Join-Path $PSScriptRoot 'deploy.local.ps1'
if (Test-Path -LiteralPath $localDeploy) {
    . $localDeploy
    Write-Host "Loaded deploy.local.ps1" -ForegroundColor DarkGray
}

Write-Host "Deploy Veridion Nexus" -ForegroundColor Cyan
Write-Host ""

# Step 1: Push to origin
Write-Host "Pushing to origin..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Push complete." -ForegroundColor Green
Write-Host ""

# Step 2: SSH and run deploy.sh
$deployHost = $env:DEPLOY_HOST
if (-not $deployHost) {
    Write-Host "DEPLOY_HOST not set. To run deploy on server:" -ForegroundColor Yellow
    Write-Host "  1. Copy deploy.local.ps1.example → deploy.local.ps1 and set your host, or:" -ForegroundColor White
    Write-Host "     `$env:DEPLOY_HOST = 'root@your-server-ip'" -ForegroundColor White
    Write-Host "  2. Run: .\deploy.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Or SSH manually and run:" -ForegroundColor Yellow
    Write-Host "  ssh user@server 'cd /opt/veridion-nexus && ./deploy.sh'" -ForegroundColor White
    exit 0
}

# Catch copy-paste of placeholder text (not a real hostname)
$placeholderPattern = '(?i)(YOUR_SERVER|your_server_ip|your-server-ip)'
if ($deployHost -match $placeholderPattern) {
    Write-Host "DEPLOY_HOST looks like a placeholder, not a real server." -ForegroundColor Red
    Write-Host "Replace it with your actual SSH target, e.g. root@203.0.113.50 or a Host name from ~/.ssh/config" -ForegroundColor Yellow
    Write-Host "Current value: $deployHost" -ForegroundColor Gray
    exit 1
}

Write-Host "Running deploy on $deployHost..." -ForegroundColor Yellow
ssh $deployHost "cd /opt/veridion-nexus && ./deploy.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
