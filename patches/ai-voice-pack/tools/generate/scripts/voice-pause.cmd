@echo off
rem ============================================================
rem  Pause TSSR voice workers (freeze processes, RU+EN by default).
rem  Frees CPU instantly, nothing is lost. Resume: voice-resume.cmd
rem  Usage: voice-pause.cmd [ru|en|all]
rem ============================================================
node "%~dp0voice_ctl.mts" pause %*
echo.
pause
