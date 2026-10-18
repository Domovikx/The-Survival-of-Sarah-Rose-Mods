#!/bin/bash
export PYTHONIOENCODING=utf-8
PY="C:/tools/cosyvoice3/.venv/Scripts/python.exe"
LOG="output/voice/gen_all.log"
ARCS="Prologue StoryBeginnings Other WarriorPath MagePath BlackMonolith UnionKingdom HollowWorld SailorPath AlfredArc HassarPath SailorArc LifeInRahayal VargaMarionPath Training PrisonArc HyralArc DemonArc WarArc"
for lang in ru en; do
  for arc in $ARCS; do
    echo "=== START $lang $arc $(date +%H:%M) ===" >> "$LOG"
    "$PY" tools/voice_batch.py --arc "$arc" --lang "$lang" >> "$LOG" 2>&1
    echo "=== DONE $lang $arc $(date +%H:%M) ===" >> "$LOG"
  done
done
echo "=== ALL DONE $(date +%H:%M) ===" >> "$LOG"
