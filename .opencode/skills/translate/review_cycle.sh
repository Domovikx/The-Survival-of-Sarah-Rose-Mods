#!/bin/bash
# Один цикл периодического ревью перевода (запускает агент после каждого
# уведомления): спит 30 мин → механическое ревью + визуальная выборка +
# СУДЬЯ (V4, temp0) на последних 50 свежих строках → отчёт в
# tmp/review_watch.log и выход (уведомление агенту: он читает, подтверждает
# флаги судьи глазами и чинит). Аргумент: язык (по умолчанию ru).
cd "$(dirname "$0")/../../.." || exit 1
L="${1:-ru}"
sleep 1800
out=$(node .opencode/skills/translate/translate_review.mts "$L" 2>&1)
judge=$(node .opencode/skills/translate/translate_judge.mts "$L" 50 2>&1)
{
  echo "===== $(date '+%Y-%m-%d %H:%M') lang=$L ====="
  echo "$out"
  echo "$judge"
  echo "--- визуальная выборка свежих строк ---"
  tail -c 400000 "tmp/translate_${L}.live.log" 2>/dev/null | awk '/^\[изменено/{n++} n%13==3 && /^\[изменено|^   (БЫЛО|СТАЛО)/{print}' | tail -39
} >> tmp/review_watch.log 2>&1
echo "$out" | tail -12
echo "$judge" | tail -6
pid=$(powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*translate_run*' } | ForEach-Object { Write-Output \$_.ProcessId }" | head -n1 | tr -d '\r\n')
if [ -z "$pid" ]; then echo "ПРОГОН ЗАВЕРШЁН — цикл ревью окончен (отчёт в tmp/review_watch.log)"; fi
