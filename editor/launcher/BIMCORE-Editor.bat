@echo off
setlocal
title BIMCORE Editor

rem Candidate launcher for the accepted editor. It becomes the owner's shortcut only through
rem install.bat, and only after the accepted worktree already answers /api/identity.

set "EDITOR_WORKTREE=C:\My_code\bimcore-blog\editor\.coordination\worktrees\accepted-editor"
set "EDITOR_DIR=%EDITOR_WORKTREE%\editor"
set "EDITOR_MATERIALS=C:\My_code\bimcore-blog"
set "EDITOR_URL=http://localhost:4780/"
set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"

rem Never inherit the trial switches in the owner's launcher.
set "EDITOR_TRIAL_ROOT="
set "EDITOR_PORT="

if not exist "%EDITOR_DIR%\server.mjs" (
  echo BIMCORE Editor was not found in the accepted editor worktree.
  echo Expected: %EDITOR_DIR%
  pause
  exit /b 1
)

rem Git is asked through powershell on purpose: a "for /f" command that starts with a quoted path
rem loses its quotes in cmd, and the answer always came back empty.
set "EDITOR_BRANCH="
for /f "delims=" %%B in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '%GIT_EXE%' -C '%EDITOR_WORKTREE%' branch --show-current 2>$null"') do set "EDITOR_BRANCH=%%B"
if /I not "%EDITOR_BRANCH%"=="editor" (
  echo Refusing to start: the accepted worktree is on "%EDITOR_BRANCH%", not "editor".
  pause
  exit /b 1
)

set "EDITOR_COMMIT="
for /f "delims=" %%C in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '%GIT_EXE%' -C '%EDITOR_WORKTREE%' rev-parse --short HEAD 2>$null"') do set "EDITOR_COMMIT=%%C"
if "%EDITOR_COMMIT%"=="" (
  echo Refusing to start: cannot read the accepted commit of %EDITOR_WORKTREE%.
  pause
  exit /b 1
)

set "EDITOR_DIRT="
for /f "delims=" %%D in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s = & '%GIT_EXE%' -C '%EDITOR_WORKTREE%' status --porcelain 2>$null; if ($s) { 'dirty' } else { 'clean' }"') do set "EDITOR_DIRT=%%D"
if /I not "%EDITOR_DIRT%"=="clean" (
  echo Refusing to start: the accepted worktree has uncommitted changes.
  echo Expected a clean %EDITOR_WORKTREE%.
  pause
  exit /b 1
)

rem Ask whoever answers on port 4780 who it is, and believe only what git has just confirmed:
rem the very folder of the accepted code and the very commit checked out in it. The server's own
rem "accepted" flag is never enough - any program can answer with it. Anything that does not match
rem is left alone: not opened, not replaced, not stopped.
set "IDBODY=$r=$null; $ok=$false; $live=$false; try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 '%EDITOR_URL%api/identity'; $live=$true } catch { if ($_.Exception.Response) { $live=$true } }; if ($r) { try { $i = $r.Content | ConvertFrom-Json } catch { $i = $null }; $same = { param($a,$b) (($a -replace '/','\').TrimEnd('\')) -ieq (($b -replace '/','\').TrimEnd('\')) }; if ($i -and $i.role -eq 'owner' -and $i.accepted -eq $true -and $i.clean -eq $true -and $i.branch -eq 'editor' -and $i.commit -eq '%EDITOR_COMMIT%' -and [int]$i.port -eq 4780 -and (& $same $i.code '%EDITOR_DIR%') -and (& $same $i.materials '%EDITOR_MATERIALS%')) { $ok=$true } }"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "%IDBODY%; if ($ok) { exit 0 }; if ($live) { exit 2 }; exit 3"
set "PROBE=%errorlevel%"

if "%PROBE%"=="0" (
  start "" "%EDITOR_URL%"
  exit /b 0
)

if "%PROBE%"=="2" (
  echo Refusing to open: port 4780 is already answering, but not as your accepted editor.
  echo Expected code %EDITOR_DIR% at commit %EDITOR_COMMIT% with materials %EDITOR_MATERIALS%.
  echo Nothing was opened, started or stopped. Close that program, then run this file again.
  pause
  exit /b 1
)

rem Nobody is on the port: start the accepted editor here, and open the browser only once the
rem running server proves itself to be this very code at this very commit.
start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "for ($n=0; $n -lt 40; $n++) { Start-Sleep -Seconds 2; %IDBODY%; if ($ok) { Start-Process '%EDITOR_URL%'; break } }"
cd /d "%EDITOR_DIR%"
"%NODE_EXE%" "%EDITOR_DIR%\server.mjs"

echo.
echo BIMCORE Editor stopped. Press any key to close this window.
pause >nul