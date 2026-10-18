#!/bin/bash
# Очередь генерации (en) с НИЗКИМ ПРИОРИТЕТОМ:
#   - setpriority 16384 (BelowNormal) — CPU отдаётся интерактивным приложениям,
#     генерация использует только простаивающие ядра
#   - OMP_NUM_THREADS=6 — torch не захватывает все ядра (по умолчанию все 16)
export PYTHONIOENCODING=utf-8
export OMP_NUM_THREADS=6
PY="C:/tools/cosyvoice3/.venv/Scripts/python.exe"
LOG="output/voice/gen_all_en.log"
for arc in Prologue StoryBeginnings Other WarriorPath MagePath BlackMonolith UnionKingdom HollowWorld SailorPath AlfredArc HassarPath SailorArc LifeInRahayal VargaMarionPath Training PrisonArc HyralArc DemonArc WarArc; do
  echo "=== START en $arc $(date +%H:%M) ===" >> "$LOG"
  "$PY" tools/voice_batch.py --arc "$arc" --lang en >> "$LOG" 2>&1 &
  BATCH_PID=$!
  sleep 1
  for p in $(wmic process where "name='python.exe'" get ProcessId 2>/dev/null | grep -oE "[0-9]+"); do
    wmic process where "processid=$p" call setpriority 16384 > /dev/null 2>&1
  done
  wait $BATCH_PID
  echo "=== DONE en $arc $(date +%H:%M) ===" >> "$LOG"
done
echo "=== ALL DONE en $(date +%H:%M) ===" >> "$LOG"
