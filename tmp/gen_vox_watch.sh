#!/bin/bash
# ВОТЧДОГ генерации демо-аудио (read-only): каждые 30 мин — снимок прогресса
# и детектор зависания (нет новых файлов 30 мин при живом процессе).
# Запуск: bash tmp/gen_vox_watch.sh (фон), журнал: tmp/gen_vox_watch.log
set -u
cd "$(dirname "$0")/.." || exit 1
W="tmp/gen_vox_watch.log"
PREV=0
while true; do
  N=$(find patches/ai-voice-pack/audio -name '*.opus' 2>/dev/null | wc -l)
  ALIVE=$(powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*voice_batch*' } | Measure-Object).Count" 2>/dev/null | tr -d '\r ')
  echo "$(date '+%H:%M:%S') opus=$N (за 30 мин +$((N-PREV))) node=$ALIVE" >> "$W"
  if [ "$N" -eq "$PREV" ] && [ "${ALIVE:-0}" != "0" ]; then
    echo "$(date '+%H:%M:%S') !! STALL: файлы не растут при живом node" >> "$W"
  fi
  if [ "${ALIVE:-0}" = "0" ] && grep -q "GEN_VOX_DEMO_ALL_DONE" tmp/gen_vox_demo.log 2>/dev/null; then
    echo "$(date '+%H:%M:%S') очередь завершена — вотчдог выходит" >> "$W"
    break
  fi
  PREV=$N
  sleep 1800
done
