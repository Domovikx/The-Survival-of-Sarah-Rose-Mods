@echo off
rem ============================================================
rem  Voice autocommit: packs new ai_voice/ files into ~1000-file
rem  commits, NO push. Close window to stop.
rem  Usage: voice-autocommit.cmd [--batch 1000] [--interval 300] [--once]
rem ============================================================
python "%~dp0voice_autocommit.py" %*
echo.
pause
