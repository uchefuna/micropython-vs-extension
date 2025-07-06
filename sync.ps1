

# sync.ps1 - PowerShell Git sync script for micropython-vs-extension

# Show current branch and status
Write-Host "`n🌀 Checking Git status..."
git status

# Ensure you're on the main branch
Write-Host "`n📦 Switching to 'main' branch..."
git checkout main

# Pull latest from GitHub
Write-Host "`n⬇️  Pulling latest from GitHub..."
git pull origin main

# Stage all changes
Write-Host "`n🗂️  Staging changes..."
git add .

# Ask for commit message
$msg = Read-Host "`n📝 Enter commit message"
if ($msg -eq "") {
    Write-Host "⚠️  Commit message cannot be empty. Exiting..."
    exit
}

# Commit
git commit -m "$msg"

# Push
Write-Host "`n🚀 Pushing to GitHub..."
git push origin main

# Optional: Open GitHub repo in browser
Start-Process "https://github.com/uchefuna/micropython-vs-extension"

Write-Host "`n✅ Sync complete!"
