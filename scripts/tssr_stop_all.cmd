@echo off
rem tssr_stop_all.cmd - погасить весь фоновый контур TSSR.
rem node-процессы + llama-server + оставшиеся обёртки conhost/cmd от лаунчеров.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'translate|health_guard|np_switch|dashboard|tssr_start_all') -or $_.Name -eq 'llama-server.exe' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }"
echo Остановлено. Проверить: node scripts\health_report.mts
