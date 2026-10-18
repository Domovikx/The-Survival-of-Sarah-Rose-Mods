@echo off
rem ============================================================
rem  Pause wav->opus conversion (finishes current chunk, idles).
rem  Frees CPU. Resume: convert-opus-resume.cmd
rem ============================================================
python "%~dp0convert_opus_ctl.py" pause %*
echo.
pause
