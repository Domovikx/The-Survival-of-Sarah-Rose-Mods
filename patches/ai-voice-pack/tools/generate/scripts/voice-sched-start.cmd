@echo off
rem ============================================================
rem  Scheduled start of TSSR voice queues (no pause - for
rem  Windows Task Scheduler). Registered as TSSR-voice-23.
rem  See AGENTS.md: start only via voice_ctl (this wrapper).
rem ============================================================
cd /d "%~dp0.."
python "%~dp0voice_ctl.py" start >> "%~dp0..\output\voice\sched_start.log" 2>&1
