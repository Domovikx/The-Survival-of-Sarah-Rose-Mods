@echo off
rem ============================================================
rem  Night chunked push: master -> origin, in ~700MB
rem  fast-forward chunks, from 23:00 until 06:00. No force push.
rem  Stop: create output\voice\push.stop (or close this window).
rem  Usage: voice-push-night.cmd [--at 23:00] [--until 06:00]
rem         [--chunk-mb 700] [--dry-run] [--once]
rem ============================================================
python "%~dp0voice_push_chunked.py" --at 23:00 --until 06:00 --chunk-mb 700 %*
echo.
pause
