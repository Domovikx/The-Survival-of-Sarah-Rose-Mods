# Архитектура voice_candidates — v3 (РЕАЛИЗОВАНО 2026-09-02)

> Итог обсуждения (v1: варианты A/B/C → v2: фидбэк → v3: реализация).
> Миграция выполнена: `refs/` упразднён, файлы в папках персонажей,
> `voice_sync.py` актуализирует структуру и отчёты.

---

## Структура (папка персонажа)

```text
voice_candidates/{Name}/
  {Name}.yaml              # КОНТРАКТ (pydantic) + отчёт-поля скриптов
  generated/               # СЫРЬЁ: voice_design.py пишет сюда 01.mp3..NN.mp3
  gen_selected/            # ОТБОР: вручную лучшие ({Name}.mp3 — один топ-файл)
  in_progress/             # РАБОЧИЕ рефы: add_candidate (нарезка 10с + чистка),
                           #   A/B-варианты, эксперименты с фильтрами
  ref/                     # ФИНАЛ: {Name}.wav — единственное, что видит система
```

Конвейер строго односторонний: `generated → gen_selected → in_progress → ref`.

## Схема потока

```text
 voice_design --char Alaric
        │
        ▼
 generated/  01.mp3 .. 06.mp3            ← сырьё (авто)
        │  слушаешь, копируешь лучшие
        ▼
 gen_selected/  Alaric.mp3               ← отбор (вручную, один топ-файл)
        │  add_candidate --only Alaric (нарезка 10с + чистка)
        ▼
 in_progress/  Alaric_1.wav ...          ← рабочие (A/B, фильтры)
        │  A/B: voice_batch --ref .../in_progress/Alaric_1.wav
        ▼
 ref/  Alaric.wav                        ← финал (voice_manage select)
        │  config/voices.yaml:
        │    ref: voice_candidates/Alaric/ref/Alaric.wav
        ▼
 voice_batch --char Alaric → ai_voice/ru/{arc}/{uid}__Alaric.opus
```

## Роли папок

| Стадия       | Папка           | Кто пишет                 | Кто читает                                             |
| ------------ | --------------- | ------------------------- | ------------------------------------------------------ |
| Сырьё        | `generated/`    | voice_design (авто)       | человек                                                |
| Отбор        | `gen_selected/` | человек                   | add_candidate                                          |
| Рабочие рефы | `in_progress/`  | add_candidate, clean_refs | voice_batch `--ref`, voice_manage, voice_preview       |
| Финал        | `ref/`          | voice_manage `select`     | voice_batch (voices.yaml), voice_manage, voice_preview |

## Контракт {Name}.yaml

Контрактные поля (строгие): `name`, `gender`, `age`, `who`, `instruct_en`,
`texts` (≥1 для генерации). Отчёт-поля — свободные (`extra='allow'`):
скрипты дописывают свои (`status`, `last_run`, ...) без правок контракта.

Валидация: pydantic v2 (`tools/voicekit/contract.py`), JSON Schema экспортирована
в `voice_candidates/cast_schema.json` (автокомплит yaml в VS Code через
`.vscode/settings.json` → `yaml.schemas`).

## Актуализатор: voice_sync.py

Слои-источники: каталог (`catalog/voices.json` — кто есть в игре),
`voice_candidates/` (кто в работе), `config/voices.yaml` (кого озвучиваем —
единственный рубильник генерации).

| Команда             | Что делает                                                                 |
| ------------------- | -------------------------------------------------------------------------- |
| `status`            | сводка слоёв + расхождения (console)                                       |
| `update [--apply]`  | структура + yaml-заглушки новым персонажам, сводка voice_candidates.yaml   |
| `migrate [--apply]` | переезд refs/ → папки (одноразовый, выполнен 2026-09-02)                   |
| `report`            | missing_voices.md + voice_sync_report.md (NEW/READY/BROKEN/FOREIGN/ORPHAN) |

Безопасность: create-if-missing, ничего не удаляет и не перетирает,
`--apply` = реальные изменения (по умолчанию только план).

## Инструменты (ядро tools/voicekit/)

| Модуль        | Роль                                                             |
| ------------- | ---------------------------------------------------------------- |
| `paths.py`    | ВСЯ раскладка в одном месте (скриптам запрещено хардкодить пути) |
| `catalog.py`  | voices.json / voices.yaml / каст — единая загрузка без дублей    |
| `contract.py` | pydantic-модель каста, валидация, экспорт JSON Schema            |
| `fs.py`       | безопасные операции: create-if-missing, dry-run, лог             |
| `tts_env.py`  | пути моделей/приложений (env-переопределяемые)                   |

Переписаны на ядро: `voice_sync.py` (новый), `voice_design.py`, `add_candidate.py`,
`voice_manage.py`, `voice_batch.py`, `voice_runtime_map.py`, `voice_preview.py`.
Удалены: `voice_status.py`, `voice_design_stats.py` (функции ушли в voice_sync).
Аудио-функции без изменений: `clean_refs.py`, `levelnorm.py`, `trim_tail_burst.py`.
`voice_catalog.py` — пересборка каталога только при апдейте игры (проверен,
идемпотентен).

## Итоги миграции (2026-09-02)

- 40 wav из `refs/` → по папкам (37 активных в `ref/`, 4 варианта в
  `in_progress/`), сверено 40/40, ничего не потеряно
- `Carolyn_1.wav` → фиксация: `Carolyn/ref/Carolyn.wav` + оригинал в
  `in_progress/`; Samayra → реф Carolyn (intentional, голос устраивает)
- Починены битые ref: Duke Antonio, Marshal Edmond (указывали на
  несуществующие `_1.wav`)
- 11 новых персонажей из каталога получили структуру + yaml-заглушки
- mp3: сырьё → `generated/`, отобранные → `gen_selected/`
- Тесты: 37 (voicekit, voice_sync, voice_manage, voice_batch, pipeline)

## Открытые вопросы

- Gorak (Gorak_u3.wav) и Raza (Raza_u5.wav) — рабочие рефы в in_progress/,
  в voices.yaml не подключены (решение за человеком)
- EN-рефы голосов; формат WAV vs OGG; fallback RU/EN — без изменений
