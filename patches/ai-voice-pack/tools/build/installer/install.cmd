@echo off
rem TSSR AI Voice Pack - installer (double-click me).
rem main.zip: installs the CORE (texts of 11 languages, fonts, menu) - no audio.
rem voice-<lang>.zip: installs ONLY its own language (run each pack you want).
rem It finds the Steam game folder itself; close the game before installing.
rem UTF-8 console: the messages are Russian+English, CP866/437 would show garbage.
rem worker.ps1 = the installer engine (do NOT click it; install.cmd runs it).
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0worker.ps1" %*
echo.
pause
