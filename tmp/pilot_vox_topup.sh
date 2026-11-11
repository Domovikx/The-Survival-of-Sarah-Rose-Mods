#!/bin/bash
# Доп. выборка Vox-пилота: по 20 ДИАЛОГОВЫХ строк на язык по СПИКЕРАМ
# (Сара 8 / Кейт 6 / Варга 6) — для ревью «спикер ↔ речь».
# Запуск: bash tmp/pilot_vox_topup.sh 2>&1 | tee tmp/pilot_vox_topup.log
set -u
cd "$(dirname "$0")/.." || exit 1
VB="patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts"

for L in ru de es fr it ja ko pl pt zh; do
  echo "===== $L: $(date '+%H:%M:%S')"
  node "$VB" --engine voxcpm2 --lang "$L" --demo --char Sarah --limit 8 2>&1 | tail -1
  node "$VB" --engine voxcpm2 --lang "$L" --demo --char Kate --limit 6 2>&1 | tail -1
  node "$VB" --engine voxcpm2 --lang "$L" --demo --char Varga --limit 6 2>&1 | tail -1
done
echo "PILOT_VOX_TOPUP_DONE"
