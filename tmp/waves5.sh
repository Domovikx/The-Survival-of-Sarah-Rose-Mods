#!/bin/bash
# Финальная контрольная волна (2026-11-09/10): итерация 6 + Фаза C (tl + пакет).
# Запуск: bash tmp/waves5.sh 2>&1 | tee tmp/waves5.log
set -u
cd "$(dirname "$0")/.." || exit 1
R=".opencode/skills/translate"
IDX="tmp/demo_scope_idx.txt"

echo "----- итерация 6 (финал): $(date '+%H:%M:%S')"
for L in fr it ja ko pl pt zh de es; do
  node "$R/translate_judge.mts" "$L" 999999 --file "$IDX" > "tmp/q6_judge_$L.log" 2>&1
  grep -oE "СУДЬЯ-BAD \[[0-9]+\]" "tmp/q6_judge_$L.log" | grep -oE "[0-9]+" | sort -n -u > "tmp/q6_bad_$L.txt"
  N=$(wc -l < "tmp/q6_bad_$L.txt")
  echo "$L: bad $N ($(date '+%H:%M:%S'))"
  if [ "$N" -gt 0 ]; then
    node "$R/translate_run.mts" "$L" --retrans "tmp/q6_bad_$L.txt" 2>&1 | tail -1
  fi
  echo -n "$L ревью: "; node "$R/translate_review.mts" "$L" 2>&1 | tail -1
  npm run po:check --silent 2>&1 | tail -1
done

echo "===== C: пересборка tl + пакет $(date '+%H:%M:%S')"
node .opencode/skills/renpy-po/po2tl.mts ru 2>&1 | head -1
for L in de es fr it ja ko pl pt zh; do
  node .opencode/skills/renpy-po/po2tl.mts "$L" --demo 2>&1 | head -1
done
npm run build:pack 2>&1 | tail -4
echo "WAVES5_ALL_DONE"
