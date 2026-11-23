param(
  [switch]$NoBrowser,
  [switch]$ConsoleMode
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataRoot = Join-Path $env:LOCALAPPDATA "JarvisCompleteData"
$PgData = Join-Path $DataRoot "postgres"
$Logs = Join-Path $DataRoot "logs"
$PgPort = 55432
$WebPort = 3210
$Url = "http://127.0.0.1:$WebPort"

New-Item -ItemType Directory -Force -Path $DataRoot, $Logs | Out-Null
$LauncherLog = Join-Path $Logs "launcher.log"

function Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
  Add-Content -Path $LauncherLog -Value $line -Encoding UTF8
  if ($ConsoleMode) { Write-Host $line }
}

function HealthOk {
  try {
    $r = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 2
    return ($r.ok -eq $true)
  } catch { return $false }
}

function OpenJarvisWindow {
  $Electron = Join-Path $Root "runtime\electron\Jarvis.exe"
  $DesktopApp = Join-Path $Root "desktop"
  if ((Test-Path $Electron) -and (Test-Path (Join-Path $DesktopApp "main.js"))) {
    Log "Ouverture de la fenetre bureau Jarvis (Electron)..."
    $env:JARVIS_URL = $Url
    Start-Process -FilePath $Electron -ArgumentList "`"$DesktopApp`"" -WorkingDirectory $DesktopApp
  } else {
    throw "Le shell bureau Jarvis.exe est absent ou endommage. Reinstallez Jarvis Complete."
  }
}

try {
  Log "Demarrage de J.A.R.V.I.S. depuis $Root"

  if (HealthOk) {
    Log "Serveur deja operationnel."
    if (-not $NoBrowser) { OpenJarvisWindow }
    exit 0
  }

  $PgBin = Join-Path $Root "runtime\postgres\bin"
  $Node = Join-Path $Root "runtime\node\node.exe"
  $App = Join-Path $Root "app"
  $Agent = Join-Path $Root "agent"

  foreach ($required in @(
    $Node,
    (Join-Path $PgBin "postgres.exe"),
    (Join-Path $PgBin "initdb.exe"),
    (Join-Path $App "server.js"),
    (Join-Path $Agent "jarvis-agent.py")
  )) {
    if (-not (Test-Path $required)) { throw "Fichier requis absent : $required" }
  }

  # --- PostgreSQL portable -------------------------------------------------
  if (-not (Test-Path (Join-Path $PgData "PG_VERSION"))) {
    Log "Premiere utilisation : initialisation de PostgreSQL..."
    New-Item -ItemType Directory -Force -Path $PgData | Out-Null
    & (Join-Path $PgBin "initdb.exe") `
      --pgdata=$PgData `
      --username=postgres `
      --auth=trust `
      --encoding=UTF8 `
      --locale=C | Out-File (Join-Path $Logs "initdb.log") -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw "initdb a echoue (code $LASTEXITCODE). Voir logs\initdb.log" }
    Add-Content (Join-Path $PgData "postgresql.conf") "`nport = $PgPort`nlisten_addresses = '127.0.0.1'`nmax_connections = 30`nshared_buffers = '64MB'`n"
    Log "PostgreSQL initialise."
  }

  $pgStatus = & (Join-Path $PgBin "pg_ctl.exe") status -D $PgData 2>&1
  if ($LASTEXITCODE -ne 0) {
    Log "Demarrage de PostgreSQL sur le port $PgPort..."
    & (Join-Path $PgBin "pg_ctl.exe") start `
      -D $PgData `
      -l (Join-Path $Logs "postgres.log") `
      -o "-p $PgPort -h 127.0.0.1" `
      -w -t 45 | Out-File (Join-Path $Logs "pg-start.log") -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL n'a pas demarre. Voir logs\postgres.log" }
  }

  # --- Schema SQL au premier demarrage --------------------------------------
  $SchemaMarker = Join-Path $DataRoot "schema-v1.installed"
  if (-not (Test-Path $SchemaMarker)) {
    Log "Creation de la base app_db et de ses tables..."
    $env:PGPASSWORD = ""
    & (Join-Path $PgBin "createdb.exe") -h 127.0.0.1 -p $PgPort -U postgres app_db 2>$null
    & (Join-Path $PgBin "psql.exe") `
      -h 127.0.0.1 -p $PgPort -U postgres -d app_db `
      -v ON_ERROR_STOP=1 `
      -f (Join-Path $Root "schema.sql") `
      > (Join-Path $Logs "schema.log") 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Creation des tables echouee. Voir logs\schema.log" }
    Set-Content -Path $SchemaMarker -Value (Get-Date -Format o) -Encoding ASCII
    Log "Base de donnees prete."
  }

  # --- Serveur Next.js autonome ---------------------------------------------
  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$PgPort/app_db"
  $env:NODE_ENV = "production"
  $env:PORT = "$WebPort"
  $env:HOSTNAME = "127.0.0.1"
  $env:NEXT_TELEMETRY_DISABLED = "1"

  # --- Fichier de clés : fourni avec l'installation -------------------------
  # L'installateur livre .env.modele ; on crée .env au premier démarrage
  # sans jamais écraser un fichier déjà renseigné par l'utilisateur.
  $envFile = Join-Path $App ".env"
  $envModel = Join-Path $App ".env.modele"
  if (-not (Test-Path $envFile) -and (Test-Path $envModel)) {
    try {
      Copy-Item -Path $envModel -Destination $envFile -ErrorAction Stop
      Log "Fichier .env cree depuis .env.modele — ajoutez vos clés dedans."
    } catch { Log "Impossible de creer .env : $($_.Exception.Message)" }
  }

  # --- Variables du fichier .env (clés LLM, options gratuites, Doubao) -----
  if (Test-Path $envFile) {
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
      $line = $_.Trim()
      if ($line -and -not $line.StartsWith("#") -and $line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $val = $Matches[2].Trim().Trim('"').Trim("'")
        if (-not [string]::IsNullOrEmpty($val)) { Set-Item -Path ("env:" + $Matches[1]) -Value $val }
      }
    }
    Log "Variables .env chargees depuis $envFile."
  }

  Log "Demarrage du serveur Jarvis sur $Url..."
  $nodeProc = Start-Process `
    -FilePath $Node `
    -ArgumentList "server.js" `
    -WorkingDirectory $App `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Logs "jarvis-server.log") `
    -RedirectStandardError (Join-Path $Logs "jarvis-server-error.log") `
    -PassThru
  Set-Content -Path (Join-Path $DataRoot "node.pid") -Value $nodeProc.Id -Encoding ASCII

  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (HealthOk) { $ready = $true; break }
    if ($nodeProc.HasExited) { break }
  }
  if (-not $ready) { throw "Le serveur Jarvis n'a pas passe le healthcheck. Voir logs\jarvis-server-error.log" }
  Log "Serveur Jarvis operationnel."

  # --- Agent vocal et controle PC --------------------------------------------
  # server_url.txt est ecrit par l'installateur ; on ne reecrit que si absent
  # (Program Files est en lecture seule pour une session standard).
  $agentUrlFile = Join-Path $Agent "server_url.txt"
  if (-not (Test-Path $agentUrlFile)) {
    try { Set-Content -Path $agentUrlFile -Value $Url -Encoding ASCII } catch { }
  }

  Start-Process `
    -FilePath (Join-Path $env:WINDIR "System32\wscript.exe") `
    -ArgumentList "`"$(Join-Path $Agent 'Jarvis-Silencieux.vbs')`"" `
    -WorkingDirectory $Agent `
    -WindowStyle Hidden
  Log "Agent vocal arme : ecoute continue sans mot-cle."

  if (-not $NoBrowser) {
    OpenJarvisWindow
    Log "Interface ouverte dans sa fenetre bureau native."
  }
} catch {
  Log "ERREUR : $($_.Exception.Message)"
  if ($ConsoleMode) {
    Write-Host ""
    Write-Host "Echec du demarrage : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Journal : $LauncherLog"
    Read-Host "Appuyez sur Entree"
  } else {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "Jarvis n'a pas pu demarrer.`n`n" + $_.Exception.Message + "`n`nJournal : " + $LauncherLog,
      "J.A.R.V.I.S. - erreur",
      "OK",
      "Error"
    ) | Out-Null
  }
  exit 1
}
