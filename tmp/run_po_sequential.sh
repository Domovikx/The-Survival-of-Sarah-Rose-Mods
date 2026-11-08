#!/bin/bash
# Последовательный po-перевод 8 языков (хочок владельца 2026-11-01: 1 язык
# за раз — проще отслеживать). Один язык --concurrency 4 = те же 4 слота
# parallel LM Studio, что и раньше делили 8 параллельных языков.
# Запуск детачем: bash tmp/run_po_sequential.sh (журнал — tmp/po_sequential.log)
cd "C:/Users/Domo/workspace/The-Survival-of-Sarah-Rose-Mods" || exit 1
for lang in de fr it ja ko pl pt zh; do
  echo "$(date -u +%H:%M:%S) старт $lang" >> tmp/po_sequential.log
  node .opencode/skills/renpy-po/po_translate.mts --lang "$lang" --concurrency 4 >> "patches/ai-voice-pack/po/$lang.out.log" 2>&1
  echo "$(date -u +%H:%M:%S) финиш $lang (exit $?)" >> tmp/po_sequential.log
done
echo "$(date -u +%H:%M:%S) ВСЕ 8 ЯЗЫКОВ ГОТОВЫ" >> tmp/po_sequential.log
