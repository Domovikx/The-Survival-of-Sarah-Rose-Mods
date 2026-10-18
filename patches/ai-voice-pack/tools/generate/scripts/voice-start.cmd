@echo off
rem ============================================================
rem  Start TSSR voice queues (RU+EN by default).
rem  Resumable: continues from where it stopped, skips done wavs.
rem  Low priority (BelowNormal) - does not disturb interactive work.
rem  USE: double-click after every PC reboot. No admin needed.
rem  Logs: output\voice\gen_all_{ru,en}.log
rem  Control: voice-status / voice-stop / voice-pause / voice-resume
rem  Usage: voice-start.cmd [ru|en|all]
rem ============================================================
python "%~dp0voice_ctl.py" start %*
echo.
pause
