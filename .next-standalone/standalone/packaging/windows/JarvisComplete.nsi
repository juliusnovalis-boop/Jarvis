; ══════════════════════════════════════════════════════════════════
;  J.A.R.V.I.S. COMPLETE — installateur Windows 11 « édition logicielle »
;  Assistant graphique MUI2, icône, licence, tâches optionnelles,
;  page de fin avec lancement, infos fichier, protocole jarvis://,
;  entrée complète « Applications installées », désinstallateur propre.
; ══════════════════════════════════════════════════════════════════

!define APPNAME "J.A.R.V.I.S. Complete"
!define VERSION "1.0.0"
!define VERSIONNUM 1.0.0.0
!define PUBLISHER "Jarvis Project"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\JarvisComplete"
!define APPDIR $INSTDIR

; --- Métadonnées de l'exécutable (clic droit → Propriétés) ---
VIProductVersion "${VERSIONNUM}"
VIAddVersionKey /LANG=1036 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "CompanyName" "${PUBLISHER}"
VIAddVersionKey /LANG=1036 "FileDescription" "Assistant vocal intelligent avec contrôle du PC"
VIAddVersionKey /LANG=1036 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "© 2026 ${PUBLISHER}"

Name "${APPNAME} ${VERSION}"
OutFile "Jarvis-Complete-Setup.exe"
InstallDir "$PROGRAMFILES64\Jarvis"
RequestExecutionLevel admin
SetCompressor zlib
ShowInstDetails show

!define MUI_ICON   "assets\jarvis.ico"
!define MUI_UNICON "assets\jarvis.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Lancer J.A.R.V.I.S. maintenant"
!define MUI_FINISHPAGE_RUN_FUNCTION "LaunchJarvis"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\LISEZ-MOI-WINDOWS-11.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Afficher le guide d'utilisation"

!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "LogicLib.nsh"

; --- Assistant d'installation ---
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENCE.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; --- Assistant de désinstallation ---
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "French"

; Icône de l'installateur lui-même
BrandingText "J.A.R.V.I.S. — ${PUBLISHER}"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Jarvis Complete nécessite Windows 11 64 bits."
    Abort
  ${EndIf}
FunctionEnd

; Lance Jarvis à la fin (case cochée par défaut)
Function LaunchJarvis
  Exec '"$INSTDIR\Jarvis.exe"'
FunctionEnd

; ══════════════════════════════════════════════════════════════════
Section "Jarvis (interfacing, serveur web, services de fond)" SEC_CORE
  SectionIn RO

  SetOutPath "$INSTDIR\_setup"
  File "jarvis-complete-payload.zip"
  File "Extract-Complete.ps1"
  File "vc_redist.x64.exe"

  DetailPrint "Installation du runtime Microsoft Visual C++ (si nécessaire)..."
  nsExec::ExecToLog '"$INSTDIR\_setup\vc_redist.x64.exe" /install /quiet /norestart'

  DetailPrint "Extraction du système Jarvis (interface, Node.js, PostgreSQL, agent vocal)..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\_setup\Extract-Complete.ps1" -Archive "$INSTDIR\_setup\jarvis-complete-payload.zip" -Destination "$INSTDIR"'

  Delete "$INSTDIR\_setup\jarvis-complete-payload.zip"
  Delete "$INSTDIR\_setup\Extract-Complete.ps1"
  Delete "$INSTDIR\_setup\vc_redist.x64.exe"
  RMDir  "$INSTDIR\_setup"

  ; Icône installée avec le produit + adresse locale de l'agent vocal
  SetOutPath "$INSTDIR"
  File "assets\jarvis.ico"
  File "Jarvis.exe"
  File "LICENCE.txt"
  File "LISEZ-MOI-WINDOWS-11.txt"
  File "Ouvrir-Jarvis.vbs"
  FileOpen $0 "$INSTDIR\agent\server_url.txt" w
  FileWrite $0 "http://127.0.0.1:3210"
  FileClose $0
SectionEnd

Section "Icône sur le bureau" SEC_DESKTOP
  ; Le raccourci lance l'interface visible et attend le démarrage complet.
  ; On transmet le dossier en argument car le lanceur lit le chemin de son propre fichier.
  CreateShortcut "$DESKTOP\Jarvis.lnk" "$INSTDIR\Jarvis.exe" "" "$INSTDIR\Jarvis.exe" 0
SectionEnd

Section "Démarrage automatique avec Windows" SEC_AUTOSTART
  ; L'autostart utilise le lanceur silencieux (sans ouvrir de navigateur)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "JarvisComplete" '$\"$INSTDIR\Jarvis-Silencieux.vbs$\"'
SectionEnd

Section "Protocole jarvis:// (ouverture directe depuis le navigateur)" SEC_PROTOCOL
  ; jarvis:// ouvre Jarvis, y compris depuis un lien web ou un autre logiciel
  WriteRegStr HKCR "jarvis" "" "URL:Jarvis Protocol"
  WriteRegStr HKCR "jarvis" "URL Protocol" ""
  WriteRegStr HKCR "jarvis\DefaultIcon" "" '"$INSTDIR\jarvis.ico",0'
  WriteRegStr HKCR "jarvis\shell\open\command" "" '"$INSTDIR\Jarvis.exe"'
SectionEnd

Section "-Finalisation" SEC_FINAL
  ; Entrée complète dans « Paramètres → Applications »
  WriteRegStr HKLM "${REGKEY}" "DisplayName"    "${APPNAME}"
  WriteRegStr HKLM "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${REGKEY}" "Publisher"      "${PUBLISHER}"
  WriteRegStr HKLM "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${REGKEY}" "DisplayIcon"     '"$INSTDIR\Jarvis.exe",0'
  WriteRegStr HKLM "${REGKEY}" "UninstallString" '"$INSTDIR\Desinstaller-Jarvis.exe"'
  WriteRegDWORD HKLM "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${REGKEY}" "NoRepair" 1
  WriteRegDWORD HKLM "${REGKEY}" "EstimatedSizeKB" 550000
  WriteRegStr HKLM "${REGKEY}" "HelpLink" "http://127.0.0.1:3210/install"

  WriteUninstaller "$INSTDIR\Desinstaller-Jarvis.exe"

  CreateDirectory "$SMPROGRAMS\Jarvis"
  CreateShortcut "$SMPROGRAMS\Jarvis\Ouvrir Jarvis.lnk" "$INSTDIR\Jarvis.exe" "" "$INSTDIR\Jarvis.exe" 0
  CreateShortcut "$SMPROGRAMS\Jarvis\Démarrage avec diagnostic.lnk" "$INSTDIR\Jarvis-Console.bat" "" "$SYSDIR\cmd.exe" 0
  CreateShortcut "$SMPROGRAMS\Jarvis\Diagnostic.lnk" "powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Diagnostic-Jarvis.ps1"' "$SYSDIR\cmd.exe" 0
  ; Fichier de clés : copié depuis .env.modele s'il n'existe pas encore,
  ; jamais écrasé lors d'une mise à jour (les clés de l'utilisateur survivent).
  IfFileExists "$INSTDIR\app\.env" EnvDone
  IfFileExists "$INSTDIR\app\.env.modele" 0 EnvDone
    CreateDirectory "$INSTDIR\app"
    CopyFiles "$INSTDIR\app\.env.modele" "$INSTDIR\app\.env"
  EnvDone:

  CreateShortcut "$SMPROGRAMS\Jarvis\Mes clés (.env).lnk" "powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\Ouvrir-Cles.ps1"' "$INSTDIR\Jarvis.exe" 0
  CreateShortcut "$SMPROGRAMS\Jarvis\Arrêter Jarvis.lnk" "$INSTDIR\Stop-Jarvis.bat" "" "$SYSDIR\cmd.exe" 0
  CreateShortcut "$SMPROGRAMS\Jarvis\Désinstaller.lnk" "$INSTDIR\Desinstaller-Jarvis.exe"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_CORE}    "Interface Iron Man, serveur Node.js, PostgreSQL portable, agent vocal et moteur de recherche. Indispensable."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DESKTOP} "Icône de lancement sur le bureau."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_AUTOSTART} "Jarvis démarre automatiquement à l'ouverture de votre session (écoute du mot-clé active)."
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_PROTOCOL} "Permet qu'un lien jarvis://accueil ouvre directement Jarvis depuis n'importe quel logiciel."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ══════════════════════════════════════════════════════════════════
Section "Uninstall"
  DetailPrint "Arrêt complet de Jarvis, Node.js et PostgreSQL..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Stop-Jarvis.ps1"'
  Sleep 1500

  ; Arrêt forcé de tout reste (avant suppression de fichiers)
  nsExec::ExecToLog 'taskkill /F /FI "IMAGENAME eq pythonw.exe" /FI "WINDOWTITLE eq jarvis*"'
  nsExec::ExecToLog 'taskkill /F /FI "MODULES eq $INSTDIR\runtime\postgres\bin\*"'

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "JarvisComplete"
  DeleteRegKey   HKLM "${REGKEY}"
  DeleteRegKey   HKCR "jarvis"

  Delete "$DESKTOP\Jarvis.lnk"
  RMDir /r "$SMPROGRAMS\Jarvis"

  ; Propose de conserver ou effacer les données personnelles de Jarvis
  MessageBox MB_YESNO|MB_ICONQUESTION "Supprimer aussi les données personnelles de Jarvis (conversations, notes, mémoire, journaux dans %LOCALAPPDATA%\JarvisCompleteData) ?$\n$\nOui = tout effacer.$\nNon = conserver vos données." /SD IDNO IDYES Uninst_DeleteData
  DetailPrint "Les données personnelles sont conservées."
  Goto Uninst_DeleteApp
Uninst_DeleteData:
  DetailPrint "Suppression des données personnelles..."
  RMDir /r "$LOCALAPPDATA\JarvisCompleteData"
Uninst_DeleteApp:
  RMDir /r "$INSTDIR"
SectionEnd
