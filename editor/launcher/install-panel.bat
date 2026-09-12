@echo off
setlocal
title BIMCORE Editor - install panel shortcut

rem Thin ASCII wrapper, same reason as install.bat: a batch file is read in the console code page
rem and Cyrillic paths turn into garbage. All the work is in install-panel.ps1.
rem Run this only after the panel operation is merged into editor and the panel already answers
rem on port 4779 from the accepted copy; otherwise it refuses and changes nothing.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-panel.ps1"
pause
