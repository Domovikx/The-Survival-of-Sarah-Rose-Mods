@echo off
rem ============================================================
rem  Stop LM Studio: unload models (frees VRAM/RAM) + stop server.
rem  Use when the PC needs resources back — e.g. before CosyVoice
rem  voice generation (CUDA needs the VRAM).
rem  Restart: start-lmstudio.cmd (после ребута — автозагрузка сама).
rem ============================================================
set LMS=%USERPROFILE%\.lmstudio\bin\lms.exe

"%LMS%" unload --all
"%LMS%" server stop
"%LMS%" server status
