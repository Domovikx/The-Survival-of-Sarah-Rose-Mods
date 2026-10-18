#!/bin/bash
# ============================================================
# Очередь генерации озвучки TSSR (все арки, один язык).
#
# Запуск:
#   bash tools/voice_queue.sh ru     # вся русская озвучка
#   bash tools/voice_queue.sh en     # вся английская озвучка
#
# Свойства:
#   - resumable: пропускает уже готовые файлы (можно перезапускать/убивать)
#   - НИЗКИЙ ПРИОРИТЕТ: setpriority 16384 (BelowNormal) для всех python —
#     CPU отдаётся интерактивным приложениям, генерация ест простой
#   - OMP_NUM_THREADS=6 — torch не захватывает все ядра
#   - лог: output/voice/gen_all_{lang}.log (метки START/DONE по аркам)
#
# Рестарт после ребута ПК:
#   powershell Start-Process bash -ArgumentList 'tools/voice_queue.sh ru' ...
#   (см. AGENTS.md «Озвучка» и скил tssr-voice-status)
# ============================================================
set -u
LANG_ARG="${1:-}"
if [[ "$LANG_ARG" != "ru" && "$LANG_ARG" != "en" ]]; then
  echo "Использование: bash tools/voice_queue.sh {ru|en}"
  exit 1
fi

export PYTHONIOENCODING=utf-8
export OMP_NUM_THREADS=6
PY="C:/tools/cosyvoice3/.venv/Scripts/python.exe"
LOG="output/voice/gen_all_${LANG_ARG}.log"
ARCS="Prologue StoryBeginnings Other WarriorPath MagePath BlackMonolith UnionKingdom HollowWorld SailorPath AlfredArc HassarPath SailorArc LifeInRahayal VargaMarionPath Training PrisonArc HyralArc DemonArc WarArc"

for arc in $ARCS; do
  echo "=== START $LANG_ARG $arc $(date +%H:%M) ===" >> "$LOG"
  "$PY" tools/voice_batch.py --arc "$arc" --lang "$LANG_ARG" >> "$LOG" 2>&1 &
  BATCH_PID=$!
  sleep 1
  # BelowNormal для venv-лаунчера и реального python (их два на воркер)
  for p in $(wmic process where "name='python.exe'" get ProcessId 2>/dev/null | grep -oE "[0-9]+"); do
    wmic process where "processid=$p" call setpriority 16384 > /dev/null 2>&1
  done
  wait "$BATCH_PID"
  echo "=== DONE $LANG_ARG $arc $(date +%H:%M) ===" >> "$LOG"
done
echo "=== ALL DONE $LANG_ARG $(date +%H:%M) ===" >> "$LOG"