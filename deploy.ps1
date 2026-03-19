# Deploy Veridion Nexus to production
# 1. Pushes latest code to origin
# 2. SSHs to server and runs deploy.sh
#
# Prerequisites:
#   - Set $env:DEPLOY_HOST (e.g. "root@your-server-ip" or "user@api.veridion-nexus.eu")
#   - SSH key configured for passwordless login
#
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

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
    Write-Host "  1. Set: `$env:DEPLOY_HOST = 'root@your-server-ip'" -ForegroundColor White
    Write-Host "  2. Run: .\deploy.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Or SSH manually and run:" -ForegroundColor Yellow
    Write-Host "  ssh user@server 'cd /opt/veridion-nexus && ./deploy.sh'" -ForegroundColor White
    exit 0
}

Write-Host "Running deploy on $deployHost..." -ForegroundColor Yellow
ssh $deployHost "cd /opt/veridion-nexus && ./deploy.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
