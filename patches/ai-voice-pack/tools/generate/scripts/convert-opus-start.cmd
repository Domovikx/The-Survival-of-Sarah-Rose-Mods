@echo off
rem ============================================================
rem  Start wav->opus 24k conversion (all arcs, both langs).
rem  Resumable: skips done opus, continues after stop.
rem  WAV stays in place: game prefers opus, wav = fallback.
rem  Logs: output\voice\convert_opus.log
rem  Control: convert-opus-status / -pause / -resume / -stop
rem ============================================================
python "%~dp0convert_opus_ctl.py" start %*
echo.
pause
