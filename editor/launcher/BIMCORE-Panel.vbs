' Owner's main shortcut: open the BIMCORE Editor instance panel.
'
' A .vbs and not a .bat for exactly one reason: a batch file always opens a black console window,
' and ordinary control over instances must happen without one. Nothing flashes here at all - the
' real work lives in panel-open.ps1 next door, started hidden.
'
' ASCII only on purpose, like BIMCORE-Editor.bat: the Windows Script Host reads a .vbs in the
' machine code page, and Cyrillic letters in it turn into garbage. Russian text belongs in the
' PowerShell file next door, which is saved with a byte order mark and reads correctly.

Option Explicit

Dim shell, folder, command
Set shell = CreateObject("Scripting.FileSystemObject")
folder = shell.GetParentFolderName(WScript.ScriptFullName)

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & folder & "\panel-open.ps1"""
CreateObject("WScript.Shell").Run command, 0, False
