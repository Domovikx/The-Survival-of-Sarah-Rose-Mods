# TSSR AI Voice Pack — автоустановщик (Windows, без зависимостей).
# Запуск: двойной клик по install.cmd. Параметры для скриптов/тестов:
#   -GameDir <папка игры>   — без авто-поиска; -Lang <ru|en|de|...> — без вопроса.
# Обновление = то же самое: ядро заменяется целиком (атомарно).
param(
    [string]$GameDir = "",
    [string]$Lang = ""
)

$ErrorActionPreference = "Stop"
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$VoiceCodes = @("ru", "en", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh")
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

Write-Host "TSSR AI Voice Pack - installer / Установщик"
Write-Host "============================================"

# 1. Папка игры / Game folder
if (-not $GameDir) { $GameDir = Find-GameDir }
if (-not $GameDir) {
    Write-Host "Папка игры не найдена автоматически / Game folder not found."
    $GameDir = Read-Host "Введи путь к папке игры / Enter the game folder path"
}
$GameDir = $GameDir.Trim('"')
if (-not (Test-Path (Join-Path $GameDir "game"))) {
    Write-Host "ОШИБКА / ERROR: '$GameDir' не содержит папку game/ — это не папка игры."
    exit 1
}
Write-Host "Игра / Game: $GameDir"

# 2. Язык озвучки / Voice language
if (-not $Lang) {
    Write-Host ""
    Write-Host "Доступно / Available: $($VoiceCodes -join ', ')"
    $Lang = (Read-Host "Язык озвучки, Enter = en / Voice language").Trim().ToLower()
    if (-not $Lang) { $Lang = "en" }
}
$Lang = $Lang.ToLower()
if ($VoiceCodes -notcontains $Lang) {
    Write-Host "ОШИБКА / ERROR: неизвестный язык '$Lang'"
    exit 1
}

# 3. Ядро (атомарная замена) / Core (atomic replace)
$modSrc = Join-Path $Src "mods\tssr-ai-voice-pack"
if (-not (Test-Path $modSrc)) {
    Write-Host "ОШИБКА / ERROR: рядом с install.ps1 нет mods/tssr-ai-voice-pack."
    Write-Host "Распакуй main.zip целиком и запусти установщик из него. / Unpack main.zip fully first."
    exit 1
}
$modDst = Join-Path $GameDir "mods\tssr-ai-voice-pack"
Write-Host ""
Write-Host "Ставлю ядро / Installing core ..."
if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst }
New-Item -ItemType Directory -Force -Path (Join-Path $GameDir "mods") | Out-Null
Copy-Item -Recurse $modSrc $modDst
Copy-Item (Join-Path $Src "environment.txt") (Join-Path $GameDir "environment.txt") -Force

# 4. Голоса языка (voice-zip рядом с установщиком или уровнем выше) / Voice pack
$voiceName = "TSSR-AI-Voice-Pack-voice-$Lang.zip"
$voiceZip = @(
    (Join-Path $Src $voiceName),
    (Join-Path (Split-Path -Parent $Src) $voiceName)
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($voiceZip) {
    Write-Host "Ставлю голоса '$Lang' / Installing voice '$Lang' ..."
    $aiDst = Join-Path $modDst "ai_voice\$Lang"
    if (Test-Path $aiDst) { Remove-Item -Recurse -Force $aiDst }
    Expand-Archive -Path $voiceZip -DestinationPath $GameDir -Force
    Write-Host "ГОТОВО / DONE. Запусти игру, язык — в меню мода. / Launch the game."
    exit 0
}

Write-Host ""
Write-Host "Ядро установлено, но голоса '$Lang' не найдены ($voiceName)."
Write-Host "Core installed; voice '$Lang' not found ($voiceName)."
Write-Host "Скачай его и положи рядом с install.cmd, затем запусти снова /"
Write-Host "download it, put next to install.cmd and run again:"
Write-Host "  $ReleasesUrl"
exit 2
