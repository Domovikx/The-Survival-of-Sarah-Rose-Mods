@echo off
rem ============================================================
rem  Start TSSR VOX queues (VoxCPM, ALL languages by default).
rem  Resumable: continues after stop/reboot/crash (--resume).
rem  Low priority (BelowNormal) - does not disturb interactive work.
rem  Logs: output\voice\vox_gen_{lang}.log
rem  Control: voice-status / vox-stop / vox-pause / vox-resume
rem  Usage: vox-start.cmd [lang|all]   (ru en de es fr it ja ko pl pt zh)
rem ============================================================
node "%~dp0voice_ctl.mts" vox-start %*
echo.
pause
