<#
.SYNOPSIS
  Construit Jarvis COMPLETE pour Windows 11 directement sur votre PC.

.DESCRIPTION
  Depuis la racine du projet :
      powershell -ExecutionPolicy Bypass -File packaging\windows\Construire-Jarvis-Complet.ps1 [-WithExe]

  Produit dans dist\ :
      Jarvis-Complete-Portable.zip     (toujours)
      Jarvis-Complete-Setup.exe        (si -WithExe et NSIS installe)

  Requis sur votre PC :
      - Node.js 18.18+
      - Python NON requis (Python 3.11 embarque est regenere ici)
      - NSIS seulement pour le .exe : https://nsis.sourceforge.io
      - Connexion Internet (telecharge Node, PostgreSQL, VC++, Python)
#>
param([switch]$WithExe)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo    = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Dist    = Join-Path $Repo "dist"
$Work    = Join-Path $Dist "_work"
$Payload = Join-Path $Work "payload"

$NODE_ZIP     = "https://nodejs.org/dist/v22.23.0/node-v22.23.0-win-x64.zip"
$ELECTRON_ZIP = "https://github.com/electron/electron/releases/download/v34.3.4/electron-v34.3.4-win32-x64.zip"
$PG_ZIP       = "https://sbp.enterprisedb.com/getfile.jsp?fileid=1260623"
$VC_EXE       = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
$PY_ZIP       = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"
$GETPIP       = "https://bootstrap.pypa.io/get-pip.py"

function Say($msg)  { Write-Host "`n== $msg ==" -ForegroundColor Cyan }
function Fail($msg) { throw "`n[ECHEC] $msg" }
function Dl($url, $dst) {
  Write-Host "  telechargement : $url"
  Invoke-WebRequest -Uri $url -OutFile $dst -UseBasicParsing
}
function Expand-Zip($zip, $dest) {
  New-Item -ItemType Directory -Force $dest | Out-Null
  Expand-Archive -Force -Path $zip -DestinationPath $dest
}
function Sha256($path) { (Get-FileHash -Algorithm SHA256 $path).Hash.ToLower() }

# --- 0. Preparation -------------------------------------------------------
Say "Preparation"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js est requis : https://nodejs.org" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue))  { Fail "npm est requis." }
Write-Host ("Node detecte : " + (node -v))
Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Payload | Out-Null

# --- 1. Application Next.js autonome --------------------------------------
Say "Compilation de l'application (npm install + build standalone)"
Push-Location $Repo
try {
  npm install
  if ($LASTEXITCODE -ne 0) { Fail "npm install a echoue." }
  & npx drizzle-kit generate --dialect postgresql --schema ./src/db/schema.ts --out (Join-Path $Work "drizzle") | Out-Null
  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "npm run build a echoue." }
} finally { Pop-Location }

$standalone = Join-Path $Repo ".next\standalone"
if (-not (Test-Path (Join-Path $standalone "server.js"))) { Fail ".next\standalone\server.js introuvable." }

Say "Assemblage de l'application autonome"
$appOut = Join-Path $Payload "app"
New-Item -ItemType Directory -Force $appOut | Out-Null
Copy-Item -Recurse (Join-Path $standalone "*") $appOut
Copy-Item -Recurse -Force (Join-Path $Repo ".next\static") (Join-Path $appOut ".next\static")
$pubOut = Join-Path $appOut "public"
Remove-Item $pubOut -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pubOut | Out-Null
Copy-Item -Recurse (Join-Path $Repo "public\*") $pubOut
Get-ChildItem (Join-Path $pubOut "jarvis-node") -Include *.exe,*.zip -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
# Jamais la configuration du développeur dans le paquet : on livre un .env
# vierge (clés à renseigner par l'utilisateur après installation).
Remove-Item (Join-Path $appOut ".env") -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $Repo "packaging\windows\.env.modele") (Join-Path $appOut ".env.modele") -Force

$sqlFile = Get-ChildItem (Join-Path $Work "drizzle") -Filter *.sql -Recurse | Sort-Object Name | Select-Object -First 1
if (-not $sqlFile) { Fail "drizzle-kit n'a produit aucun fichier SQL." }
(Get-Content $sqlFile.FullName -Raw) -replace '-- statement-breakpoint','' | Set-Content (Join-Path $Payload "schema.sql") -Encoding UTF8

# --- 2. Runtimes ----------------------------------------------------------
Say "Telechargement Node.js Windows x64"
$nodeZip = Join-Path $Work "node.zip"; Dl $NODE_ZIP $nodeZip
$nodeX = Join-Path $Work "node-x"; Expand-Zip $nodeZip $nodeX
New-Item -ItemType Directory -Force (Join-Path $Payload "runtime") | Out-Null
Move-Item (Get-ChildItem $nodeX -Directory | Select-Object -First 1).FullName (Join-Path $Payload "runtime\node")

Say "Telechargement du shell bureau Electron Windows x64"
$electronZip = Join-Path $Work "electron.zip"; Dl $ELECTRON_ZIP $electronZip
$electronDir = Join-Path $Payload "runtime\electron"; Expand-Zip $electronZip $electronDir
Rename-Item (Join-Path $electronDir "electron.exe") "Jarvis.exe" -Force
$desktopOut = Join-Path $Payload "desktop"
New-Item -ItemType Directory -Force $desktopOut | Out-Null
Copy-Item -Recurse (Join-Path $Repo "packaging\windows\desktop\*") $desktopOut
Copy-Item (Join-Path $Repo "packaging\windows\assets\jarvis.ico") (Join-Path $desktopOut "jarvis.ico")

Say "Telechargement PostgreSQL 16 binaire Windows"
$pgZip = Join-Path $Work "pg.zip"; Dl $PG_ZIP $pgZip
$pgX = Join-Path $Work "pg-x"; Expand-Zip $pgZip $pgX
New-Item -ItemType Directory -Force (Join-Path $Payload "runtime\postgres") | Out-Null
Move-Item (Join-Path $pgX "pgsql\bin")   (Join-Path $Payload "runtime\postgres\bin")
Move-Item (Join-Path $pgX "pgsql\lib")   (Join-Path $Payload "runtime\postgres\lib")
Move-Item (Join-Path $pgX "pgsql\share") (Join-Path $Payload "runtime\postgres\share")

Say "Telechargement Visual C++ Runtime"
Dl $VC_EXE (Join-Path $Payload "runtime\vc_redist.x64.exe")

# --- 3. Agent vocal : Python 3.11 embarque --------------------------------
Say "Telechargement Python 3.11 embarque"
$pyZip = Join-Path $Work "py.zip"; Dl $PY_ZIP $pyZip
$pyDir = Join-Path $Payload "agent\python"
Expand-Zip $pyZip $pyDir
@"
python311.zip
DLLs
.
..\lib\site-packages

import site
"@ | Set-Content (Join-Path $pyDir "python311._pth") -Encoding ASCII

Say "Installation des paquets Python Windows"
$pyExe = Join-Path $pyDir "python.exe"
$getPip = Join-Path $Work "get-pip.py"; Dl $GETPIP $getPip
& $pyExe $getPip --no-warn-script-location | Out-Null
$sitePackages = Join-Path $Payload "agent\lib\site-packages"
New-Item -ItemType Directory -Force $sitePackages | Out-Null
& $pyExe -m pip install --no-warn-script-location --target $sitePackages `
    pyautogui requests pillow ddgs openwakeword sounddevice numpy pyttsx3 pywin32 comtypes SpeechRecognition send2trash
if ($LASTEXITCODE -ne 0) { Fail "pip install des dependances de l'agent a echoue." }

Say "Allegement (modules d'entrainement inutiles pour l'inference)"
foreach ($pkg in @("scipy", "scikit_learn", "joblib", "threadpoolctl", "narwhals")) {
  Remove-Item (Join-Path $sitePackages $pkg) -Recurse -Force -ErrorAction SilentlyContinue
  Get-ChildItem $sitePackages -Filter "$pkg*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
@'
import os
from openwakeword.model import Model
from openwakeword.vad import VAD


def train_custom_verifier(*args, **kwargs):
    raise NotImplementedError("Entrainement non inclus dans l'agent package.")


__all__ = ["Model", "VAD", "train_custom_verifier"]
'@ | Set-Content (Join-Path $sitePackages "openwakeword\__init__.py") -Encoding UTF8

Say "Modeles vocaux et scripts de l'agent"
Copy-Item (Join-Path $Repo "public\jarvis-node\jarvis-agent.py") (Join-Path $Payload "agent\jarvis-agent.py")
$oww = Join-Path $sitePackages "openwakeword\resources\models"
New-Item -ItemType Directory -Force (Join-Path $Payload "agent\models") | Out-Null
foreach ($m in @("hey_jarvis_v0.1.onnx", "melspectrogram.onnx", "embedding_model.onnx")) {
  Copy-Item (Join-Path $oww $m) (Join-Path $Payload "agent\models") -ErrorAction SilentlyContinue
}
@'
Set shell = CreateObject("Wscript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = dir
shell.Run """" & dir & "\python\pythonw.exe"" """ & dir & "\jarvis-agent.py""", 0, False
'@ | Set-Content (Join-Path $Payload "agent\Jarvis-Silencieux.vbs") -Encoding ASCII
@'
@echo off
cd /d "%~dp0"
python\python.exe jarvis-agent.py
pause
'@ | Set-Content (Join-Path $Payload "agent\Jarvis-Console.bat") -Encoding ASCII
Set-Content (Join-Path $Payload "agent\server_url.txt") "http://127.0.0.1:3210" -Encoding ASCII

# --- 4. Scripts de demarrage ----------------------------------------------
Say "Scripts de demarrage"
foreach ($f in @("Start-Jarvis.ps1","Stop-Jarvis.ps1","Stop-Jarvis.bat","Diagnostic-Jarvis.ps1",
                 "Jarvis-Silencieux.vbs","Ouvrir-Jarvis.vbs","Jarvis-Console.bat","Ouvrir-Cles.ps1",
                 "LISEZ-MOI-WINDOWS-11.txt")) {
  Copy-Item (Join-Path $Repo "packaging\windows\$f") (Join-Path $Payload $f)
}

# --- 5. Archive portable ---------------------------------------------------
Say "Compression de la version portable (quelques minutes)"
New-Item -ItemType Directory -Force $Dist | Out-Null
$portableZip = Join-Path $Dist "Jarvis-Complete-Portable.zip"
Remove-Item $portableZip -Force -ErrorAction SilentlyContinue
$portableRoot = Join-Path $Work "portable"
New-Item -ItemType Directory -Force (Join-Path $portableRoot "JarvisComplete") | Out-Null
Copy-Item -Recurse (Join-Path $Payload "*") (Join-Path $portableRoot "JarvisComplete")
Compress-Archive -Path (Join-Path $portableRoot "JarvisComplete") -DestinationPath $portableZip -CompressionLevel Optimal

# --- 6. Installateur NSIS (option) -----------------------------------------
$exeOut = $null
if ($WithExe) {
  if (Get-Command makensis -ErrorAction SilentlyContinue) {
    Say "Compilation de l'installateur NSIS"
    $nsisDir = Join-Path $Work "nsis"
    New-Item -ItemType Directory -Force $nsisDir | Out-Null
    $innerZip = Join-Path $Work "payload-inner.zip"
    Remove-Item $innerZip -Force -ErrorAction SilentlyContinue
    Push-Location $Payload
    try { Compress-Archive -Path * -DestinationPath $innerZip -CompressionLevel Optimal } finally { Pop-Location }
    Copy-Item $innerZip (Join-Path $nsisDir "jarvis-complete-payload.zip")
    Copy-Item (Join-Path $Repo "packaging\windows\Extract-Complete.ps1") (Join-Path $nsisDir "Extract-Complete.ps1")
    Copy-Item (Join-Path $Repo "packaging\windows\JarvisComplete.nsi")   (Join-Path $nsisDir "JarvisComplete.nsi")
    Copy-Item (Join-Path $Repo "packaging\windows\Ouvrir-Jarvis.vbs")    (Join-Path $nsisDir "Ouvrir-Jarvis.vbs")
    Copy-Item (Join-Path $Repo "packaging\windows\LICENCE.txt")          (Join-Path $nsisDir "LICENCE.txt")
    Copy-Item (Join-Path $Repo "packaging\windows\LISEZ-MOI-WINDOWS-11.txt") (Join-Path $nsisDir "LISEZ-MOI-WINDOWS-11.txt")
    New-Item -ItemType Directory -Force (Join-Path $nsisDir "assets") | Out-Null
    Copy-Item (Join-Path $Repo "packaging\windows\assets\jarvis.ico")    (Join-Path $nsisDir "assets\jarvis.ico")
    Copy-Item (Join-Path $Payload "runtime\vc_redist.x64.exe")           (Join-Path $nsisDir "vc_redist.x64.exe")
    Push-Location $nsisDir
    try { makensis JarvisComplete.nsi } finally { Pop-Location }
    $exeOut = Join-Path $nsisDir "Jarvis-Complete-Setup.exe"
    if (Test-Path $exeOut) { Move-Item $exeOut (Join-Path $Dist "Jarvis-Complete-Setup.exe") -Force }
  } else {
    Write-Host "`nNSIS introuvable - ZIP portable produit seulement. Pour le .exe :" -ForegroundColor Yellow
    Write-Host "  winget install NSIS.NSIS  (ou choco install nsis)" -ForegroundColor Yellow
    Write-Host "  puis relancez avec -WithExe" -ForegroundColor Yellow
  }
}

# --- 7. Bilan + mise a disposition via serveur local -----------------------
Say "Empreintes SHA-256"
$pubDir = Join-Path $Repo "public\jarvis-node"
New-Item -ItemType Directory -Force $pubDir | Out-Null
Copy-Item $portableZip (Join-Path $pubDir "Jarvis-Complete-Portable.zip") -Force
$exeFinal = Join-Path $Dist "Jarvis-Complete-Setup.exe"
if (Test-Path $exeFinal) { Copy-Item $exeFinal (Join-Path $pubDir "Jarvis-Complete-Setup.exe") -Force }

Write-Host ""
Write-Host "================ CONSTRUCTION TERMINEE ================" -ForegroundColor Green
Write-Host ("  Portable  : {0}  ({1:N1} Mo)" -f $portableZip, ((Get-Item $portableZip).Length / 1MB)) -ForegroundColor Green
Write-Host ("    SHA-256 : {0}" -f (Sha256 $portableZip))
if (Test-Path $exeFinal) {
  Write-Host ("  Setup.exe : {0}  ({1:N1} Mo)" -f $exeFinal, ((Get-Item $exeFinal).Length / 1MB)) -ForegroundColor Green
  Write-Host ("    SHA-256 : {0}" -f (Sha256 $exeFinal))
}
