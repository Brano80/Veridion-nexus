# Send test transfer to Australia
# Usage: .\send-test-transfer-au.ps1 [API_URL] [API_KEY]

param(
    [string]$ApiUrl = "https://api.veridion-nexus.eu",
    [string]$ApiKey = $null
)

$endpoint = "$ApiUrl/api/v1/shield/evaluate"

# Test transfer data for Australia
$body = @{
    destinationCountryCode = "AU"
    destinationCountry = "Australia"
    dataCategories = @("email", "name", "ip_address")
    partnerName = "Test Partner Australia"
    sourceIp = "192.168.1.100"
    destIp = "203.0.113.50"
    dataSize = 1024
    protocol = "HTTPS"
    userAgent = "Test-Client/1.0"
    requestPath = "/api/test"
} | ConvertTo-Json

Write-Host "Sending test transfer to Australia..." -ForegroundColor Cyan
Write-Host "Endpoint: $endpoint" -ForegroundColor Gray
Write-Host "Body: $body" -ForegroundColor Gray
Write-Host ""

$headers = @{
    "Content-Type" = "application/json"
}

# Add Authorization header if API key is provided
if ($ApiKey) {
    $headers["Authorization"] = "Bearer $ApiKey"
    Write-Host "Using API key authentication" -ForegroundColor Yellow
} else {
    Write-Host "No API key provided - using dev bypass (if in development mode)" -ForegroundColor Yellow
}

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Headers $headers -Body $body -UseBasicParsing
    
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response Body:" -ForegroundColor Cyan
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Write-Host
    
} catch {
    Write-Host "❌ Error occurred!" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    } else {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    exit 1
}
