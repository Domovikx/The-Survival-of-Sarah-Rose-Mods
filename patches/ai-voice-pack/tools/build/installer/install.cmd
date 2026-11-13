@echo off
rem TSSR AI Voice Pack - installer (double-click me).
rem TSSR-AI-Voice-Pack-main.7z: installs the CORE (texts of 11 languages, fonts, menu) - no audio.
rem TSSR-AI-Voice-Pack-voice-<lang>.7z: installs ONLY its own language (run each pack you want).
rem It finds the Steam game folder itself; close the game before installing.
rem Archives are .7z (unpack with 7-Zip: https://7-zip.org/ or Windows built-in .7z support).
rem UTF-8 console: the messages are Russian+English, CP866/437 would show garbage.
rem worker.ps1 = the installer engine (do NOT click it; install.cmd runs it).
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0worker.ps1" %*
echo.
pause
