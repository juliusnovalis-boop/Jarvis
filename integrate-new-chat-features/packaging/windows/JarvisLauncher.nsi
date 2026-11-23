; ==================================================================
;  Jarvis.exe - lanceur natif de l'application
;  Compile un vrai executable Windows (pas un script) place a la
;  racine d'installation. C'est lui que ciblent les raccourcis.
; ==================================================================

!define VERSION "1.0.0"
!define VERSIONNUM 1.0.0.0

Name "J.A.R.V.I.S."
OutFile "Jarvis.exe"
Icon "assets\jarvis.ico"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow
XPStyle on

VIProductVersion "${VERSIONNUM}"
VIAddVersionKey /LANG=1036 "ProductName" "J.A.R.V.I.S."
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "CompanyName" "Jarvis Project"
VIAddVersionKey /LANG=1036 "FileDescription" "J.A.R.V.I.S. - Assistant vocal intelligent"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "OriginalFilename" "Jarvis.exe"
VIAddVersionKey /LANG=1036 "LegalCopyright" "(c) 2026 Jarvis Project"

Section
  ; $EXEDIR = dossier ou se trouve Jarvis.exe (racine d'installation)
  SetOutPath "$EXEDIR"

  IfFileExists "$EXEDIR\Start-Jarvis.ps1" 0 missing

  ; Lance le demarrage complet puis rend la main immediatement.
  Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$EXEDIR\Start-Jarvis.ps1"'
  Return

missing:
  MessageBox MB_ICONSTOP "Installation Jarvis incomplete : Start-Jarvis.ps1 est introuvable dans $EXEDIR.$\n$\nReinstallez J.A.R.V.I.S. Complete."
SectionEnd
