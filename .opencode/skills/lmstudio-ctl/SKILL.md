---
name: lmstudio-ctl
description: Жизненный цикл локальных LLM (Strata :8080, Colibri :8000, LM Studio :1234) — старт/статус/стоп через пульт scripts/llm_backend.mts. Запускай ЛЛМ ПЕРЕД задачей локальному сабагенту или пайплайну (переводы, разметка эмоций), после проверки результата ОБЯЗАТЕЛЬНО останавливай, чтобы не жрать VRAM/RAM фоново. Используй когда пользователь говорит "запусти локальный ллм", "подними страту/калибри/лмстудио", "заглуши ллм", "освободи видеокарту", "какой ллм запущен", или перед/после запуска сабагента с моделью strata-local/colibri-local/lmstudio-local.
license: MIT
compatibility: opencode
metadata:
  task: local-llm-lifecycle
---

## What I do

Управляю жизненным циклом локальных LLM-бэкендов в режиме «задача →
проверка → глушим». **Пульт один**: `scripts/llm_backend.mts` (реестр,
переключение активного бэкенда, проба портов).

Железо: RTX 5070 Ti 16 ГБ — бэкенды НЕ работают параллельно (каждый жрёт
~15 ГБ VRAM). Всегда: один активный LLM + ничего тяжёлого больше.

| Бэкенд       | Порт | Модель                     | Когда                                                                               |
| ------------ | ---- | -------------------------- | ----------------------------------------------------------------------------------- |
| **strata**   | 8080 | qwen3.6-35b-a3b-ud-q4_k_xl | основной пайплайн (po-переводы), лучшая скорость (6 с/зап)                          |
| **colibri**  | 8000 | qwen3.6-colibri            | недельный эксперимент 2026-11-01: RAM вдвое меньше (14 vs 24 ГБ), скорость ~7 с/зап |
| **lmstudio** | 1234 | qwen/qwen3.5-9b            | легаси-бэкенд, чат-сабагенты по старым инструкциям                                  |

Провайдеры opencode: `strata-local/…`, `colibri-local/…`, `lmstudio-local/…`
(в `~/.config/opencode/opencode.json`).

## Пульт (основной инструмент)

```bash
node scripts/llm_backend.mts status     # кто поднят (проба портов) + активный
node scripts/llm_backend.mts show       # активный бэкенд + источник (env/config/default)
node scripts/llm_backend.mts list       # реестр
node scripts/llm_backend.mts use colibri  # переключить (пишет tmp/llm_backend.json)
# разовый оверрайд без переключения:
TSSR_LLM=strata node .opencode/skills/renpy-po/po_translate.mts --lang es
```

Приоритет разрешения: CLI-флаги `--base-url/--model` > env `TSSR_LLM_URL/
TSSR_LLM_MODEL` > env `TSSR_LLM=<name>` > конфиг `tmp/llm_backend.json` >
дефолт (strata). Потребители (po_translate, po_judge_check, commit_msg,
emotion_judge, emotion_tag) читают `resolveBackend()` из
`scripts/llm_backend.mts` — **дефолты в их коде НЕ править, переключение
только пультом**.

## Жизненный цикл (порядок обязателен)

```text
1. status    — что уже запущено (не поднимай второй LLM!)
2. start     — поднять активный бэкенд (см. команды ниже)
3. задача    — сабагент с model: "<backend>/<model>" или пайплайн
4. проверка  — владелец/я проверяем результат
5. stop      — глушим полностью (свободить VRAM/RAM)
```

НИКОГДА не оставляй LLM запущенным «на всякий случай»: ~15 ГБ VRAM +
14-24 ГБ RAM вхолостую.

## Команды старта/остановки

```bash
# === STRATA (клиент в %LOCALAPPDATA%\Strata) ===
# ВАЖНО: --parallel 8 ОБЯЗАТЕЛЕН — дефолт «auto» на 16 ГБ карте даёт 1 слот,
# вся очередь сериализуется (first token 10.8с!). --context 16k: 8×32k KV не влезает.
PY="$LOCALAPPDATA/Strata/terminal/current/python/python.exe"
S="$LOCALAPPDATA/Strata/terminal/current/strata.py"
"$PY" "$S" launch --model ud-q4_k_xl --family qwen36 --context 16k \
  --parallel 8 --vision off --tune skip --access local --port 8080   # старт (~90 с, детач)
"$PY" "$S" launch --stop                                  # стоп
"$PY" "$S" status   # контроль: «Slots occupied N/8» — вот НАСТОЯЩАЯ проверка

# === COLIBRI (в %LOCALAPPDATA%\colibri-install) ===
# старт (CUDA, 8 параллельных сеансов; путь к .colibri-каталогу модели):
cmd //c "cd /d %LOCALAPPDATA%\colibri-install && set COLI_CUDA=1 && \
  coli.cmd serve --gpu auto --kv-slots 8 --model \
  C:\Users\Domo\AppData\Local\Strata\Strata-data\models\qwen36-UD-Q4_K_XL\Qwen3.6-35B-A3B-UD-Q4_K_XL.colibri"
cmd //c "cd /d %LOCALAPPDATA%\colibri-install && coli.cmd stop"   # стоп
# MTP (Q36_MTP=1) не помогает — не включать.

# === LM STUDIO ===
powershell -File patches/ai-voice-pack/tools/generate/scripts/start-lmstudio.cmd
powershell -File patches/ai-voice-pack/tools/generate/scripts/stop-lmstudio.cmd
# GUI-процессы LM Studio тоже убить (kill (Get-Process "LM Studio")) — они жрут RAM
```

После старта: `node scripts/llm_backend.mts status` → нужный порт `UP`,
затем smoke `curl <url>/v1/models`.

## Проверка «никто другой не использует»

Перед stop — убедись, что очередь/сабагенты закончили: у po-очереди есть
чистый стоп `npm run po:translate:stop` (дожидается текущей записи, пишет
чекпоинт — запуск потом продолжается с места).

## Troubleshooting

- Порт down при поднятом процессе → подожди 5-10 с (Strata грузит модель
  ~90 с), повтори status.
- Сабагент не видит провайдера → проверь `~/.config/opencode/opencode.json`
  и `opencode.jsonc` (jsonc перекрывает json!); `/reload` в TUI.
- `reasoning_effort: "none"` — ЕДИНСТВЕННЫЙ способ выключить thinking
  (работает и на Strata, и на Colibri; `thinking:{disabled}` — НЕ работает).
  Без него thinking съедает max_tokens → пустой content → ретраи.
- VRAM занята чужим → `node scripts/llm_backend.mts status`: если UP бэкенд,
  которого не должно быть — останови его (команды выше).
