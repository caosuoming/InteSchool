Option Explicit
Dim shell, fs, dir, originUri, command, quote, answer
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
dir = fs.GetParentFolderName(WScript.ScriptFullName)
quote = Chr(34)
originUri = ""
If WScript.Arguments.Count > 0 Then
  originUri = WScript.Arguments(0)
  ' Protocol arguments come from an untrusted website.
  If Len(originUri) > 600 Or InStr(originUri, quote) > 0 Or InStr(originUri, vbCr) > 0 Or InStr(originUri, vbLf) > 0 Then WScript.Quit 1
  If LCase(Left(originUri, Len("inteschool-scanner://connect?"))) <> "inteschool-scanner://connect?" Then WScript.Quit 1
  answer = MsgBox("Allow this website to access the local scanner?" & vbCrLf & vbCrLf & originUri & vbCrLf & vbCrLf & "Only approve websites you trust.", vbQuestion + vbYesNo + vbDefaultButton2, "InteSchool Scanner Authorization")
  If answer <> vbYes Then WScript.Quit 0
End If
command = quote & dir & "\node.exe" & quote & " " & quote & dir & "\scripts\scanner-launcher.mjs" & quote
If originUri <> "" Then command = command & " " & quote & originUri & quote
shell.Run command, 0, False
' The background Node service intentionally has no Windows notification icon.
' Start a single Windows Forms tray controller for visible status and repair actions.
Dim trayCommand
trayCommand = quote & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe" & quote & " -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File " & quote & dir & "\scanner-tray.ps1" & quote
shell.Run trayCommand, 0, False
