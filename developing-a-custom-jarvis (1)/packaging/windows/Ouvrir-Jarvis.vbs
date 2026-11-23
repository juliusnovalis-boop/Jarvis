' ===============================================================
'  OUVRIR JARVIS - lanceur visible (icone bureau / menu Demarrer)
'  Demarre les services si besoin, puis OUVRE LA FENETRE bureau.
'  En cas d'echec : boite de dialogue avec le journal.
' ===============================================================

Set shell  = CreateObject("Wscript.Shell")
Set fso    = CreateObject("Scripting.FileSystemObject")
dim dir : dir = fso.GetParentFolderName(WScript.ScriptFullName)

Set execObj = shell.Exec( _
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & dir & "\Start-Jarvis.ps1""")

' Attente de la fin du demarrage (max ~2 minutes)
dim waited : waited = 0
Do While execObj.Status = 0
  WScript.Sleep 500
  waited = waited + 1
  If waited > 240 Then execObj.Terminate() : Exit Do
Loop

If execObj.ExitCode <> 0 Then
  dim details : details = execObj.StdErr.ReadAll()
  If Len(details) = 0 Then details = execObj.StdOut.ReadAll()
  MsgBox "Jarvis n'a pas pu demarrer." & vbCrLf & vbCrLf & _
         "Journal : %LOCALAPPDATA%\JarvisCompleteData\logs\launcher.log" & vbCrLf & _
         Left(details, 900), vbCritical, "J.A.R.V.I.S. - erreur de demarrage"
End If
