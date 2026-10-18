@echo off
rem ============================================================
rem  Stop wav->opus conversion after current chunk.
rem  Safe: done opus stay valid, next start continues (resumable).
rem ============================================================
python "%~dp0convert_opus_ctl.py" stop %*
echo.
pause
