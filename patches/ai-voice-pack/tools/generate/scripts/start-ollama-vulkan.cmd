@echo off
rem ============================================================
rem  Start ollama Vulkan server (AMD RX 6600 XT, driver 26.8.1)
rem  WHY: without OLLAMA_VULKAN=1 ollama falls back to CPU
rem        (5.5 tok/s) or the tray app's slow CPU server (2.6 tok/s).
rem        With Vulkan: 39 tok/s, 100% GPU.
rem  USE:  ALWAYS http://127.0.0.1:11434, NOT localhost
rem        (localhost may resolve to ::1 -> tray CPU server).
rem  Re-run after every PC reboot. No admin needed.
rem ============================================================
set OLLAMA_VULKAN=1
set OLLAMA_KEEP_ALIVE=30m

start "ollama-vulkan" /min cmd /c "ollama serve > %~dp0..\output\voice\ollama_vk.log 2>&1"

timeout /t 6 /nobreak >nul
echo.
echo Vulkan server is starting on 127.0.0.1:11434 ...
echo Check: ollama ps  (PROCESSOR must say 100% GPU)
echo Log:   output\voice\ollama_vk.log
ollama ps