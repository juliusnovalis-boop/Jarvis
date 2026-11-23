$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Data = Join-Path $env:LOCALAPPDATA "JarvisCompleteData"
Write-Host "=== DIAGNOSTIC J.A.R.V.I.S. ===" -ForegroundColor Cyan
Write-Host "Installation : $Root"
Write-Host "Donnees      : $Data"
Write-Host ""
$checks = @(
  @{ N="Node Windows"; P="$Root\runtime\node\node.exe" },
  @{ N="Electron Jarvis.exe"; P="$Root\runtime\electron\Jarvis.exe" },
  @{ N="PostgreSQL"; P="$Root\runtime\postgres\bin\postgres.exe" },
  @{ N="Serveur Next"; P="$Root\app\server.js" },
  @{ N="Shell desktop"; P="$Root\desktop\main.js" },
  @{ N="Agent vocal"; P="$Root\agent\jarvis-agent.py" },
  @{ N="Modele Jarvis"; P="$Root\agent\models\hey_jarvis_v0.1.onnx" },
  @{ N="Schema SQL"; P="$Root\schema.sql" }
)
foreach ($c in $checks) {
  $ok = Test-Path $c.P
  $status = "ABSENT"
  if ($ok) { $status = "OK" }
  $color = "Red"
  if ($ok) { $color = "Green" }
  Write-Host (("{0,-20} {1}" -f $c.N, $status)) -ForegroundColor $color
}
Write-Host ""
try {
  $h = Invoke-RestMethod "http://127.0.0.1:3210/api/health" -TimeoutSec 3
  Write-Host "Healthcheck         OK" -ForegroundColor Green
} catch { Write-Host "Healthcheck         HORS LIGNE" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Dernieres lignes du lanceur :" -ForegroundColor Cyan
Get-Content "$Data\logs\launcher.log" -Tail 12 -ErrorAction SilentlyContinue
Write-Host ""
Read-Host "Appuyez sur Entree pour fermer"
