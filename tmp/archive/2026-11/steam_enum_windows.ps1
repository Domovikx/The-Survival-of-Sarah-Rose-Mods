$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  public struct RECT { public int L, T, R, B; }
}
"@
$res = New-Object System.Collections.ArrayList
$cb = [W+EnumProc]{
  param($h, $l)
  if ([W]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 512
    [void][W]::GetWindowTextW($h, $sb, 512)
    $t = $sb.ToString()
    if ($t.Length -gt 0) {
      $r = New-Object W+RECT
      [void][W]::GetWindowRect($h, [ref]$r)
      $pid_ = 0
      [void][W]::GetWindowThreadProcessId($h, [ref]$pid_)
      $proc = (Get-Process -Id $pid_ -ErrorAction SilentlyContinue).ProcessName
      $null = $res.Add([pscustomobject]@{T=$t; P=$proc; X=$r.L; Y=$r.T; W=($r.R-$r.L); H=($r.B-$r.T)})
    }
  }
  return $true
}
[void][W]::EnumWindows($cb, [IntPtr]::Zero)
foreach ($x in $res) { Write-Host ("[{0}] '{1}' {2},{3} {4}x{5}" -f $x.P, $x.T, $x.X, $x.Y, $x.W, $x.H) }
