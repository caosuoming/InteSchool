Option Explicit
Dim shell, fs, dir, originUri, command
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
dir = fs.GetParentFolderName(WScript.ScriptFullName)
originUri = ""
If WScript.Arguments.Count > 0 Then
  originUri = WScript.Arguments(0)
  ' The protocol URI is entirely untrusted. Reject shell metacharacters.
  If Len(originUri) > 600 Or InStr(originUri, """") > 0 Or InStr(originUri, vbCr) > 0 Or InStr(originUri, vbLf) > 0 Then WScript.Quit 1
  If LCase(Left(originUri, 29)) <> "inteschool-scanner://connect?" Then WScript.Quit 1
  If MsgBox("是否允许以下网站访问本机扫描仪？" & vbCrLf & vbCrLf & originUri & vbCrLf & vbCrLf & "仅在确认网页来源可信时选择“是”。", vbQuestion + vbYesNo + vbDefaultButton2, "InteSchool 扫描仪连接授权") <> vbYes Then WScript.Quit 0
End If
command = """" & dir & "\node.exe"" """ & dir & "\scripts\scanner-launcher.mjs"""
If originUri <> "" Then command = command & " """ & originUri & """"
shell.Run command, 0, False
