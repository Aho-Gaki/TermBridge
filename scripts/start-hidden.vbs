' Start TermBridge with no console window (used by the logon task).
' Its output goes to logs\termbridge.log, written by server.js.
Dim sh, fso, root, node
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\scripts\") - 1)
node = root & "\runtime\node\node.exe"
If Not fso.FileExists(node) Then node = "node"
sh.CurrentDirectory = root
sh.Run """" & node & """ """ & root & "\server.js""", 0, False
