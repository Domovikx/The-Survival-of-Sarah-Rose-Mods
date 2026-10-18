@echo off
rem Thermal guard: duty-cycle pausing of voice generation (anti-overheat).
rem Stop: create file output\voice\thermal.stop (guard resumes queues and exits).
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
if exist "output\voice\thermal.stop" del "output\voice\thermal.stop"
"C:\Python314\python.exe" tools\thermal_guard.py %*
echo.
echo Guard stopped. Log: output\voice\thermal_guard.log
pause
