$ErrorActionPreference = "Stop"
$G = "C:\Program Files (x86)\Steam\steamapps\common\The Survival of Sarah Rose"
$mod = Join-Path $G "mods\tssr-ai-voice-pack"

Write-Host "== game processes =="
$game = Get-Process | Where-Object { $_.Name -match 'SarahRose|renpy' }
if ($game) { $game | ForEach-Object { "  {0} pid={1}" -f $_.Name, $_.Id } } else { "  none" }

Write-Host "== probe rename each core block =="
foreach ($e in Get-ChildItem $mod) {
    if ($e.Name -eq "ai_voice") { "  SKIP  $($e.Name)"; continue }
    $tmp = Join-Path $G "mods\.probe-$($e.Name)"
    try {
        Move-Item -Force $e.FullName $tmp
        Move-Item -Force $tmp $e.FullName
        "  OK    $($e.Name)"
    } catch {
        "  BUSY  $($e.Name): $($_.Exception.Message)"
        if (Test-Path $tmp) { try { Move-Item -Force $tmp $e.FullName } catch {} }
    }
}
