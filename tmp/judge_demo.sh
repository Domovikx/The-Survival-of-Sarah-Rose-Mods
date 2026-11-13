#!/usr/bin/env bash
# Полный аудит 9 демо-po (≈1958 строк каждый): 4 параллельные полосы (LM Studio PARALLEL=4).
set -u
cd "C:/Users/Domo/workspace/The-Survival-of-Sarah-Rose-Mods" || exit 1
export TSSR_LLM=lmstudio
export TSSR_LLM_MODEL=index-translate-9b

run_lang() {
  local L="$1"
  node .opencode/skills/translate/translate_judge.mts "$L" 2000 --spread --variant v13 \
    > "tmp/judge_$L.log" 2>&1
}

wave() {
  for L in "$@"; do run_lang "$L" & done
  wait
}

wave de es fr it
wave pl pt ko zh

# ja — делим на 4 куска, чтобы добить последнюю волну всеми полосами.
node tmp/ja_parts.mts || exit 1
for k in 0 1 2 3; do
  node .opencode/skills/translate/translate_judge.mts ja 0 --file "tmp/ja_part$k.txt" --variant v13 \
    > "tmp/judge_ja_part$k.log" 2>&1 &
done
wait
cat tmp/judge_ja_part0.log tmp/judge_ja_part1.log tmp/judge_ja_part2.log tmp/judge_ja_part3.log > tmp/judge_ja.log

echo "=== ГОТОВО $(date -Iseconds)"
for L in de es fr it pl pt ko zh ja; do
  echo "--- $L"; grep -E "^СУДЬЯ: bad|не разобрано" "tmp/judge_$L.log" | tail -1
done
