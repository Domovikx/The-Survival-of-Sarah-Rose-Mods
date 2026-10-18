@echo off
rem ============================================================
rem  Night chunked push STARTED BY TASK SCHEDULER at 23:00
rem  (no --at: it must push immediately, not wait another day).
rem  Runs until 06:00 or until nothing left to push.
rem  Stop: create output\voice\push.stop
rem ============================================================
python "%~dp0voice_push_chunked.py" --until 06:00 --chunk-mb 700 >> "%~dp0..\output\voice\push_night.out" 2>&1 %*
