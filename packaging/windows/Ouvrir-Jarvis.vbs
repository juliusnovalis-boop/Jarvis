' ===============================================================
'  OUVRIR JARVIS - lanceur visible (icone bureau / menu Demarrer)
'  Demarre les services si besoin, puis OUVRE LA FENETRE bureau.
'  En cas d'echec : boite de dialogue avec le journal.
' ===============================================================

Set shell  = CreateObject("Wscript.Shell")
Set fso    = CreateObject("Scripting.FileSystemObject")
dim dir : dir = fso.GetParentFolderName(WScript.ScriptFullName)

' Lancement SANS fenêtre : style 0 = masqué. Ni PowerShell, ni Python
' n'apparaissent sur le bureau. Attente de la fin (max ~2 minutes).
dim exitCode
exitCode = shell.Run( _
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\Start-Jarvis.ps1""", _
  0, True)

If exitCode <> 0 Then
  MsgBox "Jarvis n'a pas pu demarrer." & vbCrLf & vbCrLf & _
         "Aucune fenêtre n'a été ouverte : consultez le journal" & vbCrLf & _
         "%LOCALAPPDATA%\JarvisCompleteData\logs\launcher.log", _
         vbCritical, "J.A.R.V.I.S. - erreur de demarrage"
End If
