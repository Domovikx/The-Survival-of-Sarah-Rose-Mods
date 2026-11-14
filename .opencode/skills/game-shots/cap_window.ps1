# Снимок ОКНА игры (не всего экрана) — живая сцена для гайдов/стора.
#
# Почему так сложно: CopyFromScreen снимает то, что ВИДНО на экране, поэтому если
# игра перекрыта браузером/IDE — в кадр попадает чужое окно (проверено 2026-11-14:
# пришёл кадр с браузером). Поэтому основной путь — PrintWindow(PW_RENDERFULLCONTENT):
# он просит окно нарисовать себя, даже если оно перекрыто. Если драйвер отдаёт
# чёрное (бывает у части GL/D3D), падаем на CopyFromScreen, но ТОЛЬКО после
# проверки, что игра реально впереди; иначе — ошибка, а не мусорный файл.
#
# Использование:
#   powershell -ExecutionPolicy Bypass -File cap_window.ps1 -Out tmp/shots/scene.png
#   powershell -ExecutionPolicy Bypass -File cap_window.ps1 -Out tmp/steam/04.jpg `
#       -Width 1920 -Height 1080 -Jpeg
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
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);
    public struct RECT { public int Left, Top, Right, Bottom; }
    public struct POINT { public int X, Y; }
}
"@

Add-Type -AssemblyName System.Drawing

# КРИТИЧНО: без этого PowerShell на 125%-масштабе получает «виртуализованные»
# координаты окна (в DIP), а CopyFromScreen работает в физических пикселях —
# кадр уезжает на десятки пикселей и ловит соседнее окно. Проверено 2026-11-14.
try { [void][GameShotWin32]::SetProcessDpiAwareness(2) } catch { try { [void][GameShotWin32]::SetProcessDPIAware() } catch { } }

$procs = Get-Process -Name $Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $procs) { throw "процесс $Process с окном не найден (игра запущена?)" }
$h = $procs[0].MainWindowHandle

$sb = New-Object System.Text.StringBuilder 256
[void][GameShotWin32]::GetWindowTextW($h, $sb, 256)
Write-Host "окно: '$($sb.ToString())'"

# --- геометрия: всё окно и клиентская область (без заголовка) ---
$wr = New-Object GameShotWin32+RECT
[void][GameShotWin32]::GetWindowRect($h, [ref]$wr)
$cr = New-Object GameShotWin32+RECT
[void][GameShotWin32]::GetClientRect($h, [ref]$cr)
$cp = New-Object GameShotWin32+POINT
$cp.X = 0; $cp.Y = 0
[void][GameShotWin32]::ClientToScreen($h, [ref]$cp)

$winW = $wr.Right - $wr.Left
$winH = $wr.Bottom - $wr.Top
$cliW = $cr.Right - $cr.Left
$cliH = $cr.Bottom - $cr.Top
$offX = $cp.X - $wr.Left
$offY = $cp.Y - $wr.Top
if ($winW -le 0 -or $winH -le 0) { throw "некорректный прямоугольник окна: ${winW}x${winH}" }

function Test-Blank([System.Drawing.Bitmap]$bmp) {
    # «чёрный/пустой» кадр: сэмплируем сетку 12x8 и считаем долю тёмных пикселей
    $dark = 0
    $total = 0
    for ($x = 0; $x -lt $bmp.Width; $x += [math]::Max(1, [int]($bmp.Width / 12))) {
        for ($y = 0; $y -lt $bmp.Height; $y += [math]::Max(1, [int]($bmp.Height / 8))) {
            $c = $bmp.GetPixel($x, $y)
            $total++
            if (($c.R + $c.G + $c.B) -lt 24) { $dark++ }
        }
    }
    if ($total -eq 0) { return $true }
    return ($dark / $total) -gt 0.95
}

# --- путь 1: игра впереди -> снимаем с экрана (полный кадр, без потерь) ---
[void][GameShotWin32]::ShowWindowAsync($h, 9)
[GameShotWin32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
[void][GameShotWin32]::SwitchToThisWindow($h, $true)
[void][GameShotWin32]::SetForegroundWindow($h)
[GameShotWin32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 900
if ([GameShotWin32]::GetForegroundWindow() -ne $h) {
    $fg = [GameShotWin32]::GetForegroundWindow()
    $fgT = [GameShotWin32]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
    $myT = [GameShotWin32]::GetWindowThreadProcessId($h, [IntPtr]::Zero)
    [void][GameShotWin32]::AttachThreadInput($fgT, $myT, $true)
    [void][GameShotWin32]::SetForegroundWindow($h)
    [void][GameShotWin32]::AttachThreadInput($fgT, $myT, $false)
    Start-Sleep -Milliseconds 800
}

# ВАЖНО: геометрию пересчитываем ПОСЛЕ подъёма окна — SW_RESTORE может изменить
# позицию/размер, и старые координаты дают кадр со сдвигом (проверено 2026-11-14).
[void][GameShotWin32]::GetWindowRect($h, [ref]$wr)
[void][GameShotWin32]::GetClientRect($h, [ref]$cr)
$cp.X = 0; $cp.Y = 0
[void][GameShotWin32]::ClientToScreen($h, [ref]$cp)
$winW = $wr.Right - $wr.Left
$winH = $wr.Bottom - $wr.Top
$cliW = $cr.Right - $cr.Left
$cliH = $cr.Bottom - $cr.Top
$offX = $cp.X - $wr.Left
$offY = $cp.Y - $wr.Top

$bmp = $null
if ([GameShotWin32]::GetForegroundWindow() -eq $h) {
    $sx = if ($IncludeFrame) { $wr.Left } else { $cp.X }
    $sy = if ($IncludeFrame) { $wr.Top } else { $cp.Y }
    $sw = if ($IncludeFrame) { $winW } else { $cliW }
    $sh = if ($IncludeFrame) { $winH } else { $cliH }
    $bmp = New-Object System.Drawing.Bitmap $sw, $sh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($sx, $sy, 0, 0, $bmp.Size)
    $g.Dispose()
    Write-Host "снято с экрана (игра впереди)"
} else {
    Write-Host "игра перекрыта — снимаю через PrintWindow (кадр может быть без нижней панели)"
}

# --- путь 2: окно перекрыто -> PrintWindow (что отдаст драйвер) ---
if (-not $bmp) {
    try {
        $hdc = [GameShotWin32]::GetDC($h)
        $mdc = [GameShotWin32]::CreateCompatibleDC($hdc)
        $hbmp = [GameShotWin32]::CreateCompatibleBitmap($hdc, $winW, $winH)
        $old = [GameShotWin32]::SelectObject($mdc, $hbmp)
        $ok = [GameShotWin32]::PrintWindow($h, $mdc, 2)
        if ($ok) {
            $whole = [System.Drawing.Image]::FromHbitmap($hbmp)
            $bmp = New-Object System.Drawing.Bitmap $whole
            $whole.Dispose()
        }
        [void][GameShotWin32]::SelectObject($mdc, $old)
        [void][GameShotWin32]::DeleteObject($hbmp)
        [void][GameShotWin32]::DeleteDC($mdc)
        [void][GameShotWin32]::ReleaseDC($h, $hdc)
    } catch {
        Write-Warning "PrintWindow не сработал: $($_.Exception.Message)"
    }
    if (-not $bmp -or (Test-Blank $bmp)) {
        if ($bmp) { $bmp.Dispose() }
        throw "не удалось снять игру: окно перекрыто, PrintWindow вернул пустой кадр. Переключись в игру и повтори."
    }
    if (-not $IncludeFrame -and $offX -ge 0 -and $offY -ge 0 -and $cliW -gt 0 -and $cliH -gt 0) {
        $crop = New-Object System.Drawing.Bitmap $cliW, $cliH
        $gc = [System.Drawing.Graphics]::FromImage($crop)
        $gc.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $cliW, $cliH), (New-Object System.Drawing.Rectangle $offX, $offY, $cliW, $cliH), [System.Drawing.GraphicsUnit]::Pixel)
        $gc.Dispose()
        $bmp.Dispose()
        $bmp = $crop
    }
}

# --- масштаб под площадку (Steam/Nexus: 1920x1080) ---
if ($Width -gt 0 -and $Height -gt 0 -and ($Width -ne $bmp.Width -or $Height -ne $bmp.Height)) {
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
if ($Jpeg) { $bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Jpeg) }
else { $bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Png) }
$kb = [math]::Round((Get-Item $full).Length / 1KB)
$outW = $bmp.Width; $outH = $bmp.Height
$bmp.Dispose()

Write-Host "снято: $full — ${outW}x${outH}, $kb КБ"
