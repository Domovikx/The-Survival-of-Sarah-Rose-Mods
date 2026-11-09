#!/bin/bash
# Демо-финализация (скоуп D, 1 951 строк/язык):
#  1) перевод ПУСТЫХ демо-строк (только демо: po — источник очереди);
#  2) QA-волны: судья → --retrans → контроль; итерации, пока падение не остановится.
# Запуск: bash tmp/waves3.sh 2>&1 | tee tmp/waves3.log
set -u
cd "$(dirname "$0")/.." || exit 1
R=".opencode/skills/translate"
IDX="tmp/demo_scope_idx.txt"

echo "===== ФАЗА A: перевод пустых демо-строк $(date '+%H:%M:%S')"
for L in fr it ja ko pl pt zh de; do
  echo "--- $L: $(date '+%H:%M:%S')"
  node "$R/translate_run.mts" "$L" --demo 2>&1 | tail -1
  npm run po:check --silent 2>&1 | tail -1
done

echo "===== ФАЗА B: QA-волны (итерации) $(date '+%H:%M:%S')"
for ITER in 1 2 3; do
  echo "----- итерация $ITER: $(date '+%H:%M:%S')"
  for L in fr it ja ko pl pt zh de es; do
    node "$R/translate_judge.mts" "$L" 999999 --file "$IDX" > "tmp/q${ITER}_judge_$L.log" 2>&1
    BAD=$(tail -1 "tmp/q${ITER}_judge_$L.log" | grep -oE "bad [0-9]+" | grep -oE "[0-9]+")
    echo "$L: bad ${BAD:-?} ($(date '+%H:%M:%S'))"
    grep -oE "СУДЬЯ-BAD \[[0-9]+\]" "tmp/q${ITER}_judge_$L.log" | grep -oE "[0-9]+" | sort -n -u > "tmp/q${ITER}_bad_$L.txt"
    N=$(wc -l < "tmp/q${ITER}_bad_$L.txt")
    if [ "$N" -gt 0 ]; then
      node "$R/translate_run.mts" "$L" --retrans "tmp/q${ITER}_bad_$L.txt" 2>&1 | tail -1
    fi
    echo -n "$L ревью: "; node "$R/translate_review.mts" "$L" 2>&1 | tail -1
    npm run po:check --silent 2>&1 | tail -1
  done
done

echo "===== ФАЗА C: пересборка tl из финального po + пакет $(date '+%H:%M:%S')"
node .opencode/skills/renpy-po/po2tl.mts ru 2>&1 | head -1
for L in de es fr it ja ko pl pt zh; do
  node .opencode/skills/renpy-po/po2tl.mts "$L" --demo 2>&1 | head -1
done
npm run build:pack 2>&1 | tail -4
echo "WAVES3_ALL_DONE"
