# E2E-прогон меню мода в РЕАЛЬНОЙ игре (движок: zz_menu_e2e.rpy).
#
# ЧТО ДЕЛАЕТ: копирует харнесс в <игра>/mods/_tssr-test-e2e/, запускает игру по
# разу на язык, собирает из log.txt строки TSSR_E2E (PASS/FAIL/SUMMARY) и
# возвращает код 1, если были падения. Скриншоты — в <репа>/tmp/shots/e2e/.
#
# ГРАНИЦА УСТАНОВКИ: в игру пишется только mods/_tssr-test-e2e/ (удаляется в
# finally). Всё остальное — в репу.
#
# Использование (из корня репы):
#   powershell -ExecutionPolicy Bypass -File ^
#     patches\ai-voice-pack\tools\generate\scripts\menu_e2e.ps1 -Lang ru,zh,ja,ko
param(
    # Языки списком через запятую: через -File PowerShell не разбирает массивы,
    # поэтому строка, а не [string[]].
    [string]$Lang = "ru,zh",
    [string]$GameDir = "C:\Program Files (x86)\Steam\steamapps\common\The Survival of Sarah Rose"
)

$ErrorActionPreference = "Stop"
$exe = Join-Path $GameDir "TheSurvivalofSarahRose.exe"
if (!(Test-Path $exe)) { throw "не найден $exe" }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\..")).Path
$shotsDir = Join-Path $repoRoot "tmp\shots\e2e"
New-Item -ItemType Directory -Force -Path $shotsDir | Out-Null
$harnessSrc = Join-Path $PSScriptRoot "zz_menu_e2e.rpy"
$harnessDir = Join-Path $GameDir "mods\_tssr-test-e2e"
$log = Join-Path $GameDir "log.txt"

$totalFail = 0

try {
    # Синхронизация репа -> установка: E2E должен проверять ТЕКУЩИЙ код
    # (zzz_ui.rpy и строки UI), иначе он валидирует вчерашнюю установку.
    $patchDir = Join-Path $repoRoot "patches/ai-voice-pack"
    $modDir = Join-Path $GameDir "mods/tssr-ai-voice-pack"
    if (Test-Path $modDir) {
        Copy-Item (Join-Path $patchDir "zzz_ui.rpy") (Join-Path $modDir "zzz_ui.rpy") -Force
        foreach ($l in @("ru", "zh", "de", "es", "fr", "it", "ja", "ko", "pl", "pt")) {
            $srcTl = Join-Path $patchDir "tl/$l/screens.rpy"
            $dstTl = Join-Path $modDir "tl/$l/screens.rpy"
            if ((Test-Path $srcTl) -and (Test-Path (Split-Path $dstTl))) { Copy-Item $srcTl $dstTl -Force }
        }
        # Каталог (label_arc/voice_list/progress) — артефакт сборки: обновляем
        # его тем же генератором, иначе меню покажет вчерашние цифры демо.
        $catalogScript = Join-Path $patchDir "tools/generate/scripts/catalog_gen.mts"
        if (Test-Path $catalogScript) {
            node $catalogScript --out-dir (Join-Path $modDir "catalog") | Out-Host
        }
        Write-Host ">>> синхронизировано в установку: zzz_ui.rpy + tl/*/screens.rpy + catalog"
    } else {
        Write-Host ">>> ВНИМАНИЕ: установленного мода нет, проверяем как есть"
    }

    New-Item -ItemType Directory -Force -Path $harnessDir | Out-Null
    Copy-Item $harnessSrc (Join-Path $harnessDir "zz_menu_e2e.rpy") -Force

    $env:TSSR_E2E = "1"
    $env:TSSR_E2E_DIR = $shotsDir
    $env:RENPY_SKIP_SPLASHSCREEN = "1"

    $langs = $Lang.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    foreach ($l in $langs) {
        if (Test-Path $log) { Remove-Item $log -Force }
        $env:TSSR_E2E_LANG = $l
        Write-Host ">>> e2e / $l"
        $p = Start-Process -FilePath $exe -WorkingDirectory $GameDir -PassThru
        $p.WaitForExit(180000) | Out-Null
        if (!$p.HasExited) { $p.Kill() }

        if (!(Test-Path $log)) { Write-Host "   нет log.txt"; $totalFail++; continue }
        $lines = Select-String -Path $log -Pattern "TSSR_E2E" | ForEach-Object { $_.Line }
        $fails = $lines | Where-Object { $_ -match "TSSR_E2E FAIL" }
        $summary = $lines | Where-Object { $_ -match "TSSR_E2E SUMMARY" }
        if ($summary) { Write-Host ("   " + ($summary -join " ")) } else { Write-Host "   нет SUMMARY (сценарий не дошёл до конца)"; $totalFail++ }
        if ($fails) { $fails | ForEach-Object { Write-Host ("   " + $_) }; $totalFail += $fails.Count }
        # шум в логе: исключение внутри шага = тест не выполнился
        $exc = $lines | Where-Object { $_ -match "exception:" }
        if ($exc) { $exc | ForEach-Object { Write-Host ("   " + $_) }; $totalFail += $exc.Count }
    }
} finally {
    Remove-Item -Recurse -Force $harnessDir -ErrorAction SilentlyContinue
    Remove-Item Env:TSSR_E2E -ErrorAction SilentlyContinue
    Remove-Item Env:TSSR_E2E_LANG -ErrorAction SilentlyContinue
    Remove-Item Env:TSSR_E2E_DIR -ErrorAction SilentlyContinue
}

Write-Host "=== E2E: падений $totalFail"
if ($totalFail -gt 0) { exit 1 }
