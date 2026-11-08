#!/bin/bash
# Возобновление приоритетной перепроверки ru.po (schtask TSSR-ru-judge-23, 23:00).
# Идемпотентен: если Strata/судья уже подняты — не дублирует.
# Точка сохранения: tmp/po_judge_full_ru.jsonl (построчное резюме).
cd "C:/Users/Domo/workspace/The-Survival-of-Sarah-Rose-Mods" || exit 1
LOG=tmp/po_judge_resume.log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [resume] старт" >> "$LOG"

# 1. Судья уже работает? — не дублируем
if powershell -NoProfile -Command 'exit $(if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "po_judge_full" }) { 0 } else { 1 })'; then
  echo "$(date -u +%H:%M:%S) [resume] судья уже запущен — выходим" >> "$LOG"
  exit 0
fi

# 2. Strata: поднять, если API не отвечает (~90 с загрузки)
# LOCALAPPDATA хардкодим с фолбэком: в окружении schtask переменная может не прийти
LA="${LOCALAPPDATA:-C:/Users/Domo/AppData/Local}"
if ! curl -s -m 8 http://127.0.0.1:8080/v1/models >/dev/null 2>&1; then
  echo "$(date -u +%H:%M:%S) [resume] Strata не поднята — старт" >> "$LOG"
  "$LA/Strata/terminal/current/python/python.exe" \
    "$LA/Strata/terminal/current/strata.py" launch \
    --model ud-q4_k_xl --family qwen36 --context 16k --parallel 8 \
    --vision off --tune skip --access local --port 8080 >> "$LOG" 2>&1
fi
# 3. Дождаться готовности API (модель грузится ~90 с)
for i in $(seq 1 40); do
  curl -s -m 5 http://127.0.0.1:8080/v1/models >/dev/null 2>&1 && break
  sleep 5
done
if ! curl -s -m 5 http://127.0.0.1:8080/v1/models >/dev/null 2>&1; then
  echo "$(date -u +%H:%M:%S) [resume] ОШИБКА: Strata не ответила за 200с — выходим" >> "$LOG"
  exit 1
fi

# 4. Судья ru (приоритет!), concurrency 4 — проверенный уровень Strata
nohup node .opencode/skills/renpy-po/po_judge_full.mts --lang ru --concurrency 4 \
  >> tmp/po_judge_full_ru.out.log 2>&1 &
echo "$(date -u +%H:%M:%S) [resume] судья ru запущен (concurrency 4)" >> "$LOG"
echo "$(date -u +%H:%M:%S) [resume] очередь de оставлена ПАУЗОЙ — приоритет у перепроверки" >> "$LOG"
