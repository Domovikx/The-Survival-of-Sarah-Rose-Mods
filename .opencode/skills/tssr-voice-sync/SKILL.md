---
name: tssr-voice-sync
description: Актуализатор и мигратор voice-структуры TSSR (tools/voice_sync.py + ядро tools/voicekit/). Используй, когда нужно: проверить расхождения слоёв озвучки (status), создать структуру/заглушки новым персонажам после апдейта игры (update), пересобрать отчёты missing_voices.md и voice_sync_report.md (report), или мигрировать рефы (migrate). Архитектура: voice_candidates/{Name}/{generated,gen_selected} + {Name}.wav в корне каста.
---

# Skill: tssr-voice-sync — актуализация voice-структуры

Слои озвучки TSSR и тул их синхронизации. Архитектура проекта — в
`AGENTS.md` (читать обязательно).

## Слои (источники правды)

| Слой    | Файл/папка                                 | Роль                                                                 |
| ------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Каталог | `catalog/voices.jsonl`                     | кто есть в игре (пересобирается `voice_catalog.py` при апдейте игры) |
| Касты   | `voice_candidates/{Name}/{Name}.yaml`      | кто в работе (контракт + отчёт)                                      |
| Озвучка | каст-yaml (`who_codes`) + реф `{Name}.wav` | озвучен = есть реф; voices.yaml НЕ существует                        |
| Рефы    | `voice_candidates/{Name}/{Name}.wav`       | активный реф в корне; варианты `{Name}_{v}.wav` рядом                |

## Команды

```bash
python tools/voice_sync.py status              # сводка слоёв + расхождения
python tools/voice_sync.py update --apply      # структура+заглушки новым, сводка
python tools/voice_sync.py report              # missing_voices.md + voice_sync_report.md
python tools/voice_sync.py migrate --apply     # переезд refs/ -> папки (одноразовый, сделан)
```

Без `--apply` — только план (dry-run). Ничего не удаляет и не перетирает.

## Когда что запускать

- **Игра обновилась, появились новые персонажи** → `voice_sync.py update --apply`
  (создаст папки + yaml-заглушки «что искать»), затем `report`.
- **Хочешь увидеть расхождения** (битые ref, чужой голос, висячие рефы) →
  `voice_sync.py status` + `report` → `catalog/voice_sync_report.md`
  (секции NEW/READY/BROKEN/FOREIGN/ORPHAN).
- **Заглушки-чеклист кто без голоса** → `catalog/missing_voices.md` (`report`).
- **Миграция структуры** → `migrate` (уже выполнен 2026-09-02; повторно
  идемпотентен: пустой refs/ → пустой план).

## Ядро tools/voicekit/

```text
voicekit/
  paths.py      # ВСЯ раскладка в одном месте — скриптам запрещено хардкодить пути
  catalog.py    # загрузка voices.jsonl / кастов / gen_voice_list_json
  contract.py   # pydantic-контракт {Name}.yaml + cast_schema.json (IDE-автокомплит)
  fs.py         # безопасные операции (create-if-missing, dry-run, лог)
  tts_env.py    # пути моделей (env-переопределяемые: TSSR_COSY_ROOT, QWEN_TTS_APP, ...)
```

## Тесты

```bash
python -m pytest tests/ -v   # 37 тестов: voicekit, voice_sync, manage, batch, pipeline
```
