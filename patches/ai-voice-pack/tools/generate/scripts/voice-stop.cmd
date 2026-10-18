@echo off
rem ============================================================
rem  Stop TSSR voice queues (RU+EN by default).
rem  Safe: done wavs stay valid, restart continues (resumable).
rem  Usage: voice-stop.cmd [ru|en|all]
rem ============================================================
python "%~dp0voice_ctl.py" stop %*
echo.
pause
