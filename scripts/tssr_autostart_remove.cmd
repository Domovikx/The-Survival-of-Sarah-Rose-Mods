@echo off
rem tssr_autostart_remove.cmd - снять автозапуск TSSR (процессы НЕ трогает).
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\TSSR-start.vbs" (del "%STARTUP%\TSSR-start.vbs" & echo Автозапуск снят) else (echo Автозапуск не установлен)
