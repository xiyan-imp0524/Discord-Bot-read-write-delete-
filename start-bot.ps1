# Starts the bot with crash auto-restart via npm run start:daemon
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
Set-Location $PSScriptRoot
Write-Host "Starting clear-bot (auto-restart enabled)..." -ForegroundColor Cyan
npm run start:daemon
