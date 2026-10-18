# Съёмка скриншотов игры для лендинга (движок: game/zz_capture.rpy).
#
# Использование (из корня игры):
#   powershell -ExecutionPolicy Bypass -File tools\shots_capture.ps1
#     [-Mode menu|game|all] [-Lang ru|en|all] [-Save]
#
#   menu  - главное меню + страница настроек (~13 c на язык)
#   game  - диалоговые кадры пролога с авто-протоком AFM (~66 c на язык,
#          кадр каждые 2.5с -> 24 кадра на отбор))
#   -Save - разрешить запись в persistent. НУЖЕН ТОЛЬКО ОДИН РАЗ: фикс
#           языка игрока (tools/read_persistent.py показывает текущее
#           значение). Обычные съёмки persistent НЕ трогают
#           (should_save_persistent=False внутри zz_capture.rpy).
#
# Результат: tmp/shots/{ru|en}_{menu,settings}.png + dialogue1..24 (game)
# Дальше:    python tools/shots_for_site.py  ->  site/public/shots/*.jpg
param(
    [ValidateSet("menu", "game", "all")][string]$Mode = "all",
    [ValidateSet("ru", "en", "all")][string]$Lang = "all",
    [switch]$Save
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "TheSurvivalofSarahRose.exe"
if (-not (Test-Path $exe)) { throw "не найден $exe" }

$modes = if ($Mode -eq "all") { @("menu", "game") } else { @($Mode) }
$langs = if ($Lang -eq "all") { @("ru", "en") } else { @($Lang) }

foreach ($m in $modes) {
    foreach ($l in $langs) {
        $env:RENPY_SKIP_SPLASHSCREEN = "1"
        if ($m -eq "game") { $env:RENPY_SKIP_MAIN_MENU = "1" } else { Remove-Item Env:RENPY_SKIP_MAIN_MENU -ErrorAction SilentlyContinue }
        $env:TSSR_SHOTS = "1"
        $env:TSSR_SHOTS_MODE = $m
        $env:TSSR_SHOTS_LANG = $l
        if ($Save) { $env:TSSR_SHOTS_SAVE = "1" } else { Remove-Item Env:TSSR_SHOTS_SAVE -ErrorAction SilentlyContinue }

        Write-Host ">>> $m / $l $(if ($Save) { '(SAVE=1)' })"
        Start-Process -FilePath $exe
        if ($m -eq "game") { Start-Sleep -Seconds 66 } else { Start-Sleep -Seconds 13 }
    }
}

Write-Host "Готово: tmp\shots"
