@echo off
rem ============================================================
rem  Stop TSSR voice queues (RU+EN by default).
rem  Safe: done wavs stay valid, restart continues (resumable).
rem  Usage: voice-stop.cmd [ru|en|all]
rem ============================================================
node "%~dp0voice_ctl.mts" stop %*
echo.
pause
