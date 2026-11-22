@echo off
rem ============================================================
rem  Scheduled start of TSSR VOX queues (no pause - for
rem  Windows Task Scheduler). Mirror of voice-sched-start.cmd
rem  for the VoxCPM branch.
rem  Usage: vox-sched-start.cmd [lang|all]   (default: all)
rem  Log: output\voice\vox_sched_start.log
rem ============================================================
cd /d "%~dp0.."
node "%~dp0voice_ctl.mts" vox-start %* >> "%~dp0..\output\voice\vox_sched_start.log" 2>&1
