#!/bin/bash
export PYTHONIOENCODING=utf-8
PY="C:/tools/cosyvoice3/.venv/Scripts/python.exe"
for arc in WarriorPath BlackMonolith HollowWorld AlfredArc SailorArc VargaMarionPath PrisonArc; do
  echo "=== ARC START: $arc $(date +%H:%M) ==="
  "$PY" tools/voice_batch.py --arc "$arc" >> output/voice/gen_all_b.log 2>&1
  echo "=== ARC DONE: $arc $(date +%H:%M) ==="
done
