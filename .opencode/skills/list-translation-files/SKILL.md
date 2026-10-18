---
name: list-translation-files
description: >
  Сканирует .rpy файлы в game/tl/ru/ и показывает, какие арки/файлы переведены,
  а какие ещё содержат непереведённые строки. Выдаёт пути в формате,
  готовом для копирования в translate-arc.md или orchestrator.
  Используй, когда пользователь просит показать статус перевода,
  список непереведённых файлов или узнать, какие арки нужно переводить.
license: MIT
compatibility: opencode
metadata:
  engine: renpy
  task: translation
---

## Что делает

Сканирует все `.rpy` файлы в `game/tl/ru/`, сравнивает каждую пару `old`/`new` и выдаёт один из вариантов:

- **Человекочитаемый отчёт** — по аркам и файлам, с количеством строк и процентами
- **Список путей для копирования** — отфильтрованный по режиму, для вставки в `translate-arc.md` или `orchestrator/SKILL.md`

**Ключевая идея:** если `old == new` — строка ещё не переведена.

## Когда использовать

- Пользователь спрашивает: «какие файлы не переведены?», «статус перевода», «что осталось перевести»
- Нужен список арок/файлов, чтобы передать в `translate-arc.md` или `orchestrator`
- Хочется быстро увидеть общую картину прогресса перевода по всем аркам

## Использование

```bash
node .opencode/skills/list-translation-files/list_translation_files.mjs [mode] [--all]
```

### Режимы

| Режим                | Описание                                     | Для чего                                         |
| -------------------- | -------------------------------------------- | ------------------------------------------------ |
| `status` (по умолч.) | Отчёт по аркам и файлам с подсчётом строк    | Обзор: что сделано, что осталось                 |
| `arcs`               | Только имена папок: `game/tl/ru/<ArcName>`   | Вставить в `translate-arc.md` как `$ARGUMENTS`   |
| `files-untranslated` | Только файлы, где есть непереведённые строки | Передать в `orchestrator` для пакетного перевода |
| `files-all`          | Все `.rpy` файлы                             | Полная инвентаризация                            |
| `arcs-untranslated`  | Арки с неполным переводом + корневые файлы   | Сфокусироваться на том, что нужно делать         |

`--all` / `-a` — в режиме `status` показывает и полностью переведённые файлы (по умолчанию скрыты).

### Примеры

```bash
# Обзор: что осталось перевести
node .opencode/skills/list-translation-files/list_translation_files.mjs

# Полный отчёт, включая готовые файлы
node .opencode/skills/list-translation-files/list_translation_files.mjs status --all

# Список арок для translate-arc.md
node .opencode/skills/list-translation-files/list_translation_files.mjs arcs

# Список непереведённых файлов для orchestrator
node .opencode/skills/list-translation-files/list_translation_files.mjs files-untranslated
```

## Формат вывода

Все режимы для копирования (`arcs`, `files-untranslated`, `files-all`, `arcs-untranslated`) выдают пути относительно корня проекта, по одному на строку:

```text
game/tl/ru/PrisonArc
game/tl/ru/Prologue
```

```text
game/tl/ru/screens.rpy
game/tl/ru/SailorPath/SailorPath10.rpy
```

## Файлы скила

- `list_translation_files.mjs` — скрипт, который сканирует и форматирует
- `list_translation_files.test.mjs` — тесты (запуск: `node --test`)
