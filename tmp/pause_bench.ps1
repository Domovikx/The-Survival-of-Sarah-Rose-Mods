# pause_bench.ps1 / resume_bench.ps1 — приостановка/продолжение стенда VoxCPM2.
# NtSuspendProcess/NtResumeProcess (ntdll): node-оркестратор И python-шим
# ставятся/снимаются вместе (шам без node встанет сам после текущей фразы).
param([switch]$Resume)
$code = @"
using System;
using System.Runtime.InteropServices;
public static class Proc {
  [DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr h);
  [DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr h);
}
"@
Add-Type -TypeDefinition $code
$action = if ($Resume) { "resume" } else { "suspend" }
Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -eq "node.exe" -and $_.CommandLine -match "voxcpm_bench") -or
  ($_.Name -eq "python.exe" -and $_.CommandLine -match "voxcpmworker")
} | ForEach-Object {
  $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if ($p) {
    if ($Resume) { [void][Proc]::NtResumeProcess($p.Handle) } else { [void][Proc]::NtSuspendProcess($p.Handle) }
    Write-Host ("{0} pid {1}: {2}" -f $action, $_.ProcessId, $_.Name)
  }
}
Write-Host "done"
