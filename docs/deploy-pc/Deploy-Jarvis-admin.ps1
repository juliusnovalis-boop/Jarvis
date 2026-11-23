# Deploy-Jarvis-admin.ps1
# Déploiement administrateur du contrôle PC avancé (agent + lanceur + bundle Next reconstruit).
# Usage : clic droit « Exécuter avec PowerShell » ou double-clic ; le script se relève en admin.
$ErrorActionPreference = "Continue"
$Root = "C:\Program Files\Jarvis"
$Src  = Split-Path -Parent $MyInvocation.MyCommand.Path

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
          ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "== Déploiement J.A.R.V.I.S. (administrateur) ==" -ForegroundColor Cyan

# 1) Arrêt du serveur Node et de l'agent Python
$pidFile = Join-Path $env:LOCALAPPDATA "JarvisCompleteData\node.pid"
if (Test-Path $pidFile) {
    try { Stop-Process -Id (Get-Content $pidFile) -Force -ErrorAction Stop } catch {}
}
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" |
    Where-Object { $_.CommandLine -like "*$Root\agent*" } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
Start-Sleep -Seconds 2

# 2) Agent Python (contrôle humain : raccourcis, presse-papiers, Word .docx, fermeture)
Copy-Item (Join-Path $Src "agent\jarvis-agent.py") (Join-Path $Root "agent\jarvis-agent.py") -Force
if (Test-Path (Join-Path $Src "agent\word_helper.ps1")) {
    Copy-Item (Join-Path $Src "agent\word_helper.ps1") (Join-Path $Root "agent\word_helper.ps1") -Force
}

# 3) Lanceur qui charge app\.env (clés Groq / Gemini / OpenRouter / Doubao)
Copy-Item (Join-Path $Src "lanceur\Start-Jarvis.ps1") (Join-Path $Root "Start-Jarvis.ps1") -Force

# 4) Bundle Next.js reconstruit (optionnel : phrases de chat/voix étendues)
$nextSrc = Join-Path $Src "next-build"
if (Test-Path $nextSrc) {
    Write-Host "Synchronisation du bundle Next.js reconstruit..."
    robocopy (Join-Path $nextSrc ".next") (Join-Path $Root "app\.next") /MIR /NFL /NDL /NJH /NJS | Out-Null
    if (Test-Path (Join-Path $nextSrc "server.js")) {
        Copy-Item (Join-Path $nextSrc "server.js") (Join-Path $Root "app\server.js") -Force
    }
} else {
    Write-Host "next-build absent : les nouveaux raccourcis vocaux nécessiteront le build complet." -ForegroundColor Yellow
}

# 5) Redémarrage complet
Write-Host "Redémarrage de Jarvis..."
& (Join-Path $Root "Start-Jarvis.ps1")
Write-Host "Terminé. Tests conseillés :" -ForegroundColor Green
Write-Host "  Lance calculatrice | Ferme calculatrice | Copie tout | Colle"
Write-Host "  Crée un dossier Notes dans Documents | Enregistre | Nouveau document"
