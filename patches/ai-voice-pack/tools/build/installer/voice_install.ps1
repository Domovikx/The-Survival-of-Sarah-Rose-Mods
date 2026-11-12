# TSSR AI Voice Pack — установщик ГОЛОСОВОГО ПАКЕТА (voice-{lang}.zip).
# Владелец 2026-11-12: «мэйн установщик, потом отдельные аудио-установщики,
# атомарно» + предохранитель: аудио ставится ТОЛЬКО поверх ядра (main);
# без ядра — попросить поставить main первым.
# Атомарность: пакет собирается в staging, потом swap (старый живёт до
# последнего шага); прерывание лечится повторным запуском.
# Один пакет = один язык; ставятся все языки, найденные в своём payload.
# Запуск: install.cmd (двойной клик) или: powershell -File install.ps1
# Параметр: -GameDir <папка игры> — без авто-поиска (для скриптов/тестов).
param(
    [string]$GameDir = ""
)

$ErrorActionPreference = "Stop"
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReleasesUrl = "https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases"

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

Write-Host "TSSR AI Voice Pack - voice pack installer / Установщик голосов"
Write-Host "==============================================================="

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

# 2. Игра должна быть закрыта (держит локи на файлах мода) / game closed
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

# 3. ПРЕДОХРАНИТЕЛЬ: ядро (main) должно стоять / CORE REQUIRED
$modDst = Join-Path $GameDir "mods\tssr-ai-voice-pack"
$coreOk = (Test-Path (Join-Path $modDst "voice_config.rpy")) -and
          (Test-Path (Join-Path $modDst "zzz_ui.rpy"))
if (-not $coreOk) {
    Write-Host ""
    Write-Host "СНАЧАЛА УСТАНОВИ MAIN / INSTALL MAIN FIRST"
    Write-Host "Голоса ставятся только поверх ядра (тексты и меню из main.zip)."
    Write-Host "Voices install only on top of the core (texts and menu from main.zip)."
    Write-Host "1) скачай и установи TSSR-AI-Voice-Pack-main.zip / install main.zip;"
    Write-Host "2) затем запусти этот установщик снова / then run this installer again."
    exit 3
}

# 4. Payload: ai_voice/<lang>/ рядом с install.ps1
$aiSrc = Join-Path $Src "mods\tssr-ai-voice-pack\ai_voice"
if (-not (Test-Path $aiSrc)) {
    Write-Host "ОШИБКА / ERROR: рядом с install.ps1 нет mods/tssr-ai-voice-pack/ai_voice."
    Write-Host "Распакуй voice-zip целиком и запусти установщик из него. / Unpack the voice zip fully first."
    exit 1
}
$langs = @(Get-ChildItem -Path $aiSrc -Directory | ForEach-Object { $_.Name })
if (-not $langs) {
    Write-Host "ОШИБКА / ERROR: пакет не содержит аудио / no audio in this pack."
    exit 1
}

# 5. Атомарная установка по языкам: staging -> swap
# Ретраи до 30с: игра закрывается асинхронно и кратко держит локи на файлах.
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
$installed = @()
foreach ($lang in $langs) {
    Write-Host "Ставлю голоса '$lang' / Installing voice '$lang' (atomic) ..."
    $stage = Join-Path $aiSrc ".installing-$lang"
    $old = Join-Path $aiSrc ".old-$lang"
    $target = Join-Path $modDst "ai_voice\$lang"
    try {
        if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
        if (Test-Path $old) { Remove-Item -Recurse -Force $old }
        Copy-Item -Recurse (Join-Path $aiSrc $lang) $stage
        New-Item -ItemType Directory -Force -Path (Join-Path $modDst "ai_voice") | Out-Null
        if (Test-Path $target) { Move-WithRetry $target $old }
        Move-WithRetry $stage $target
        if (Test-Path $old) { Remove-Item -Recurse -Force $old -ErrorAction SilentlyContinue }
        $installed += $lang
    } catch {
        # возврат старого на место, если новый не встал / rollback
        if ((Test-Path $old) -and -not (Test-Path $target)) { Move-Item -Force $old $target }
        Write-Host "ОШИБКА / ERROR: пакет '$lang' не установился / pack install failed."
        Write-Host "Причина / Reason: $($_.Exception.Message)"
        Write-Host "Предыдущая версия пакета цела; запусти установщик повторно. / Rerun this installer."
        exit 1
    }
}

Write-Host "ГОТОВО / DONE. Установлено / installed: $($installed -join ', ')"
Write-Host "Запусти игру, язык — в меню мода. / Launch the game and pick the language in the mod menu."
exit 0
