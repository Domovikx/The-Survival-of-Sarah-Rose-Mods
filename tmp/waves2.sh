#!/bin/bash
# QA-волны ДЕМО-скоупа (1 019 строк) по non-ru языкам: судья → ремонт → контроль.
# Политика 2026-11-09: в патч идёт только демо для не-ru языков — QA то, что шиппится.
# Запуск: bash tmp/waves2.sh 2>&1 | tee tmp/waves2.log
set -u
cd "$(dirname "$0")/.." || exit 1
R=".opencode/skills/translate"
IDX="tmp/demo_scope_idx.txt"

for L in fr it ja ko pl pt zh de es; do
  echo "########## $L: $(date '+%H:%M:%S')"
  node "$R/translate_judge.mts" "$L" 999999 --file "$IDX" > "tmp/demo_judge_$L.log" 2>&1
  tail -1 "tmp/demo_judge_$L.log"
  grep -oE "СУДЬЯ-BAD \[[0-9]+\]" "tmp/demo_judge_$L.log" | grep -oE "[0-9]+" | sort -n -u > "tmp/demo_bad_$L.txt"
  BAD=$(wc -l < "tmp/demo_bad_$L.txt")
  echo "$L: флагов $BAD → ремонт"
  if [ "$BAD" -gt 0 ]; then
    node "$R/translate_run.mts" "$L" --retrans "tmp/demo_bad_$L.txt" 2>&1 | tail -1
    node "$R/translate_judge.mts" "$L" 999999 --file "tmp/demo_bad_$L.txt" 2>&1 | tail -1
  fi
  echo -n "$L ревью: "; node "$R/translate_review.mts" "$L" 2>&1 | tail -1
  npm run po:check --silent 2>&1 | tail -1
done
echo "WAVES2_ALL_DONE"
