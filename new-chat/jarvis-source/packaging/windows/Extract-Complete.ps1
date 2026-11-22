param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Expand-Archive -Force -Path $Archive -DestinationPath $Destination
