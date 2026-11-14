@echo off
rem translate-ctl.cmd — двойной клик: пульт адаптивного перевода (одно меню).
rem Всё остальное — CLI: node .opencode\skills\translate-adaptive\translate_ctl.mts <команда>
setlocal
chcp 65001 >nul
cd /d "%~dp0..\..\.."
set CTL=.opencode\skills\translate-adaptive\translate_ctl.mts

:menu
cls
echo ================  Адаптивный перевод  ================
node %CTL% status
echo.
echo   1  Старт перевода в текущем профиле
echo   2  Авто-режим: turbo, когда Вас нет
echo   3  Пауза - только перевод, Strata остаётся
echo   4  СТОП ВСЁ - перевод плюс Strata, освободить память
echo   5  Turbo сейчас
echo   6  Background сейчас
echo   7  Остановить авто-режим
echo   0  Выход
echo.
choice /c 12345670 /n /m "Выбор: "
if errorlevel 8 goto :end
if errorlevel 7 goto :wdstop
if errorlevel 6 goto :bg
if errorlevel 5 goto :turbo
if errorlevel 4 goto :stopall
if errorlevel 3 goto :pause
if errorlevel 2 goto :auto
if errorlevel 1 goto :start

:start
node %CTL% start
goto :after

:auto
node %CTL% auto --detach
goto :after

:pause
node %CTL% pause
goto :after

:stopall
node %CTL% stop
goto :after

:turbo
node %CTL% turbo
goto :after

:wdstop
node %CTL% watchdog-stop
goto :after

:bg
node %CTL% background
goto :after

:after
echo.
pause
goto :menu

:end
endlocal
