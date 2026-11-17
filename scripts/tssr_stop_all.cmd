@echo off
rem tssr_stop_all.cmd — погасить весь фоновый контур TSSR (страж, слоты, очередь, пульт).
rem Бэкенд llama-server гасим отдельно: без нагрузки он не нужен и держит VRAM/RAM.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'translate|health_guard|np_switch|dashboard') -or $_.Name -eq 'llama-server.exe' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }"
echo Остановлено. Проверить: node scripts\health_report.mts
