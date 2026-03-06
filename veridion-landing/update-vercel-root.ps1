# Script to update Vercel project Root Directory setting
# Usage: .\update-vercel-root.ps1 -Token "your-vercel-token"
# Get token from: https://vercel.com/account/tokens

param(
    [Parameter(Mandatory=$false)]
    [string]$Token = $env:VERCEL_TOKEN
)

if (-not $Token) {
    Write-Output "Error: Vercel token required"
    Write-Output "Usage: .\update-vercel-root.ps1 -Token 'your-token'"
    Write-Output "Or set: `$env:VERCEL_TOKEN = 'your-token'"
    Write-Output "Get token from: https://vercel.com/account/tokens"
    exit 1
}

$projectId = "prj_v7M9XLrJE5R3moE7mBl276rhhWKC"
$orgId = "team_NkGKOkJkMcQVEdJQEL4COIgN"
$apiUrl = "https://api.vercel.com/v9/projects/$projectId`?teamId=$orgId"

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

$body = @{
    rootDirectory = ""
} | ConvertTo-Json -Compress

try {
    Write-Output "Updating Root Directory to empty (current directory)..."
    $response = Invoke-RestMethod -Uri $apiUrl -Method Patch -Headers $headers -Body $body
    Write-Output "✓ Successfully updated Root Directory!"
    Write-Output "You can now deploy with: vercel --prod"
} catch {
    Write-Output "Error updating Root Directory:"
    Write-Output $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Output "Response: $responseBody"
    }
}
