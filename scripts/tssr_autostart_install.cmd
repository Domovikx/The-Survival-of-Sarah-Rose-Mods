@echo off
rem tssr_autostart_install.cmd - автозапуск контура TSSR при входе в систему.
rem Кладёт .vbs в папку «Автозагрузка» текущего пользователя (прав админа не нужно).
rem wscript не имеет консоли, conhost --headless даёт консоль без окна — на панели
rem задач ничего не появляется (иначе Windows Terminal рисует кнопку node.exe).
setlocal
set "REPO=%~dp0.."
pushd "%REPO%"
set "REPO=%CD%"
popd
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\TSSR-start.vbs"
> "%TARGET%" echo Set sh = CreateObject("WScript.Shell")
>> "%TARGET%" echo sh.Run "conhost.exe --headless cmd /c ""cd /d %REPO% && node --experimental-strip-types scripts\tssr_start_all.mts""", 0, False
echo Автозапуск установлен: %TARGET%
echo Снять: scripts\tssr_autostart_remove.cmd
