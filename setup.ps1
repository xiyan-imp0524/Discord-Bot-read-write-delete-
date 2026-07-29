# One-time setup: creates .env from your Discord credentials
$envPath = Join-Path $PSScriptRoot ".env"

if (Test-Path $envPath) {
    $overwrite = Read-Host ".env already exists. Overwrite? (y/N)"
    if ($overwrite -ne "y") { exit }
}

Write-Host ""
Write-Host "=== discord-clear-bot setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "You need three values from Discord (see instructions in chat)."
Write-Host ""

$token = Read-Host "BOT_TOKEN"
$guildIds = Read-Host "GUILD_IDS (your server ID)"
$allowedUsers = Read-Host "ALLOWED_USERS (your Discord user ID)"

@"
BOT_TOKEN=$token
GUILD_IDS=$guildIds
ALLOWED_USERS=$allowedUsers
"@ | Set-Content -Path $envPath -Encoding UTF8

Write-Host ""
Write-Host "Created .env" -ForegroundColor Green
Write-Host "Run: npm start" -ForegroundColor Green
