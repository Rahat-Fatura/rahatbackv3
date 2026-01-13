# Run this PowerShell script as Administrator
# Right-click → Run as Administrator

Write-Host "Building Rahat Backup Agent..." -ForegroundColor Green

cd $PSScriptRoot

# Run build
npm run build:win

Write-Host "`nBuild completed! Check dist\ folder" -ForegroundColor Green
pause
