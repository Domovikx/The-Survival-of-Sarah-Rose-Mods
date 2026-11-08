# kill_bench.ps1 — остановка стенда VoxCPM2 (node-оркестратор + python-шим)
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -match "voxcpm_bench|voxcpmworker"
} | ForEach-Object {
  $cmd = if ($_.CommandLine) { $_.CommandLine.Substring(0, [Math]::Min(120, $_.CommandLine.Length)) } else { "" }
  Write-Host ("kill {0}: {1}" -f $_.ProcessId, $cmd)
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "done"
