#!/bin/bash
# po_repair_chain.sh — цепочка блоков po_repair_full до исчерпания очереди.
# Каждый блок (по умолчанию 5000 строк) завершается автотчётом-отчётом,
# дальше блоки идут без пауз (решение владельца 2026-11-03).
# Остановка: убить этот процесс — журнал append-only, прогресс не теряется.
set -u
LANG_="${1:-ru}"
BLOCK="${2:-5000}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$REPO/tmp/po_repair_full_${LANG_}_chain.log"
cd "$REPO" || exit 1

n=0
while :; do
  n=$((n + 1))
  echo "=== блок #$n (limit $BLOCK) старт $(date +%H:%M:%S) ===" >>"$LOG"
  out=$(node .opencode/skills/renpy-po/po_repair_full.mts --lang "$LANG_" --limit "$BLOCK" --concurrency 8 2>&1)
  rc=$?
  printf '%s\n' "$out" >>"$LOG"
  if [ $rc -ne 0 ]; then
    echo "=== ОШИБКА в блоке #$n (rc=$rc) $(date +%H:%M:%S) ===" >>"$LOG"
    exit 1
  fi
  case "$out" in
    *"нечего делать"*)
      echo "=== ГОТОВО: очередь исчерпана, блоков $n, $(date +%H:%M:%S) ===" >>"$LOG"
      exit 0
      ;;
  esac
  echo "" >>"$LOG"
done
