@echo off
rem ============================================================
rem  Convert opus STARTED BY TASK SCHEDULER at 23:00 (TSSR-ConvertOpus).
rem  Converts all remaining wavs, THEN starts voice queues
rem  (voice_ctl start all) - voice gen resumes after opus is done.
rem  Stop: convert-opus-stop.cmd (queues will NOT start if stopped).
rem  Logs: output\voice\convert_opus.log (+ .night.log)
rem ============================================================
set ROOT=%~dp0..
cd /d "%ROOT%"
if not exist output\voice mkdir output\voice
del /q output\voice\convert_opus.stop 2>nul
del /q output\voice\convert_opus.pause 2>nul
echo [%date% %time%] night convert start >> output\voice\convert_opus.night.log
python tools\convert_all_opus.py --workers 8 >> output\voice\convert_opus.log 2>&1
set RC=%ERRORLEVEL%
echo [%date% %time%] convert exit code %RC% >> output\voice\convert_opus.night.log
if "%RC%"=="0" (
  echo [%date% %time%] conversion done - starting voice queues >> output\voice\convert_opus.night.log
  python tools\voice_ctl.py start all >> output\voice\convert_opus.night.log 2>&1
) else (
  echo [%date% %time%] conversion not finished (rc=%RC%) - voice queues NOT started >> output\voice\convert_opus.night.log
)
