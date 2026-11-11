#!/bin/bash
# ПОЛНАЯ генерация ДЕМО-аудио на VoxCPM2 (задача 2026-11-10, владелец:
# «делаем генерацию ДЭМО аудио»). Демо-скоуп (~1188 строк/язык), 11 языков
# (ru → en → po-языки). Resumable: готовые файлы пропускаются.
# Запуск: bash tmp/gen_vox_demo.sh 2>&1 | tee tmp/gen_vox_demo.log
set -u
cd "$(dirname "$0")/.." || exit 1
VB="patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts"

for L in ru en de es fr it ja ko pl pt zh; do
  echo "===== $L: $(date '+%H:%M:%S')"
  node "$VB" --engine voxcpm2 --lang "$L" --demo 2>&1 | tail -2
done
echo "GEN_VOX_DEMO_ALL_DONE"
