# Send test transfer to India
# Usage: .\send-test-transfer-in.ps1 [API_URL] [API_KEY] [AGENT_ID] [AGENT_API_KEY]
# Env fallback: VERIDION_NEXUS_API_KEY, VERIDION_NEXUS_AGENT_ID, VERIDION_NEXUS_AGENT_API_KEY

param(
    [string]$ApiUrl = "https://api.veridion-nexus.eu",
    [string]$ApiKey = $env:VERIDION_NEXUS_API_KEY,
    [string]$AgentId = $env:VERIDION_NEXUS_AGENT_ID,
    [string]$AgentApiKey = $env:VERIDION_NEXUS_AGENT_API_KEY
)

$endpoint = "$ApiUrl/api/v1/shield/evaluate"

# Test transfer data for India
$body = @{
    destinationCountryCode = "IN"
    destinationCountry = "India"
    dataCategories = @("email", "name", "ip_address")
    partnerName = "Customer Support Bot"
    sourceIp = "192.168.1.100"
    destIp = "103.21.58.50"
    dataSize = 1024
    protocol = "HTTPS"
    userAgent = "Test-Client/1.0"
    requestPath = "/api/test"
}

if ($AgentId) { $body.agent_id = $AgentId }
if ($AgentApiKey) { $body.agent_api_key = $AgentApiKey }

$bodyJson = $body | ConvertTo-Json

Write-Host "Sending test transfer to India (Customer Support Bot)..." -ForegroundColor Cyan
Write-Host "Endpoint: $endpoint" -ForegroundColor Gray
Write-Host "Body: $bodyJson" -ForegroundColor Gray
Write-Host ""

$headers = @{
    "Content-Type" = "application/json"
}

if ($ApiKey) {
    $headers["Authorization"] = "Bearer $ApiKey"
    Write-Host "Using API key authentication" -ForegroundColor Yellow
} else {
    Write-Host "No API key provided" -ForegroundColor Yellow
}

if ($AgentId) {
    Write-Host "Agent: $AgentId" -ForegroundColor Yellow
} else {
    Write-Host "No agent_id provided - request may fail with AGENT_REQUIRED" -ForegroundColor Yellow
}

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Headers $headers -Body $bodyJson -UseBasicParsing
    
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
