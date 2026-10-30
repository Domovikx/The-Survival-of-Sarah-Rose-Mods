@echo off
rem ============================================================
rem  Unfreeze paused TSSR VOX queues (after vox-pause.cmd).
rem  Usage: vox-resume.cmd [lang|all]
rem ============================================================
node "%~dp0voice_ctl.mts" vox-resume %*
echo.
pause
