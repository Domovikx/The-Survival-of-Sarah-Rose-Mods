# click_at.ps1 <x> <y> [режим] — клик по ИГРОВЫМ координатам (1280x720 клиент).
# Режимы: left (по умолчанию), right.
param([int]$X, [int]$Y, [string]$Btn = "left")
Add-Type @"
using System;using System.Runtime.InteropServices;
public class M { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
 public struct R { public int L, T, Rt, B; } }
"@
$p = Get-Process TheSurvivalofSarahRose -ErrorAction SilentlyContinue
if (-not $p) { Write-Host "игра не запущена"; exit 1 }
$r = New-Object M+R
[M]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
[M]::MoveWindow($p.MainWindowHandle, 40, 30, 1296, 761, $true) | Out-Null
Start-Sleep -Milliseconds 250
[M]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
[M]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 200
# клиент 1280x720: смещение от окна — заголовок ~31px, рамка слева ~8px
$ax = $r.L + 8 + $X
$ay = $r.T + 31 + $Y
[M]::SetCursorPos($ax, $ay) | Out-Null
Start-Sleep -Milliseconds 120
if ($Btn -eq "right") { [M]::mouse_event(0x0008, 0, 0, 0, [IntPtr]::Zero); [M]::mouse_event(0x0010, 0, 0, 0, [IntPtr]::Zero) }
else { [M]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero); [M]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero) }
Write-Host "клик $Btn ($X,$Y) -> screen ($ax,$ay)"
