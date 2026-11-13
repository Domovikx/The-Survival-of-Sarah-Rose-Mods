#!/usr/bin/env bash
set -u
cd "C:/Users/Domo/workspace/The-Survival-of-Sarah-Rose-Mods" || exit 1
: > tmp/revoice.log
for L in ru de es fr it pl pt ko zh ja; do
  node .opencode/skills/renpy-po/po_changed.mts --lang "$L" --uids > "tmp/uids_$L.txt"
  N=$(grep -c . "tmp/uids_$L.txt" || true)
  if [ "${N:-0}" -eq 0 ]; then continue; fi
  echo "=== $L: $N строк" | tee -a tmp/revoice.log
  node patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts \
    --engine voxcpm2 --lang "$L" --force --uid-file "tmp/uids_$L.txt" >> tmp/revoice.log 2>&1
  echo "--- $L: $(grep -E '^done=' tmp/revoice.log | tail -1)" >> tmp/revoice.log
done
echo "=== ГОТОВО $(date -Iseconds)" >> tmp/revoice.log
