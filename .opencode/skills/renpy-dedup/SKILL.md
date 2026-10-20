---
name: renpy-dedup
description: Поиск и удаление дублирующихся old строк в Ren'Py translation файлах. Ren'Py не допускает одинаковые old строки в разных файлах одного перевода — это вызывает исключение. Скрипт сканирует все .rpy файлы в tl/<lang>/ (по умолчанию <project>/game/tl/<lang>, в этом репо — через --tl patches/ai-voice-pack/tl/ru), оставляет первый экземпляр, удаляет дубликаты.
license: MIT
compatibility: opencode
metadata:
  engine: renpy
  task: translations-maintenance
  source: https://www.renpy.org/doc/html/translation.html
---

## What I do

Удаляю дублирующиеся `old`/`new` пары в Ren'Py translation файлах.

### Проблема

Ren'Py выбрасывает исключение, если одна и та же строка `old "..."` встречается
в **разных** файлах одного перевода:

```text
Exception: A translation for "Raza" already exists at game/tl/ru/HyralArc/HyralGoblin.rpy:8.
```

### Решение

Скрипт `dedup_translations.mts`:

1. Сканирует все `.rpy` файлы в целевом tl-каталоге (по умолчанию `<project>/game/tl/<lang>/`; в этом репо — `--tl patches/ai-voice-pack/tl/ru`)
2. Парсит блоки `translate <lang> strings:`
3. Находит одинаковые `old` строки в разных файлах
4. Оставляет первый экземпляр (по алфавиту пути файла)
5. Удаляет дубликаты из остальных файлов

## Использование

```bash
# Дедупликация русского перевода (по умолчанию)
node dedup_translations.mts

# Предпросмотр (без изменений)
node dedup_translations.mts --dry-run

# Другой язык
node dedup_translations.mts --lang de

# Указать корень проекта вручную
node dedup_translations.mts --project /path/to/game

# Указать tl-каталог напрямую (этот репо: переводы не в game/tl/)
node dedup_translations.mts --tl patches/ai-voice-pack/tl/ru

# Подробный вывод
node dedup_translations.mts --verbose
```

## Как это работает

Скрипт обрабатывает только блоки `translate <lang> strings:`:

```rpy
translate ru strings:

    old "Raza"
    new "Раза"
```

При обнаружении дубликата:

- Первый файл по алфавиту — **KEEP** (оставляем)
- Остальные файлы — **DUPLICATE** (удаляем)

## Тесты

```bash
# Запуск тестов из директории скила
cd .opencode/skills/renpy-dedup
node --test dedup_translations.test.mts
```

### Что проверяется

- `parse_translate_blocks` — парсинг translate блоков
- `find_all_entries` — сбор всех old/new пар
- `find_duplicates` — поиск дубликатов
- `deduplicate` — дедупликация (dry-run и реальная)
- `test_integration` — сложные сценарии с 3+ файлами
- Корректность: уникальные строки не удаляются
- Парсинг old/new regex с экранированными кавычками

## Структура файлов

```text
.opencode/skills/renpy-dedup/
├── SKILL.md                      # Этот файл
├── manifest.json                 # Манифест
├── dedup_translations.py         # Основной скрипт (legacy)
├── dedup_translations.mts        # Основной скрипт (Node.js)
├── test_dedup_translations.py    # Тесты (legacy)
└── dedup_translations.test.mts   # Тесты (Node.js)
```

## Примечания

- Дубликаты внутри одного файла не вызывают ошибок в Ren'Py (одинаковый `old` в одном файле допустим)
- Скрипт удаляет `old` + следующую за ней `new` строку
- После удаления чистит множественные пустые строки (максимум 2 подряд)
- Лучше запускать с `--dry-run` перед реальным удалением
