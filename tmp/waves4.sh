#!/bin/bash
# Финальная волна (2026-11-09): усиленный ретрай (обратная связь судьи + дословность)
# по «упрямому набору» q3 + догон пустых строк + контрольные итерации + Фаза C.
# Запуск: bash tmp/waves4.sh 2>&1 | tee tmp/waves4.log
set -u
cd "$(dirname "$0")/.." || exit 1
R=".opencode/skills/translate"
IDX="tmp/demo_scope_idx.txt"

echo "===== A1: ретрай упрямого набора с обратной связью $(date '+%H:%M:%S')"
for L in fr it ja ko pl pt zh de es; do
  N=$(wc -l < "tmp/q3_bad_$L.txt" 2>/dev/null || echo 0)
  echo "--- $L ($N строк): $(date '+%H:%M:%S')"
  node "$R/translate_run.mts" "$L" --retrans "tmp/q3_bad_$L.txt" 2>&1 | tail -1
  npm run po:check --silent 2>&1 | tail -1
done

echo "===== A2: догон пустых демо-строк $(date '+%H:%M:%S')"
for L in fr it ja ko pl pt zh de; do
  echo "--- $L: $(date '+%H:%M:%S')"
  node "$R/translate_run.mts" "$L" --demo 2>&1 | tail -1
  npm run po:check --silent 2>&1 | tail -1
done

echo "===== B: контрольные итерации $(date '+%H:%M:%S')"
for ITER in 4 5; do
  echo "----- итерация $ITER: $(date '+%H:%M:%S')"
  for L in fr it ja ko pl pt zh de es; do
    node "$R/translate_judge.mts" "$L" 999999 --file "$IDX" > "tmp/q${ITER}_judge_$L.log" 2>&1
    grep -oE "СУДЬЯ-BAD \[[0-9]+\]" "tmp/q${ITER}_judge_$L.log" | grep -oE "[0-9]+" | sort -n -u > "tmp/q${ITER}_bad_$L.txt"
    N=$(wc -l < "tmp/q${ITER}_bad_$L.txt")
    echo "$L: bad $N ($(date '+%H:%M:%S'))"
    if [ "$N" -gt 0 ]; then
      node "$R/translate_run.mts" "$L" --retrans "tmp/q${ITER}_bad_$L.txt" 2>&1 | tail -1
    fi
    echo -n "$L ревью: "; node "$R/translate_review.mts" "$L" 2>&1 | tail -1
    npm run po:check --silent 2>&1 | tail -1
  done
done

echo "===== C: пересборка tl + пакет $(date '+%H:%M:%S')"
node .opencode/skills/renpy-po/po2tl.mts ru 2>&1 | head -1
for L in de es fr it ja ko pl pt zh; do
  node .opencode/skills/renpy-po/po2tl.mts "$L" --demo 2>&1 | head -1
done
npm run build:pack 2>&1 | tail -4
echo "WAVES4_ALL_DONE"
