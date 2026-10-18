@echo off
rem ============================================================
rem  Resume paused wav->opus conversion.
rem ============================================================
python "%~dp0convert_opus_ctl.py" resume %*
echo.
pause
