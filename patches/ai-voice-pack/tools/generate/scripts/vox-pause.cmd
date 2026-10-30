@echo off
rem ============================================================
rem  Pause TSSR VOX queues (freeze processes).
rem  Frees CPU instantly, nothing is lost. Resume: vox-resume.cmd
rem  Usage: vox-pause.cmd [lang|all]
rem ============================================================
node "%~dp0voice_ctl.mts" vox-pause %*
echo.
pause
