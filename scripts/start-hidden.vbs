' Start TermBridge with no console window (used by the logon task).
' Its output goes to logs\termbridge.log, written by server.js.
Dim sh, root, script
Set sh = CreateObject("WScript.Shell")
root = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\scripts\") - 1)
script = root & "\scripts\start.ps1"
sh.CurrentDirectory = root
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & script & """", 0, False
