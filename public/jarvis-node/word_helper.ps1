param([string]$JsonB64)
# word_helper.ps1 - Automatisation Word via COM (aucun module Python requis).
# Entree : JSON en Base64 {filename,text,mode,save_as,close}. Sortie : chemin du fichier.
$ErrorActionPreference = 'Stop'
$raw = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($JsonB64))
$j = $raw | ConvertFrom-Json

$docs = [Environment]::GetFolderPath('MyDocuments')
$name = [string]$j.filename
if ([string]::IsNullOrWhiteSpace($name)) { $name = 'Document-Jarvis' }
if (-not $name.ToLower().EndsWith('.docx')) { $name = $name + '.docx' }
$full = Join-Path $docs $name

if (-not (Test-Path $full)) {
  $bases = @([Environment]::GetFolderPath('Desktop'), $docs, (Join-Path $env:USERPROFILE 'Downloads'))
  foreach ($base in $bases) {
    if (-not (Test-Path $base)) { continue }
    $hit = Get-ChildItem $base -Filter $name -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { $full = $hit.FullName; break }
  }
}

$word = New-Object -ComObject Word.Application
$word.Visible = $true
$word.DisplayAlerts = 0
$doc = $null
try {
  if (Test-Path $full) {
    $doc = $word.Documents.Open($full)
    if ($j.mode -eq 'replace') {
      $doc.Content.Text = [string]$j.text
    } else {
      $sel = $word.Selection
      [void]$sel.EndKey(6)  # wdStory : fin du document
      $existing = ""
      try { $existing = $sel.Range.Text } catch {}
      if ($existing.Trim().Length -gt 0) { [void]$sel.TypeParagraph() }
      [void]$sel.TypeText([string]$j.text)
    }
  } else {
    $doc = $word.Documents.Add()
    $doc.Content.Text = [string]$j.text
  }

  if ($j.save_as) {
    $safe = [string]$j.save_as
    $safe = $safe -replace '[\\/:*?"<>|]', ''
    if (-not $safe.ToLower().EndsWith('.docx')) { $safe = $safe + '.docx' }
    $full = Join-Path $docs $safe
    [void]$doc.SaveAs2($full, 16)
  } else {
    try { $doc.Save() } catch { [void]$doc.SaveAs2($full, 16) }
  }

  if ($j.close) { [void]$doc.Close($true); $doc = $null; $word.Quit(); $word = $null }
  Write-Output $full
} catch {
  try { if ($doc) { [void]$doc.Close($false) }; $word.Quit() } catch {}
  throw
}
