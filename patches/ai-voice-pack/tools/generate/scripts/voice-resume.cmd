@echo off
rem ============================================================
rem  Resume paused TSSR voice workers (RU+EN by default).
rem  Usage: voice-resume.cmd [ru|en|all]
rem ============================================================
python "%~dp0voice_ctl.py" resume %*
echo.
pause
