# Снимок ОКНА игры (не всего экрана) — живая сцена для гайдов/стора.
#
# Зачем отдельный скрипт: окно игры нельзя снять «как есть» простым CopyFromScreen
# по границам — в кадр лезет заголовок окна, а сам подъём на передний план из
# фонового процесса Windows блокирует. Здесь оба места решены.
#
# Использование:
#   powershell -ExecutionPolicy Bypass -File cap_window.ps1 -Out tmp/shots/scene.png
#   powershell -ExecutionPolicy Bypass -File cap_window.ps1 -Out tmp/steam_upload/04.jpg `
#       -Width 1920 -Height 1080 -Jpeg
#
# Параметры:
#   -Process   имя процесса игры (по умолчанию TheSurvivalofSarahRose)
#   -Out       путь к файлу (PNG; с -Jpeg — .jpg)
#   -Width/-Height  масштабировать кадр (для Steam/Nexus — 1920x1080)
#   -Jpeg      сохранить JPEGом (меньше вес; лимит превью Steam 2 МБ)
#   -IncludeFrame   брать всё окно вместе с заголовком (по умолчанию — клиентская область)
param(
    [string]$Process = "TheSurvivalofSarahRose",
    [Parameter(Mandatory = $true)][string]$Out,
    [int]$Width = 0,
    [int]$Height = 0,
    [switch]$Jpeg,
    [switch]$IncludeFrame
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class GameShotWin32 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder text, int max);
    public struct RECT { public int Left, Top, Right, Bottom; }
    public struct POINT { public int X, Y; }
}
"@

Add-Type -AssemblyName System.Drawing

$procs = Get-Process -Name $Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $procs) { throw "процесс $Process с окном не найден (игра запущена?)" }
$h = $procs[0].MainWindowHandle

$sb = New-Object System.Text.StringBuilder 256
[void][GameShotWin32]::GetWindowTextW($h, $sb, 256)
Write-Host "окно: '$($sb.ToString())'"

# --- подъём на передний план (SetForegroundWindow сам по себе отказывает) ---
[void][GameShotWin32]::ShowWindowAsync($h, 9)
[GameShotWin32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)   # Alt down — снимает блокировку фокуса
[void][GameShotWin32]::SwitchToThisWindow($h, $true)
[void][GameShotWin32]::SetForegroundWindow($h)
[GameShotWin32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)   # Alt up
Start-Sleep -Milliseconds 1000
if ([GameShotWin32]::GetForegroundWindow() -ne $h) {
    $fg = [GameShotWin32]::GetForegroundWindow()
    $fgThread = [GameShotWin32]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
    $myThread = [GameShotWin32]::GetWindowThreadProcessId($h, [IntPtr]::Zero)
    [void][GameShotWin32]::AttachThreadInput($fgThread, $myThread, $true)
    [void][GameShotWin32]::SetForegroundWindow($h)
    [void][GameShotWin32]::AttachThreadInput($fgThread, $myThread, $false)
    Start-Sleep -Milliseconds 900
}
if ([GameShotWin32]::GetForegroundWindow() -ne $h) {
    Write-Warning "игру не удалось вывести вперёд — кадр может оказаться с чужим окном"
}

# --- область съёмки: клиентская (без заголовка) или всё окно ---
if ($IncludeFrame) {
    $r = New-Object GameShotWin32+RECT
    [void][GameShotWin32]::GetWindowRect($h, [ref]$r)
    $x = $r.Left; $y = $r.Top; $w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
} else {
    $c = New-Object GameShotWin32+RECT
    [void][GameShotWin32]::GetClientRect($h, [ref]$c)
    $pt = New-Object GameShotWin32+POINT
    $pt.X = 0; $pt.Y = 0
    [void][GameShotWin32]::ClientToScreen($h, [ref]$pt)
    $x = $pt.X; $y = $pt.Y; $w = $c.Right - $c.Left; $hh = $c.Bottom - $c.Top
}
if ($w -le 0 -or $hh -le 0) { throw "некорректная область съёмки: ${w}x${hh}" }

# --- копирование пикселей ---
$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
$g.Dispose()

# --- масштаб под требование площадки (Steam/Nexus: 1920x1080) ---
if ($Width -gt 0 -and $Height -gt 0 -and ($Width -ne $w -or $Height -ne $hh)) {
    $scaled = New-Object System.Drawing.Bitmap $Width, $Height
    $g2 = [System.Drawing.Graphics]::FromImage($scaled)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g2.DrawImage($bmp, 0, 0, $Width, $Height)
    $g2.Dispose()
    $bmp.Dispose()
    $bmp = $scaled
}

$dir = Split-Path -Parent $Out
if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$full = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Out))
if ($Jpeg) {
    $bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Jpeg)
} else {
    $bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
}
$size = [math]::Round((Get-Item $full).Length / 1KB)
$bmp.Dispose()

Write-Host "снято: $full — $($Width)x$($Height) $size КБ"
