@echo off
rem ============================================================
rem  wav->opus conversion status (progress, speed, ETA, markers).
rem ============================================================
python "%~dp0convert_opus_ctl.py" status %*
echo.
pause
