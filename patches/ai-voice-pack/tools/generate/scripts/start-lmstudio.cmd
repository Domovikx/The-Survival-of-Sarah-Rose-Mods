@echo off
rem ============================================================
rem  Start LM Studio headless server + load research model
rem  (RTX 5070 Ti / CUDA; GUI не нужен)
rem  Server: http://127.0.0.1:1234/v1  (OpenAI-compatible)
rem  Model:  qwen/qwen3.5-9b  (6.1 GB, full GPU offload, ~100+ tok/s)
rem  USE:    ALWAYS http://127.0.0.1:1234, NOT localhost
rem  Boot:   ярлык в shell:startup запускает этот скрипт после входа
rem  Check:  lms server status  /  curl 127.0.0.1:1234/v1/models
rem ============================================================
set LMS=%USERPROFILE%\.lmstudio\bin\lms.exe

"%LMS%" server start

rem Сервис просыпается секунды; retry — на случай холодного старта системы.
for /L %%i in (1,1,5) do (
    "%LMS%" load qwen/qwen3.5-9b --gpu max
    if not errorlevel 1 goto :ok
    timeout /t 3 /nobreak >nul
)
echo WARN: model not loaded after 5 tries - run: lms server status
:ok
"%LMS%" server status
