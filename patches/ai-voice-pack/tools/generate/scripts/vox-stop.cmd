@echo off
rem ============================================================
rem  Stop TSSR VOX queues (kills queue + bench trees).
rem  Nothing is lost: restart continues from where it stopped.
rem  Usage: vox-stop.cmd [lang|all]
rem ============================================================
node "%~dp0voice_ctl.mts" vox-stop %*
echo.
pause
