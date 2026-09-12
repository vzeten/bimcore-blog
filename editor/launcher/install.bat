@echo off
setlocal
title BIMCORE Editor - install launcher

rem Thin ASCII wrapper: the work is in install.ps1, because the shortcut file name is Cyrillic and
rem a batch file cannot carry it reliably. Run this only after the operation is merged into editor;
rem it refuses and changes nothing while that is not true.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause