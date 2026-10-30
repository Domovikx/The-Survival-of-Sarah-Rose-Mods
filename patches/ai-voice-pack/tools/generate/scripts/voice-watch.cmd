@echo off
rem ============================================================
rem  Live TSSR voice monitor (refresh every 30s, Ctrl+C to exit).
rem  Usage: voice-watch.cmd [ru|en|all]
rem ============================================================
node "%~dp0voice_ctl.mts" watch %*
