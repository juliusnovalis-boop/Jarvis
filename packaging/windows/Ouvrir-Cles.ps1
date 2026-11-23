# Ouvre le fichier de clés J.A.R.V.I.S. dans le Bloc-notes.
# Crée .env depuis .env.modele s'il n'existe pas encore — jamais l'inverse :
# une mise à jour n'écrase jamais les clés déjà renseignées.
$ErrorActionPreference = "Stop"

$Root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$App    = Join-Path $Root "app"
$Env    = Join-Path $App ".env"
$Model  = Join-Path $App ".env.modele"

New-Item -ItemType Directory -Force -Path $App | Out-Null

if (-not (Test-Path $Env)) {
  if (Test-Path $Model) {
    Copy-Item -Path $Model -Destination $Env
  } else {
    Set-Content -Path $Env -Encoding UTF8 -Value @(
      "# Clés J.A.R.V.I.S. — voir docs/PUBLIC-APIS.md",
      "# DOUBAO_API_KEY=", "# GROQ_API_KEY=", "# GEMINI_API_KEY=", "# OPENROUTER_API_KEY="
    )
  }
}

Start-Process -FilePath "notepad.exe" -ArgumentList "`"$Env`""
