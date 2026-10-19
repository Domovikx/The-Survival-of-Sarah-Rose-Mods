# Съёмка скриншотов игры для лендинга и живого UI-теста (движок: zz_capture.rpy).
#
# ГРАНИЦА УСТАНОВКИ: в папку игры ничего не пишется, кроме mods/. Харнесс
# временно деплоится в <игра>/mods/_tssr-test/ и УДАЛЯЕТСЯ по завершении;
# скриншоты пишутся в РЕПУ (<репа>/tmp/shots, игнорируется git).
#
# Использование (из репы):
#   powershell -ExecutionPolicy Bypass -File ^
#     patches\ai-voice-pack\tools\generate\scripts\shots_capture.ps1 ^
#     -GameDir "C:\Program Files (x86)\Steam\steamapps\common\The Survival of Sarah Rose" ^
#     [-Mode menu|game|all] [-Lang ru|en|all] [-Save]
#
#   menu  - главное меню + страница настроек (~13 c на язык)
#   game  - диалоговые кадры пролога с авто-протоком AFM (~66 c на язык,
#          кадр каждые 2.5с -> 24 кадра на отбор)
#   -Save - разрешить запись в persistent. НУЖЕН ТОЛЬКО ОДИН РАЗ: фикс
#           языка игрока (tools/read_persistent.py показывает текущее
#           значение). Обычные съёмки persistent НЕ трогают
#           (should_save_persistent=False внутри zz_capture.rpy).
#
# Результат: <репа>/tmp/shots/{ru|en}_{menu,settings}.png + dialogue1..24 (game)
# Дальше:    python <репа>/patches/ai-voice-pack/tools/generate/scripts/shots_for_site.py
#            -> site/public/shots/*.jpg
param(
    [Parameter(Mandatory = $true)][string]$GameDir,
    [ValidateSet("menu", "game", "all")][string]$Mode = "all",
    [ValidateSet("ru", "en", "all")][string]$Lang = "all",
    [switch]$Save
)

$ErrorActionPreference = "Stop"
$exe = Join-Path $GameDir "TheSurvivalofSarahRose.exe"
if (-not (Test-Path $exe)) { throw "не найден $exe" }

# Репа: scripts -> generate -> tools -> ai-voice-pack -> patches -> корень
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\..")).Path
$shotsDir = Join-Path $repoRoot "tmp\shots"
New-Item -ItemType Directory -Force -Path $shotsDir | Out-Null

# Харнесс: лежит рядом со скриптом (источник), деплой — строго в контейнер
# mods/ (движок подхватит через searchpath mods/_tssr-test/zz_capture.rpy).
$harnessSrc = Join-Path $PSScriptRoot "zz_capture.rpy"
if (-not (Test-Path $harnessSrc)) { throw "не найден $harnessSrc" }
$harnessDir = Join-Path $GameDir "mods\_tssr-test"

$modes = if ($Mode -eq "all") { @("menu", "game") } else { @($Mode) }
$langs = if ($Lang -eq "all") { @("ru", "en") } else { @($Lang) }

try {
    New-Item -ItemType Directory -Force -Path $harnessDir | Out-Null
    Copy-Item $harnessSrc (Join-Path $harnessDir "zz_capture.rpy") -Force

    $env:TSSR_SHOTS_DIR = $shotsDir

    foreach ($m in $modes) {
        foreach ($l in $langs) {
            $env:RENPY_SKIP_SPLASHSCREEN = "1"
            if ($m -eq "game") { $env:RENPY_SKIP_MAIN_MENU = "1" } else { Remove-Item Env:RENPY_SKIP_MAIN_MENU -ErrorAction SilentlyContinue }
            $env:TSSR_SHOTS = "1"
            $env:TSSR_SHOTS_MODE = $m
            $env:TSSR_SHOTS_LANG = $l
            if ($Save) { $env:TSSR_SHOTS_SAVE = "1" } else { Remove-Item Env:TSSR_SHOTS_SAVE -ErrorAction SilentlyContinue }

            Write-Host ">>> $m / $l $(if ($Save) { '(SAVE=1)' }) -> $shotsDir"
            # -WorkingDirectory ОБЯЗАТЕЛЕН: движок (Python 2 listdir) резолвит
            # относительный RENPY_SEARCHPATH="mods" от рабочей директории
            # процесса — без неё падает "path not found: mods\*.*".
            Start-Process -FilePath $exe -WorkingDirectory $GameDir
            if ($m -eq "game") { Start-Sleep -Seconds 66 } else { Start-Sleep -Seconds 13 }
        }
    }
}
finally {
    # Убрать харнесс (включая скомпилированный .rpyc) — установка остаётся чистой
    if (Test-Path $harnessDir) { Remove-Item -Recurse -Force $harnessDir }
    Remove-Item Env:TSSR_SHOTS_DIR, Env:TSSR_SHOTS, Env:TSSR_SHOTS_MODE,
        Env:TSSR_SHOTS_LANG, Env:TSSR_SHOTS_SAVE,
        Env:RENPY_SKIP_SPLASHSCREEN, Env:RENPY_SKIP_MAIN_MENU -ErrorAction SilentlyContinue
}

Write-Host "Готово: $shotsDir"
