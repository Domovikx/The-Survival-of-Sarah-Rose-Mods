@echo off
rem ============================================================
rem  Quick TSSR voice status: workers, active arcs, progress, logs.
rem  Usage: voice-status.cmd [ru|en|all]
rem ============================================================
node "%~dp0voice_ctl.mts" status %*
echo.
pause
