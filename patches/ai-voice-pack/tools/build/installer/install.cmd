@echo off
rem TSSR AI Voice Pack - installer (double-click me).
rem Unpack this zip anywhere, then run this file: it finds the game folder,
rem asks your language and installs everything. Voice zip (optional) can be
rem placed next to this file beforehand.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
