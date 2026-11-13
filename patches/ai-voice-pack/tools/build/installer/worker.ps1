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

Write-Host "TSSR AI Voice Pack — Installer"
Write-Host "======================================================="

# 1. Папка игры / Game folder
if (-not $GameDir) { $GameDir = Find-GameDir }
if (-not $GameDir) {
    Write-Host "We couldn't find your game folder automatically."
    $GameDir = Read-Host "Please enter the path to your game folder"
}
$GameDir = Normalize-Path $GameDir
if (-not (Test-Path (Join-Path $GameDir "game"))) {
    Write-Host "ERROR: '$GameDir' doesn't look like the game folder (no game/ subfolder inside)."
    exit 1
}
Write-Host "Game folder: $GameDir"

# 2. Предохранитель: игра должна быть закрыта. Живой процесс держит локи на
#    шрифтах и файлах мода — атомарная замена падает «папка занята»
#    (поймано e2e/user_flow.sh 2026-11-12). Ждём до 3 минут: юзер закрывает игру.
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
        Write-Host "The game is running. Please close it — installation will start automatically (up to 3 minutes)."
        Write-Host ""
        for ($i = 0; $i -lt 36 -and (Get-GameProcess); $i++) { Start-Sleep -Seconds 5 }
        if (Get-GameProcess) {
            Write-Host "ERROR: the game is still running."
            Write-Host "Please close the game and run install.cmd again."
            exit 4
        }
        Write-Host "Game closed — continuing."
    }
}

# 3. Источник ядра (рядом с install.ps1) / Core payload
$modSrc = Join-Path $Src "mods\tssr-ai-voice-pack"
if (-not (Test-Path $modSrc)) {
    Write-Host "ERROR: the folder 'mods/tssr-ai-voice-pack' is missing next to install.cmd."
    Write-Host "Please unpack the whole main.zip and run install.cmd from inside it."
    exit 1
}
$modDst = Join-Path $GameDir "mods\tssr-ai-voice-pack"
if ((Normalize-Path $modSrc) -eq (Normalize-Path $modDst)) {
    # main.zip распакован прямо в папку игры: ядро уже на месте
    Write-Host "The core is already installed — nothing to do."
    Write-Host "Voice packs are installed separately: download the ones you want and run each pack's install.cmd."
    exit 0
}

# 4. Атомарная установка ядра: staging -> замена блоками.
#    ai_voice/ НЕ трогаем (голоса ставит свой установщик пакета).
Write-Host ""
Write-Host "Installing... (your current files stay safe until the new ones are ready)"
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
    # локи на файлах мода (поймано e2e/user_flow.sh 2026-11-12).
    function Move-WithRetry([string]$from, [string]$to) {
        for ($i = 1; $i -le 15; $i++) {
            try { Move-Item -Force $from $to; return }
            catch {
                if ($i -eq 15) { throw }
                if ($i -eq 2) { Write-Host "Files are busy, waiting... (is the game still closing?)" }
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
    Write-Host "ERROR: installation failed."
    Write-Host "Reason: $($_.Exception.Message)"
    Write-Host "Your previous files are safe. Just run install.cmd again."
    Write-Host "If Windows blocked the install, right-click install.cmd →"
    Write-Host "Run as administrator. Details: see INSTALL.txt."
    exit 1
}

Write-Host "Done! Core installed: 11 languages, fonts and the mod menu."
Write-Host "Next step (optional): want voices? Download the voice packs you like,"
Write-Host "unpack them, and run each pack's install.cmd — one language per pack."
Write-Host "Enjoy the game!"
exit 0
