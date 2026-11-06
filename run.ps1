Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  TeamSync Trello Power-Up Development Environment" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Launching Vite Dev Server in background window..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "npm.cmd run dev"

Write-Host "Waiting 3 seconds for Vite to bind to port 5173..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[2/2] Launching Cloudflare HTTPS Tunnel..." -ForegroundColor Green
Write-Host "Copy the 'https://....trycloudflare.com' URL below and paste it in Trello Admin." -ForegroundColor White
Write-Host ""

npx cloudflared tunnel --url http://localhost:5173
