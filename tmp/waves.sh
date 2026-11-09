#!/bin/bash
# Улучшательные волны по non-ru po: судья по заполненным → --retrans → контроль.
# Порядок: от малых языков к большим (быстрые победы сначала).
# Запуск: bash tmp/waves.sh 2>&1 | tee tmp/waves.log
set -u
cd "$(dirname "$0")/.." || exit 1
R=".opencode/skills/translate"

for L in fr it ja ko pl pt zh de es; do
  echo "########## $L: $(date '+%H:%M:%S')"
  # индексы заполненных (без speaker-name)
  node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const { parsePo } = await import('./.opencode/skills/renpy-po/po_core.mts');
const e = parsePo(readFileSync('patches/ai-voice-pack/po/$L.po','utf8').replace(/\r\n/g,'\n')).filter(x=>x.msgid);
const idx = [];
for (let i=0;i<e.length;i++) if (e[i].msgstr.trim() && e[i].msgctxt!=='speaker-name') idx.push(i);
writeFileSync('tmp/filled_$L.txt', idx.join('\n'));
console.log('заполненных: '+idx.length);
"
  node "$R/translate_judge.mts" "$L" 999999 --file "tmp/filled_$L.txt" > "tmp/wave_judge_$L.log" 2>&1
  tail -1 "tmp/wave_judge_$L.log"
  grep -oE "СУДЬЯ-BAD \[[0-9]+\]" "tmp/wave_judge_$L.log" | grep -oE "[0-9]+" | sort -n -u > "tmp/wave_bad_$L.txt"
  BAD=$(wc -l < "tmp/wave_bad_$L.txt")
  echo "$L: флагов $BAD → ремонт"
  if [ "$BAD" -gt 0 ]; then
    node "$R/translate_run.mts" "$L" --retrans "tmp/wave_bad_$L.txt" 2>&1 | tail -1
    node "$R/translate_judge.mts" "$L" 999999 --file "tmp/wave_bad_$L.txt" 2>&1 | tail -1
  fi
  echo -n "$L ревью: "; node "$R/translate_review.mts" "$L" 2>&1 | tail -1
  npm run po:check --silent 2>&1 | tail -1
done
echo "WAVES_ALL_DONE"
