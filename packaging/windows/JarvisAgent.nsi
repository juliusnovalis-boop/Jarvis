; ════════════════════════════════════════════════════════════════════
;  JARVIS Agent — installateur Windows réel (NSIS 3)
;  Construit l'agent PC Python, les lanceurs PowerShell/Batch/VBS,
;  le coquillage Electron et les notices. Aucune dépendance externe.
;
;  Compilation :  makensis JarvisAgent.nsi
;  Sortie :       ../../public/jarvis-node/Jarvis-Agent-Setup.exe
; ════════════════════════════════════════════════════════════════════
Unicode true
RequestExecutionLevel admin
OutFile "..\..\public\jarvis-node\Jarvis-Agent-Setup.exe"
InstallDir "$PROGRAMFILES\JARVIS\Agent"
InstallDirRegKey HKLM "Software\JARVIS\Agent" "InstallDir"

!define PRODUCT "JARVIS Agent"
!define PUBLISHER "J.A.R.V.I.S."
!define WEBPORT "3210"

Name "${PRODUCT}"
BrandingText "${PUBLISHER} - agent PC"
CRCCheck on
SetCompressor /SOLID lzma
XPStyle on
ManifestDPIAware true

Page directory
Page components
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Agent PC (requis)" SEC_AGENT
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; ── Agent Python + helper ────────────────────────────────────────
  File "..\..\public\jarvis-node\jarvis-agent.py"
  File "..\..\public\jarvis-node\word_helper.ps1"

  ; ── Lanceurs et utilitaires Windows ──────────────────────────────
  File "Start-Jarvis.ps1"
  File "Stop-Jarvis.ps1"
  File "Stop-Jarvis.bat"
  File "Jarvis-Console.bat"
  File "Ouvrir-Cles.ps1"
  File "Ouvrir-Jarvis.vbs"
  File "Jarvis-Silencieux.vbs"
  File "Diagnostic-Jarvis.ps1"
  File "PREMIERE-INSTALLATION.bat"

  ; ── Notices et licence ───────────────────────────────────────────
  File "LISEZ-MOI-WINDOWS-11.txt"
  File "LICENCE.txt"

  ; ── Modèle de clés API (.env) ────────────────────────────────────
  File ".env.modele"
  IfFileExists "$INSTDIR\.env" +2 0
    CopyFiles "$INSTDIR\.env.modele" "$INSTDIR\.env"

  ; ── Coquillage bureau (Electron) ─────────────────────────────────
  SetOutPath "$INSTDIR\desktop"
  File "desktop\main.js"
  File "desktop\package.json"
  File "desktop\README.txt"

  ; ── Registre ─────────────────────────────────────────────────────
  WriteRegStr HKLM "Software\JARVIS\Agent" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVISAgent" "DisplayName" "${PRODUCT}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVISAgent" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVISAgent" "DisplayVersion" "1.0.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVISAgent" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVISAgent" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVISAgent" "NoRepair" 1

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Raccourcis du menu Demarrer" SEC_SHORTCUTS
  CreateDirectory "$SMPROGRAMS\JARVIS"
  CreateShortCut "$SMPROGRAMS\JARVIS\Demarrer JARVIS.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Start-Jarvis.ps1"' "$INSTDIR\jarvis-agent.py" 0
  CreateShortCut "$SMPROGRAMS\JARVIS\Console JARVIS.lnk" "$WINDIR\System32\cmd.exe" '/c "$INSTDIR\Jarvis-Console.bat"' "$INSTDIR\jarvis-agent.py" 0
  CreateShortCut "$SMPROGRAMS\JARVIS\Ouvrir les cles API.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Ouvrir-Cles.ps1"' "$INSTDIR\jarvis-agent.py" 0
  CreateShortCut "$SMPROGRAMS\JARVIS\Lisez-moi.lnk" "$WINDIR\System32\notepad.exe" '"$INSTDIR\LISEZ-MOI-WINDOWS-11.txt"' "$INSTDIR\jarvis-agent.py" 0
  CreateShortCut "$SMPROGRAMS\JARVIS\Desinstaller.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
SectionEnd

Section "Raccourci sur le bureau" SEC_DESKTOP
  CreateShortCut "$DESKTOP\JARVIS.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Start-Jarvis.ps1"' "$INSTDIR\jarvis-agent.py" 0
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\jarvis-agent.py"
  Delete "$INSTDIR\word_helper.ps1"
  Delete "$INSTDIR\Start-Jarvis.ps1"
  Delete "$INSTDIR\Stop-Jarvis.ps1"
  Delete "$INSTDIR\Stop-Jarvis.bat"
  Delete "$INSTDIR\Jarvis-Console.bat"
  Delete "$INSTDIR\Ouvrir-Cles.ps1"
  Delete "$INSTDIR\Ouvrir-Jarvis.vbs"
  Delete "$INSTDIR\Jarvis-Silencieux.vbs"
  Delete "$INSTDIR\Diagnostic-Jarvis.ps1"
  Delete "$INSTDIR\PREMIERE-INSTALLATION.bat"
  Delete "$INSTDIR\LISEZ-MOI-WINDOWS-11.txt"
  Delete "$INSTDIR\LICENCE.txt"
  Delete "$INSTDIR\.env.modele"
  Delete "$INSTDIR\desktop\main.js"
  Delete "$INSTDIR\desktop\package.json"
  Delete "$INSTDIR\desktop\README.txt"
  RMDir "$INSTDIR\desktop"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\JARVIS\Demarrer JARVIS.lnk"
  Delete "$SMPROGRAMS\JARVIS\Console JARVIS.lnk"
  Delete "$SMPROGRAMS\JARVIS\Ouvrir les cles API.lnk"
  Delete "$SMPROGRAMS\JARVIS\Lisez-moi.lnk"
  Delete "$SMPROGRAMS\JARVIS\Desinstaller.lnk"
  RMDir "$SMPROGRAMS\JARVIS"
  Delete "$DESKTOP\JARVIS.lnk"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\JARVISAgent"
  DeleteRegKey HKLM "Software\JARVIS\Agent"
SectionEnd
