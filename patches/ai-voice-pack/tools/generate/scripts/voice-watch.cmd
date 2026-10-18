@echo off
rem ============================================================
rem  Live TSSR voice monitor (refresh every 30s, Ctrl+C to exit).
rem  Usage: voice-watch.cmd [ru|en|all]
rem ============================================================
python "%~dp0voice_ctl.py" watch %*
