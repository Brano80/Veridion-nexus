# Fix Vercel deployment configuration (PowerShell)
# This script helps set up automatic deployments

Write-Host "🔧 Fixing Vercel deployment configuration..." -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "veridion-landing")) {
    Write-Host "❌ Error: veridion-landing directory not found" -ForegroundColor Red
    Write-Host "   Run this script from the repository root" -ForegroundColor Yellow
    exit 1
}

# Check if Vercel CLI is installed
try {
    $null = Get-Command vercel -ErrorAction Stop
} catch {
    Write-Host "❌ Vercel CLI not found. Install it with: npm i -g vercel" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Vercel CLI is ready" -ForegroundColor Green
Write-Host ""
Write-Host "📝 To fix deployment issues:" -ForegroundColor Yellow
Write-Host "   1. Go to https://vercel.com/dashboard" -ForegroundColor White
Write-Host "   2. Select 'veridion-landing' project" -ForegroundColor White
Write-Host "   3. Go to Settings → Git" -ForegroundColor White
Write-Host "   4. Ensure GitHub repository is connected" -ForegroundColor White
Write-Host "   5. Go to Settings → Build and Deployment" -ForegroundColor White
Write-Host "   6. Find 'Root Directory' field" -ForegroundColor White
Write-Host "   7. Set it to: veridion-landing" -ForegroundColor White
Write-Host "   8. Save settings" -ForegroundColor White
Write-Host ""
Write-Host "🚀 After this, every git push will automatically deploy!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Alternative: Use the API script:" -ForegroundColor Cyan
Write-Host "   node scripts/set-vercel-root.js" -ForegroundColor White
Write-Host "   (Requires VERCEL_TOKEN environment variable)" -ForegroundColor Gray
