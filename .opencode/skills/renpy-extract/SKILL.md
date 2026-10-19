---
name: renpy-extract
description: Извлечение текстов из оригинала Ren'Py и декомпозиция переводов на семантические части по аркам/сценам
license: MIT
compatibility: opencode
metadata:
  engine: renpy
  task: extraction
  source: https://www.renpy.org/doc/html/translation.html
---

## Overview

Этот скил предоставляет инструменты для работы с переводами Ren'Py игр:

1. **extract_texts.mts** — извлечение текстов из оригинальных файлов в формат `translate ru strings:` (old/new)

## Структура данных

### Оригинальная игра

```text
game/
├── script.rpy          # Основной скрипт (66k+ блоков перевода)
├── screens.rpy         # Экраны
├── options.rpy         # Опции
├── prosalaric.rpy      # Персонажи / мировая информация
├── gui.rpy             # UI
├── language.rpy        # Язык
├── language_switcher.rpy
├── new_gallery.rpy     # Галерея
├── art.rpy             # Арт
└── tl/ru/              # Сгенерированные переводы
```

### Структура переводов (генерируется)

```text
game/tl/ru/
├── Prologue/
│   ├── OpeningScene.rpy
│   ├── OpeningSceneEvening.rpy
│   └── ...
├── WarriorPath/
├── MagePath/
├── SailorPath/
├── ... (19 арок)
├── screens.rpy          # UI-строки
└── misc_strings.rpy     # Имена персонажей + define строки
```

## extract_texts.mts

### Использование

```bash
node extract_texts.mts extract      # Извлечение текстов
node extract_texts.mts verify       # Проверка целостности
node extract_texts.mts stats        # Статистика переводов
```

### Выходной формат

```text
game/tl/ru/{ArcName}/{SceneName}.rpy
```

Пример файла:

```rpy
# -*- encoding: utf-8 -*-
# Arc: Prologue | Scene: OpeningScene
# Source: .../script.rpy

translate ru strings:

    old "King Orwell has returned from his travels..."
    new "King Orwell has returned from his travels..."

    old "Finally, home again."
    new "Finally, home again."
```

### Типы блоков

| Тип              | Описание                                                       | Куда попадает      |
| ---------------- | -------------------------------------------------------------- | ------------------ |
| `dialogue`       | Реплика персонажа: `Character "text"` или `"Character" "text"` | В файл арки/сцены  |
| `narration`      | Нарратив: `"text"` (одиночные кавычки)                         | В файл арки/сцены  |
| `menu_choice`    | Вариант меню: `"Choice":`                                      | В файл арки/сцены  |
| `ui_string`      | Строка интерфейса: `_("text")`                                 | `screens.rpy`      |
| `character_name` | Имя персонажа: `Character(_("Name"), ...)` или `"Name" "text"` | `misc_strings.rpy` |
| `define_string`  | Define: `define x = _("text")`                                 | `misc_strings.rpy` |

### Особенности: `"Character" "text"`

Диалоги в формате `"Character" "text"` (имя персонажа в кавычках) корректно разделяются:

- Текст реплики идёт в файл сцены как `dialogue`
- Имя персонажа автоматически добавляется в `character_blocks` и попадает в `misc_strings.rpy` как переводимое имя

Это решает проблему, когда `Barkeeper` или другие quoted-персонажи отсутствовали в character names.

### Структура арок

| Arc Name        | Содержит                                                |
| --------------- | ------------------------------------------------------- |
| Prologue        | OpeningScene, OpeningSceneEvening, start                |
| WarriorPath     | WarriorPath1-5, WarriorRahayal, WarriorQueen            |
| SailorPath      | SailorPath1-10, LifeInRahayal                           |
| MagePath        | MagePath1-12, MageInTheRuins                            |
| HassarPath      | HassarPath1-5, JaeidPath                                |
| UnionKingdom    | UnionKingdom1-13, UnionLoop                             |
| BlackMonolith   | TheBlackMonolithWarrior, TheBlackMonolithMage           |
| HollowWorld     | TheHollowWorldWarrior, TheHollowWorldMage               |
| Training        | TrainingPathKate, TrainingPathCaleb, TrainingPathAtilla |
| StoryBeginnings | DayOfTheFuneral, MeetingOnTheBattlements, etc.          |

### Дедупликация

Блоки дедуплицируются глобально по тексту оригинала (normalized strip). Если одна и та же фраза встречается в разных сценах, она попадёт только в первый встреченный файл (по алфавиту). Скрипт `renpy-dedup` очищает дубликаты в `tl/ru/`.

## Workflow

```text
1. node extract_texts.mts extract      → Извлечение всех текстов в game/tl/ru/
2. Переводчики редактируют new "..." в файлах арк
3. node extract_texts.mts verify       → Проверка прогресса
4. Запуск dedup при необходимости      → node dedup_translations.mts
```

## Проверка консистентности

```bash
node extract_texts.mts verify
```

Выводит:

- Total strings
- Translated / Untranslated
- Progress percentage

## Тесты

- `extract_texts.test.mts` — юнит-тесты парсера/генератора.
- `update_pipeline.test.mts` — E2E-тест полного цикла «апдейт игры» на фикстурах: появилась/изменилась/удалилась строка → `RenPyExtractor.scan` → `generateRpy` (переводы сохраняются, удалённые выпадают) → счётчики непереведённых → CLI `dedup_translations.mts --project` (поиск `<project>/game/tl/ru`) → `verifyIntegrity` до 100%. Запуск: `node --test` в каталоге скилла.

## Источники

- Ren'Py Translation Documentation: https://www.renpy.org/doc/html/translation.html
