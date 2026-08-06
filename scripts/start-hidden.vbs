' TermBridge をウィンドウ非表示で起動する（自動起動用）
' ログは logs\termbridge.log に出力される（server.js 側で書き込み）
Dim sh, fso, root, node
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\scripts\") - 1)
node = root & "\runtime\node\node.exe"
If Not fso.FileExists(node) Then node = "node"
sh.CurrentDirectory = root
sh.Run """" & node & """ """ & root & "\server.js""", 0, False
