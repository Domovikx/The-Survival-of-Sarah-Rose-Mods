#!/bin/bash
# VoxCPM2-пилот демо-скоупа: по 20 строк на каждый po-язык (владелец 2026-11-10).
# Запуск: bash tmp/pilot_vox.sh 2>&1 | tee tmp/pilot_vox.log
set -u
cd "$(dirname "$0")/.." || exit 1
VB="patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts"

for L in ru de es fr it ja ko pl pt zh; do
  echo "===== $L: $(date '+%H:%M:%S')"
  node "$VB" --engine voxcpm2 --lang "$L" --demo --limit 20 2>&1 | tail -3
done
echo "PILOT_VOX_ALL_DONE"
