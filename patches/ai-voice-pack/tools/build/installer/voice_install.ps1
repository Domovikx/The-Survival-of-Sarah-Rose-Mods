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

Write-Host "TSSR AI Voice Pack — Voice Pack Installer"
Write-Host "==============================================================="

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

# 3. ПРЕДОХРАНИТЕЛЬ: ядро (main) должно стоять / CORE REQUIRED
$modDst = Join-Path $GameDir "mods\tssr-ai-voice-pack"
$coreOk = (Test-Path (Join-Path $modDst "voice_config.rpy")) -and
          (Test-Path (Join-Path $modDst "zzz_ui.rpy"))
if (-not $coreOk) {
    Write-Host ""
    Write-Host "Please install the core pack first"
    Write-Host "Voice packs install on top of the core pack (texts and menu):"
    Write-Host ""
    Write-Host "1) download and install TSSR-AI-Voice-Pack-main.zip (run its install.cmd);"
    Write-Host "2) then run this installer again."
    exit 3
}

# 4. Payload: ai_voice/<lang>/ рядом с install.ps1
$aiSrc = Join-Path $Src "mods\tssr-ai-voice-pack\ai_voice"
if (-not (Test-Path $aiSrc)) {
    Write-Host "ERROR: no audio folder found next to install.cmd."
    Write-Host "Please unpack the whole voice zip and run install.cmd from inside it."
    exit 1
}
$langs = @(Get-ChildItem -Path $aiSrc -Directory | ForEach-Object { $_.Name })
if (-not $langs) {
    Write-Host "ERROR: this pack contains no audio files."
    exit 1
}

# 5. Атомарная установка по языкам: staging -> swap
# Ретраи до 30с: игра закрывается асинхронно и кратко держит локи на файлах.
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
$installed = @()
foreach ($lang in $langs) {
    Write-Host "Installing voice pack: $lang ..."
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
        Write-Host "ERROR: voice pack '$lang' failed to install."
        Write-Host "Reason: $($_.Exception.Message)"
        Write-Host "Your previous files are safe. Just run install.cmd again."
        exit 1
    }
}

Write-Host "Done! Voice pack installed: $($installed -join ', ')"
Write-Host "Launch the game and pick the language from the mod menu (badge at the top right)."
exit 0
