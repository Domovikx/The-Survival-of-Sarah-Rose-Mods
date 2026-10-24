---
name: lmstudio-ctl
description: Старт/остановка/статус локального LLM-сервера LM Studio (127.0.0.1:1234, qwen/qwen3.5-9b) для подзадач агента. Запускай ЛЛМ ПЕРЕД задачей локальному сабагенту (например, ревью текста), после проверки результата ОБЯЗАТЕЛЬНО останавливай, чтобы не жрать VRAM/ CPU фоново. Используй когда пользователь говорит "запусти локальный ллм", "лм студио", "подними qwen", "заглуши ллм", "освободи видеокарту", или перед/после запуска сабагента с моделью lmstudio-local.
license: MIT
compatibility: opencode
metadata:
  task: local-llm-lifecycle
---

## What I do

Управляю жизненным циклом локального LLM-сервера LM Studio в режиме
«задача → проверка → глушим».

Железо: RTX 5070 Ti 16 ГБ. Модель `qwen/qwen3.5-9b` (~6.1 ГБ VRAM).
Сервер: **http://127.0.0.1:1234** (OpenAI-compatible /v1; ВСЕГДА 127.0.0.1,
не localhost).

## Жизненный цикл (порядок обязателен)

```text
1. start     — поднять сервер + загрузить модель
2. status    — дождаться готовности (иначе сабагент упадёт)
3. задача    — запуск сабагента с model: "lmstudio-local/qwen/qwen3.5-9b"
4. проверка  — владелец/я проверяем результат сабагента
5. stop      — глушим: выгрузить модель + остановить сервер (свободить VRAM)
```

НИКОГДА не оставляй сервер запущенным «на всякий случай» —6 ГБ VRAM
и сотни МБ RAM вхолостую.

## Команды

```bash
# 1. Старт (сервер + модель; модель грузится ~5-9 с)
powershell -File patches/ai-voice-pack/tools/generate/scripts/start-lmstudio.cmd
# или вручную:
lms server start
lms load qwen/qwen3.5-9b --gpu max

# 2. Статус (готов, когда server running + модель loaded)
lms server status
lms ls
curl -s http://127.0.0.1:1234/v1/models   # должно вернуть список моделей

# 3. Остановка (ВЫГРУЗИТЬ модель, потом погасить сервер)
powershell -File patches/ai-voice-pack/tools/generate/scripts/stop-lmstudio.cmd
# или вручную:
lms unload --all
lms server stop
```

CLI: `~/.lmstudio/bin/lms.exe` (winget-установка, v0.4.26).

## Проверка «никто другой не использует»

Перед stop — убедись, что сабагент/скрипт закончили работу: никаких активных
запросов к `/v1/chat/completions`. Практика: сабагент завершён → его отчёт
получен → только потом stop.

## Troubleshooting

- Сервер «running», но `/v1/models` недоступен → подожди 3-5 с, повтори;
  при отсутствии — `lms server stop && lms server start`.
- Модель не загрузилась (VRAM занята) → освободи VRAM (закрой игры/другие
  LLM), повтори `lms load`.
- Провайдера `lmstudio-local` нет в opencode → правка
  `~/.config/opencode/opencode.json` + перезапуск opencode; проверь
  `opencode.jsonc` (перекрывает .json, может содержать disabled_providers).
