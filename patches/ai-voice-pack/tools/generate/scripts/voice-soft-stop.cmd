@echo off
rem ============================================================
rem  Soft-stop TSSR voice queues (RU+EN by default).
rem  Finishes current file, then stops. Frees CPU+RAM, nothing lost.
rem  Safe: done wavs stay valid, restart continues (resumable).
rem  Usage: voice-soft-stop.cmd [ru|en|all] [--timeout 300]
rem ============================================================
python "%~dp0voice_ctl.py" soft-stop %*
echo.
pause
