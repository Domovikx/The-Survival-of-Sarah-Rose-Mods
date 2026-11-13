#!/bin/bash
# 7 витринных фраз сайта (demo/manifest.json) x 11 языков — новые Vox-опусы.
# Фразы вне демо-скоупа: uid из манифеста, тексты в po (внесены phrases_to_po).
set -u
cd "$(dirname "$0")/.." || exit 1
VB="patches/ai-voice-pack/tools/generate/scripts/voice_batch.mts"
UIDS="3a192b42302d0aa088a23e7fab29983b f956b1ec4bd1df104cf2ffef7b74c2ac 40e1ba10148e47ddb91fa28114270349 6424451692e133352a89e3703fd872c6 01f7f305172f580ac28500645a639854 fa03c1667916774e3eb9381ac88fba3f 8a58d3fa060638a81c3642a046e5d2b5"

for L in ru en de es fr it ja ko pl pt zh; do
  echo "===== $L: $(date '+%H:%M:%S')"
  # --uid в parseArgs multiple -> повторяющийся флаг (не список после одного)
  node "$VB" --engine voxcpm2 --lang "$L" \
    --uid 3a192b42302d0aa088a23e7fab29983b \
    --uid f956b1ec4bd1df104cf2ffef7b74c2ac \
    --uid 40e1ba10148e47ddb91fa28114270349 \
    --uid 6424451692e133352a89e3703fd872c6 \
    --uid 01f7f305172f580ac28500645a639854 \
    --uid fa03c1667916774e3eb9381ac88fba3f \
    --uid 8a58d3fa060638a81c3642a046e5d2b5 2>&1 | tail -3
done
echo "GEN_PHRASES7_ALL_DONE"
