@echo off
rem TSSR AI Voice Pack - installer (double-click me).
rem main.zip: installs the CORE (texts of 11 languages, fonts, menu) - no audio.
rem voice-<lang>.zip: installs ONLY its own language (run each pack you want).
rem It finds the Steam game folder itself; close the game before installing.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
