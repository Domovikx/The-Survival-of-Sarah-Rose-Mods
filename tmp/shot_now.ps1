# shot_now.ps1 [имя.png] — скриншот окна игры в tmp/shots_manual/
param([string]$Name = ("shot_" + (Get-Date -Format "HHmmss") + ".png"))
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$dir = Join-Path $PSScriptRoot "shots_manual"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$p = Get-Process TheSurvivalofSarahRose -ErrorAction SilentlyContinue
if (-not $p) { Write-Host "игра не запущена"; exit 1 }
Add-Type @"
using System;using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 public struct R { public int L, T, Rt, B; } }
"@
$r = New-Object W+R
[W]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
[W]::MoveWindow($p.MainWindowHandle, 40, 30, 1296, 761, $true) | Out-Null
Start-Sleep -Milliseconds 250
[W]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
[W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 250
$bmp = New-Object System.Drawing.Bitmap ($r.Rt - $r.L), ($r.B - $r.T)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
$out = Join-Path $dir $Name
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "снимок: $out"
