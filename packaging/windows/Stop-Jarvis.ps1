$ErrorActionPreference = "SilentlyContinue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataRoot = Join-Path $env:LOCALAPPDATA "JarvisCompleteData"
$PgData = Join-Path $DataRoot "postgres"
$PgCtl = Join-Path $Root "runtime\postgres\bin\pg_ctl.exe"

# Fenetre bureau Electron (Jarvis.exe local a cette installation)
Get-Process -Name "Jarvis" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Agent vocal (uniquement celui dont la ligne de commande contient jarvis-agent.py)
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -in @("python.exe", "pythonw.exe") -and $_.CommandLine -like "*jarvis-agent.py*" } |
  ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }

# Serveur Node connu par son PID
$pidFile = Join-Path $DataRoot "node.pid"
if (Test-Path $pidFile) {
  $nodePid = Get-Content $pidFile | Select-Object -First 1
  Stop-Process -Id $nodePid -Force -ErrorAction SilentlyContinue
  Remove-Item $pidFile -Force
}

# PostgreSQL : arret propre
if ((Test-Path $PgCtl) -and (Test-Path (Join-Path $PgData "PG_VERSION"))) {
  & $PgCtl stop -D $PgData -m fast -w -t 30 | Out-Null
}

Write-Host "Jarvis est arrete." -ForegroundColor Green
