# TSSR AI Voice Pack — установщик ЯДРА (main.zip). БЕЗ АУДИО.
# Владелец 2026-11-12: «мэйн установщик, потом отдельные аудио-установщики,
# атомарно» — этот ставит только ядро (тексты, шрифты, меню, скрипты);
# папка ai_voice/ НЕ трогается (голоса живут в своих пакетах).
# Атомарность: ядро собирается в staging-каталог, затем меняется по блокам;
# прерывание не оставляет битого ai_voice и лечится повторным запуском.
# Запуск: install.cmd (двойной клик) или: powershell -File install.ps1
# Параметры: -GameDir <папка игры> — без авто-поиска (для скриптов/тестов).
param(
    [string]$GameDir = ""
)

$ErrorActionPreference = "Stop"
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-SteamLibraries {
    $libs = @()
    foreach ($key in @("HKCU:\Software\Valve\Steam", "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam")) {
        $p = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
        $steam = $p.SteamPath
        if (-not $steam) { $steam = $p.InstallPath }
        if ($steam -and (Test-Path $steam)) {
            $libs += $steam
            $vdf = Join-Path $steam "steamapps\libraryfolders.vdf"
            if (Test-Path $vdf) {
                foreach ($line in Get-Content $vdf) {
                    if ($line -match '"path"\s+"([^"]+)"') {
                        $libs += ($Matches[1] -replace '\\\\', '\')
                    }
                }
            }
            break
        }
    }
    return $libs
}

function Find-GameDir {
    foreach ($lib in (Find-SteamLibraries)) {
        $c = Join-Path $lib "steamapps\common\The Survival of Sarah Rose"
        if (Test-Path (Join-Path $c "game")) { return $c }
    }
    return $null
}

function Normalize-Path([string]$p) {
    if ($p -match '^/[a-zA-Z]/') { $p = $p[1].ToString().ToUpper() + ':' + $p.Substring(2) }
    $p = $p -replace '/', '\'
    return [System.IO.Path]::GetFullPath($p).TrimEnd('\')
}

Write-Host "TSSR AI Voice Pack - core installer / Установщик ядра"
Write-Host "======================================================="

# 1. Папка игры / Game folder
if (-not $GameDir) { $GameDir = Find-GameDir }
if (-not $GameDir) {
    Write-Host "Папка игры не найдена автоматически / Game folder not found."
    $GameDir = Read-Host "Введи путь к папке игры / Enter the game folder path"
}
$GameDir = Normalize-Path $GameDir
if (-not (Test-Path (Join-Path $GameDir "game"))) {
    Write-Host "ОШИБКА / ERROR: '$GameDir' не содержит папку game/ — это не папка игры."
    exit 1
}
Write-Host "Игра / Game: $GameDir"

# 2. Предохранитель: игра должна быть закрыта. Живой процесс держит локи на
#    шрифтах и файлах мода — атомарная замена падает «папка занята»
#    (поймано user_e2e 2026-11-12). Ждём до 3 минут: юзер закрывает игру.
$exeFile = Get-ChildItem -Path $GameDir -Filter "*.exe" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "SarahRose" } | Select-Object -First 1
if (-not $exeFile) {
    $exeFile = Get-ChildItem -Path $GameDir -Filter "*.exe" -File -ErrorAction SilentlyContinue |
        Select-Object -First 1
}
if ($exeFile) {
    $exeName = [System.IO.Path]::GetFileNameWithoutExtension($exeFile.Name)
    function Get-GameProcess { Get-Process -Name $exeName -ErrorAction SilentlyContinue }
    if (Get-GameProcess) {
        Write-Host ""
        Write-Host "Игра запущена. Закрой её — установка начнётся автоматически (до 3 мин)."
        Write-Host "The game is running. Close it — install starts by itself (3 min max)."
        for ($i = 0; $i -lt 36 -and (Get-GameProcess); $i++) { Start-Sleep -Seconds 5 }
        if (Get-GameProcess) {
            Write-Host "ОШИБКА / ERROR: игра всё ещё запущена / the game is still running."
            Write-Host "Закрой игру и запусти установщик снова / close it and rerun install.cmd."
            exit 4
        }
        Write-Host "Игра закрыта, продолжаю / game closed, continuing."
    }
}

# 3. Источник ядра (рядом с install.ps1) / Core payload
$modSrc = Join-Path $Src "mods\tssr-ai-voice-pack"
if (-not (Test-Path $modSrc)) {
    Write-Host "ОШИБКА / ERROR: рядом с install.ps1 нет mods/tssr-ai-voice-pack."
    Write-Host "Распакуй main.zip целиком и запусти установщик из него. / Unpack main.zip fully first."
    exit 1
}
$modDst = Join-Path $GameDir "mods\tssr-ai-voice-pack"
if ((Normalize-Path $modSrc) -eq (Normalize-Path $modDst)) {
    # main.zip распакован прямо в папку игры: ядро уже на месте
    Write-Host "Ядро уже на месте (main.zip распакован в папку игры) / Core already in place"
    Write-Host "ГОТОВО / DONE. Голоса ставятся СВОИМИ установщиками из voice-пакетов."
    exit 0
}

# 4. Атомарная установка ядра: staging -> замена блоками.
#    ai_voice/ НЕ трогаем (голоса ставит свой установщик пакета).
Write-Host ""
Write-Host "Ставлю ядро / Installing core (atomic) ..."
$stage = Join-Path $GameDir "mods\.tssr-core-staging"
$trash = Join-Path $GameDir "mods\.tssr-core-trash"
try {
    foreach ($d in @($stage, $trash)) {
        if (Test-Path $d) { Remove-Item -Recurse -Force $d }
        New-Item -ItemType Directory -Force -Path $d | Out-Null
    }
    # собрать ядро в staging (всё кроме ai_voice и служебных мусорок мода)
    foreach ($entry in Get-ChildItem -Path $modSrc) {
        if ($entry.Name -eq "ai_voice") { continue }
        Copy-Item -Recurse (Join-Path $modSrc $entry.Name) (Join-Path $stage $entry.Name)
    }
    New-Item -ItemType Directory -Force -Path $modDst | Out-Null
    # swap по блокам: старое -> trash (восстановимо до конца), новое -> место.
    # Ретраи до 30с: процесс игры закрывается асинхронно и кратко держит
    # локи на файлах мода (поймано user_e2e 2026-11-12).
    function Move-WithRetry([string]$from, [string]$to) {
        for ($i = 1; $i -le 15; $i++) {
            try { Move-Item -Force $from $to; return }
            catch {
                if ($i -eq 15) { throw }
                if ($i -eq 2) { Write-Host "файлы заняты, жду (игра закрывается?) / files busy, waiting ..." }
                Start-Sleep -Seconds 2
            }
        }
    }
    foreach ($entry in Get-ChildItem -Path $stage) {
        $target = Join-Path $modDst $entry.Name
        if (Test-Path $target) {
            Move-WithRetry $target (Join-Path $trash $entry.Name)
        }
        Move-WithRetry (Join-Path $stage $entry.Name) $target
    }
    Remove-Item -Recurse -Force $stage, $trash -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $Src "environment.txt") (Join-Path $GameDir "environment.txt") -Force
} catch {
    Write-Host "ОШИБКА / ERROR: установка ядра не удалась / core install failed."
    Write-Host "Причина / Reason: $($_.Exception.Message)"
    Write-Host "Старые файлы (кроме уже заменённых блоков) целы; запусти установщик"
    Write-Host "повторно / rerun install.cmd. При отказе в правах — от имени"
    Write-Host "администратора / run as administrator, или вручную, см. INSTALL.txt."
    exit 1
}

Write-Host "ГОТОВО / DONE. Ядро установлено (тексты 11 языков, шрифты, меню)."
Write-Host "Голоса: скачай voice-пакеты нужных языков и запусти их install.cmd"
Write-Host "по одному — каждый ставится атомарно. / Voices: run each voice pack's"
Write-Host "install.cmd — each installs atomically."
exit 0
