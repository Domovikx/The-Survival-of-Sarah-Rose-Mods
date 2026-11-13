Add-Type @"
using System;
using System.Runtime.InteropServices;
public class F {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowW(string c, string t);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder s, int n);
}
"@
$h = [F]::FindWindowW($null, "Steam")
Write-Host "hwnd=$h"
if ($h -ne [IntPtr]::Zero) {
  [void][F]::ShowWindow($h, 9)
  [void][F]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 900
  $fg = [F]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 256
  [void][F]::GetWindowTextW($fg, $sb, 256)
  Write-Host ("foreground: " + $sb.ToString())
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Start-Sleep -Seconds 5
  Write-Host "enter sent"
}
